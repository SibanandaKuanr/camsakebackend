// server.js
import "dotenv/config";
import { fileURLToPath } from "url";
import { dirname, join } from "path";
import express from "express";
import cors from "cors";
import connectDB from "./config/db.js";
import authRoutes from "./routes/authRoutes.js";
import adminRoutes from "./routes/adminRoutes.js";
import authMiddleware from "./middleware/authMiddleware.js";
import Call from "./models/Call.js";
import User from "./models/User.js";

// Agora token builder
import pkg from "agora-access-token";
const { RtcTokenBuilder, RtcRole } = pkg;

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const app = express();
connectDB();

// middleware
app.use(cors({ origin: "http://localhost:3000", credentials: true }));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use("/uploads", express.static(join(__dirname, "uploads")));

// routes
app.use("/api/auth", authRoutes);
app.use("/api/admin", adminRoutes);

app.get("/", (req, res) => res.send("MERN + Agora backend running"));

// ----------------------------
// CONFIG: Agora
// ----------------------------
const AGORA_APP_ID = process.env.AGORA_APP_ID;
const AGORA_APP_CERTIFICATE = process.env.AGORA_APP_CERTIFICATE;
const AGORA_TOKEN_EXPIRY = parseInt(process.env.AGORA_TOKEN_EXPIRY || "3600", 10);

// ✅ Account-based token generation
function generateAgoraTokenForAccount(
  channelName,
  account,
  role = "publisher",
  expireInSeconds = AGORA_TOKEN_EXPIRY
) {
  const now = Math.floor(Date.now() / 1000);
  const privilegeExpireTs = now + expireInSeconds;
  const rtcRole = role === "publisher" ? RtcRole.PUBLISHER : RtcRole.SUBSCRIBER;

  const token = RtcTokenBuilder.buildTokenWithAccount(
    AGORA_APP_ID,
    AGORA_APP_CERTIFICATE,
    channelName,
    account, // Mongo _id string
    rtcRole,
    privilegeExpireTs
  );
  return token;
}

// ----------------------------
// In-memory matchmaking queues
// ----------------------------
const maleQueue = new Map();
const femaleQueue = new Map();
const activeCalls = new Map();
const pendingMatches = new Map(); // <- missing before

// ----------------------------
// Helper: find match
// ----------------------------
function findMatchForUser(user) {
  if (!user || !user.role) return null;
  if (user.role === "male") {
    const femaleEntry = [...femaleQueue.values()].sort((a, b) => a.joinedAt - b.joinedAt)[0];
    if (femaleEntry) {
      femaleQueue.delete(femaleEntry.user._id.toString());
      maleQueue.delete(user._id.toString());
      return { initiator: user, receiver: femaleEntry.user };
    }
  } else if (user.role === "female") {
    const maleEntry = [...maleQueue.values()].sort((a, b) => a.joinedAt - b.joinedAt)[0];
    if (maleEntry) {
      femaleQueue.delete(user._id.toString());
      maleQueue.delete(maleEntry.user._id.toString());
      return { initiator: maleEntry.user, receiver: user };
    }
  }
  return null;
}

