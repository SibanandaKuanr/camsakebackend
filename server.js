// server.js
import "dotenv/config";
import { fileURLToPath } from "url";
import { dirname, join } from "path";
import express from "express";
import cors from "cors";
import connectDB from "./config/db.js";
import authRoutes from "./routes/authRoutes.js";
import adminRoutes from "./routes/adminRoutes.js";
import friendRoutes from "./routes/friendroutes.js";
import authMiddleware from "./middleware/authMiddleware.js";
import Call from "./models/call.js";
import User from "./models/User.js";

// Agora token builder
import pkg from "agora-access-token";
const { RtcTokenBuilder, RtcRole } = pkg;
import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

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
app.use("/api/friends", friendRoutes);
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
// ----------------------------
// In-memory matchmaking queues
// ----------------------------
const waitingQueue = new Map(); // unified queue
const activeCalls = new Map();
const pendingMatches = new Map();

// ----------------------------
// Helper: find match
// ----------------------------
function findMatchForUser(currentUser) {
  const now = Date.now();

  for (const [key, { user: queuedUser, joinedAt }] of waitingQueue.entries()) {
    if (queuedUser._id.toString() === currentUser._id.toString()) continue;

    // ❌ Skip expired queue entries (wait > 60 sec)
    if (now - joinedAt > 60000) {
      waitingQueue.delete(key);
      continue;
    }

    // ✅ 1. Check gender compatibility
    const currentPref = currentUser.lookingFor || "both";
    const queuedPref = queuedUser.lookingFor || "both";

    const currentMatchesQueued =
      currentPref === "both" || queuedUser.role === currentPref;
    const queuedMatchesCurrent =
      queuedPref === "both" || currentUser.role === queuedPref;

    if (!currentMatchesQueued || !queuedMatchesCurrent) {
      continue; // ❌ Skip — gender preference mismatch
    }

    // ✅ 2. Found a valid match
    waitingQueue.delete(key);
    return { initiator: currentUser, receiver: queuedUser };
  }

  return null; // ❌ No match found yet
}








// ----------------------------
// API: Join matchmaking
// ----------------------------
app.post("/api/match/join", authMiddleware, async (req, res) => {
  try {
    const user = req.user;
    if (!user) return res.status(401).json({ ok: false, message: "Unauthorized" });

    const { lookingFor = "both" } = req.body;
    const key = user._id.toString();
    const now = Date.now();

    // ✅ 1. Check if this user already has a pending match
    const pending = pendingMatches.get(key);
    if (pending) {
      pendingMatches.delete(key);
      console.log(`✅ Pending match delivered to ${user.email}`);
      return res.json(pending);
    }

    // ✅ 2. Create updated user object
    const updatedUser = { ...user.toObject?.() || user, lookingFor };

    // ✅ 3. Add to queue
    waitingQueue.set(key, { user: updatedUser, joinedAt: now });

    // ✅ 4. Try to find a match
    const match = findMatchForUser(updatedUser);

    if (!match) {
      console.log(`${user.email} waiting for a match (${lookingFor})...`);
      return res.json({ ok: true, waiting: true, message: "Waiting..." });
    }

    // ✅ 5. Match found → create Agora room
    const channelName = `ch_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;

    const initiatorAccount = match.initiator._id.toString();
    const receiverAccount = match.receiver._id.toString();

    const initiatorToken = generateAgoraTokenForAccount(channelName, initiatorAccount);
    const receiverToken = generateAgoraTokenForAccount(channelName, receiverAccount);

    const roomId = `call_${initiatorAccount}_${receiverAccount}_${Date.now()}`;

    // ✅ 6. Store both responses
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

    // ✅ 7. Save the receiver's response in pendingMatches
    pendingMatches.set(match.receiver._id.toString(), receiverResponse);

    console.log(
      `✅ Match created: ${match.initiator.email} ↔ ${match.receiver.email}`
    );

    // ✅ 8. Send initiator's response
    return res.json(initiatorResponse);
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
  waitingQueue.delete(key);
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
// Supabase Chat Endpoints
// ----------------------------

// Save a message
app.post("/api/chat/send", authMiddleware, async (req, res) => {
  try {
    const { roomId, receiverId, message } = req.body;
    const senderId = req.user._id.toString();

    if (!roomId || !message)
      return res.status(400).json({ ok: false, message: "roomId and message required" });

    const { data, error } = await supabase
      .from("chats")
      .insert([{ call_room_id: roomId, sender_id: senderId, receiver_id: receiverId, message }])
      .select();

    if (error) throw error;
    return res.json({ ok: true, message: "Message sent", data });
  } catch (err) {
    console.error("chat send error:", err);
    return res.status(500).json({ ok: false, message: "Server error" });
  }
});

// Get all messages for a call
app.get("/api/chat/:roomId", authMiddleware, async (req, res) => {
  try {
    const { roomId } = req.params;

    const { data, error } = await supabase
      .from("chats")
      .select("*")
      .eq("call_room_id", roomId)
      .order("created_at", { ascending: true });

    if (error) throw error;
    return res.json({ ok: true, messages: data });
  } catch (err) {
    console.error("chat fetch error:", err);
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