// ----------------------------
// API: Join matchmaking
// ----------------------------
app.post("/api/match/join", authMiddleware, async (req, res) => {
  try {
    const user = req.user;
    if (!user) return res.status(401).json({ ok: false, message: "Unauthorized" });
    if (!["male", "female"].includes(user.role))
      return res.status(400).json({ ok: false, message: "Invalid user role" });

    if (user.role === "female" && !user.isVerified)
      return res.status(403).json({ ok: false, message: "Female must be verified to join" });

    const key = user._id.toString();
    const now = Date.now();

    // if user already has pending match
    const pending = pendingMatches.get(key);
    if (pending) {
      pendingMatches.delete(key);
      console.log(`✅ Pending match delivered to ${user.email}`);
      return res.json(pending);
    }

    // add to queue
    if (user.role === "male") maleQueue.set(key, { user, joinedAt: now });
    else femaleQueue.set(key, { user, joinedAt: now });

    const match = findMatchForUser(user);
    if (!match) {
      console.log(`${user.email} is waiting for a match...`);
      return res.json({ ok: true, waiting: true, message: "Waiting for opposite gender..." });
    }

    // match found → create Agora channel
    const channelName = `ch_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;

    const callDoc = await Call.create({
      caller: match.initiator._id,
      callee: match.receiver._id,
      startedAt: new Date(),
      status: "active",
      metadata: { source: "agora_matchmaking" },
    });

    const initiatorAccount = match.initiator._id.toString();
    const receiverAccount = match.receiver._id.toString();

    const initiatorToken = generateAgoraTokenForAccount(channelName, initiatorAccount);
    const receiverToken = generateAgoraTokenForAccount(channelName, receiverAccount);

    const roomId = `call_${match.initiator._id}_${match.receiver._id}_${Date.now()}`;
    activeCalls.set(roomId, {
      callerId: match.initiator._id.toString(),
      calleeId: match.receiver._id.toString(),
      callDocId: callDoc._id.toString(),
      startedAt: Date.now(),
      channelName,
    });

    const initiatorResponse = {
      ok: true,
      matched: true,
      roomId,
      channelName,
      yourToken: initiatorToken,
      yourAccount: initiatorAccount,
      role: "caller",
      other: {
        _id: match.receiver._id,
        firstName: match.receiver.firstName,
        role: match.receiver.role,
      },
    };

    const receiverResponse = {
      ok: true,
      matched: true,
      roomId,
      channelName,
      yourToken: receiverToken,
      yourAccount: receiverAccount,
      role: "callee",
      other: {
        _id: match.initiator._id,
        firstName: match.initiator.firstName,
        role: match.initiator.role,
      },
    };

    // deliver one now, queue the other
    if (user._id.toString() === match.initiator._id.toString()) {
      pendingMatches.set(match.receiver._id.toString(), receiverResponse);
      console.log(`✅ Match created: ${match.initiator.email} ↔ ${match.receiver.email}`);
      return res.json(initiatorResponse);
    } else {
      pendingMatches.set(match.initiator._id.toString(), initiatorResponse);
      console.log(`✅ Match created: ${match.receiver.email} ↔ ${match.initiator.email}`);
      return res.json(receiverResponse);
    }
  } catch (err) {
    console.error("match join error:", err);
    return res.status(500).json({ ok: false, message: "Server error" });
  }
});

// ----------------------------
// Leave queue
// ----------------------------
app.post("/api/match/leave", authMiddleware, (req, res) => {
  const user = req.user;
  if (!user) return res.status(401).json({ ok: false, message: "Unauthorized" });
  const key = user._id.toString();
  maleQueue.delete(key);
  femaleQueue.delete(key);
  res.json({ ok: true, message: "Left queue" });
});

// ----------------------------
// End call
// ----------------------------
app.post("/api/call/end", authMiddleware, async (req, res) => {
  try {
    const { roomId } = req.body;
    if (!roomId) return res.status(400).json({ ok: false, message: "roomId required" });

    const info = activeCalls.get(roomId);
    if (!info) return res.status(404).json({ ok: false, message: "Active call not found" });

    const duration = Math.floor((Date.now() - info.startedAt) / 1000);

    const callDoc = await Call.findByIdAndUpdate(
      info.callDocId,
      { endedAt: new Date(), durationSeconds: duration, status: "completed" },
      { new: true }
    );

    if (callDoc?.caller) await User.findByIdAndUpdate(callDoc.caller, { $inc: { totalVideoSeconds: duration } });
    if (callDoc?.callee) await User.findByIdAndUpdate(callDoc.callee, { $inc: { totalVideoSeconds: duration } });

    activeCalls.delete(roomId);
    return res.json({ ok: true, message: "Call ended", duration });
  } catch (err) {
    console.error("call end error:", err);
    return res.status(500).json({ ok: false, message: "Server error" });
  }
});

// ----------------------------
// Get fresh Agora token (account-based)
// ----------------------------
app.post("/api/agora/token", authMiddleware, (req, res) => {
  try {
    const { channelName } = req.body;
    if (!channelName)
      return res.status(400).json({ ok: false, message: "channelName required" });

    const account = req.user._id.toString();
    const token = generateAgoraTokenForAccount(channelName, account);
    return res.json({ ok: true, token, channelName, appId: AGORA_APP_ID });
  } catch (err) {
    console.error("agora token error:", err);
    return res.status(500).json({ ok: false, message: "Server error" });
  }
});

// ----------------------------
// Start server
// ----------------------------
const PORT = process.env.PORT || 5000;
app.listen(PORT, () => {
  console.log(`🚀 Server (Agora, account-based) running on port ${PORT}`);
});
