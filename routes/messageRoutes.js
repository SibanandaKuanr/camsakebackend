import express from "express";
import authMiddleware from "../middleware/authMiddleware.js";
import { messageFile } from "../middleware/uploadMessageMiddleware.js";
import { createClient } from "@supabase/supabase-js";
import User from "../models/User.js";

const router = express.Router();
const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

// Upload file and send message
// Upload file and send message
// Send text message (without file)
router.post("/send-text", authMiddleware, async (req, res) => {
  try {
    const senderId = req.user._id.toString();
    const { receiverId, message } = req.body;

    if (!receiverId || !message) {
      return res.status(400).json({
        ok: false,
        message: "receiverId and message required",
      });
    }

    // Fetch both users
    const [sender, receiver] = await Promise.all([
      User.findById(senderId).select("blockedUsers"),
      User.findById(receiverId).select("blockedUsers"),
    ]);

    if (!sender || !receiver) {
      return res.status(404).json({
        ok: false,
        message: "User not found",
      });
    }

    // 🔒 HARD BLOCK CHECK (BOTH SIDES)
    const senderBlockedReceiver = sender.blockedUsers?.some(
      (id) => id.toString() === receiverId
    );

    const receiverBlockedSender = receiver.blockedUsers?.some(
      (id) => id.toString() === senderId
    );

    if (senderBlockedReceiver || receiverBlockedSender) {
      return res.status(403).json({
        ok: false,
        message: "You cannot message this user",
        blocked: true
      });
    }

    // Insert message to Supabase
    const { data, error } = await supabase
      .from("private_chats")
      .insert([{
        sender_id: senderId,
        receiver_id: receiverId,
        message: message,
        message_type: "text",
      }])
      .select();

    if (error) throw error;

    // ✅ Emit WebSocket event for real-time delivery
    const io = req.app.get("io");
    if (io && data && data[0]) {
      console.log("📡 Emitting message:new event:", data[0]);
      io.emit("message:new", {
        ...data[0],
        senderId: senderId,
        receiverId: receiverId
      });
    }

    return res.json({
      ok: true,
      
      data: data[0],
    });
  } catch (err) {
    console.error("send text message error:", err);
    return res.status(500).json({
      ok: false,
      message: "Server error",
      error: err?.message ?? String(err),
    });
  }
});
router.post("/send", authMiddleware, messageFile("file"), async (req, res) => {
  try {
    const senderId = req.user._id.toString();
    const { receiverId, message, messageType = "text" } = req.body;

    if (!receiverId) {
      return res.status(400).json({
        ok: false,
        message: "receiverId required",
      });
    }

    // Fetch both users
    const [sender, receiver] = await Promise.all([
      User.findById(senderId).select("blockedUsers"),
      User.findById(receiverId).select("blockedUsers"),
    ]);

    if (!sender || !receiver) {
      return res.status(404).json({
        ok: false,
        message: "User not found",
      });
    }

    // 🔒 HARD BLOCK CHECK (BOTH SIDES)
    const senderBlockedReceiver = sender.blockedUsers?.some(
      (id) => id.toString() === receiverId
    );

    const receiverBlockedSender = receiver.blockedUsers?.some(
      (id) => id.toString() === senderId
    );

    if (senderBlockedReceiver || receiverBlockedSender) {
      return res.status(403).json({
        ok: false,
        message: "You cannot message this user",
      });
    }

    // 📎 Handle file upload
    let fileUrl = null;
    let finalMessageType = messageType;

    if (req.file) {
      fileUrl = req.file.path || req.file.secure_url || req.file.url;

      console.log("📤 File uploaded to Cloudinary:", {
        finalUrl: fileUrl,
        mimetype: req.file.mimetype,
      });

      if (req.file.mimetype.startsWith("image/")) {
        finalMessageType = "image";
      } else if (req.file.mimetype.startsWith("video/")) {
        finalMessageType = "video";
      } else if (req.file.mimetype.startsWith("audio/")) {
        finalMessageType = "audio";
      } else if (req.file.mimetype === "application/pdf") {
        finalMessageType = "pdf";
      } else {
        finalMessageType = "document";
      }
    }

    const insertData = {
      sender_id: senderId,
      receiver_id: receiverId,
      message: message || "",
      message_type: finalMessageType,
    };

    if (fileUrl) {
      insertData.file_url = fileUrl;
    }

    const { data, error } = await supabase
      .from("private_chats")
      .insert([insertData])
      .select();

    if (error) throw error;

    // ✅ Emit WebSocket event for real-time delivery
    const io = req.app.get("io");
    if (io && data && data[0]) {
      io.emit("message:new", {
        ...data[0],
        senderId: senderId,
        receiverId: receiverId
      });
    }

    return res.json({
      ok: true,
      
      data: data[0],
    });
  } catch (err) {
    console.error("send message error:", err);
    return res.status(500).json({
      ok: false,
      message: "Server error",
      error: err?.message ?? String(err),
    });
  }
});
//get all the blocked user
// GET all blocked users
router.get("/block/list", authMiddleware, async (req, res) => {
  try {
    const userId = req.user._id;

    const user = await User.findById(userId)
      .populate("blockedUsers", "_id firstName lastName email profilePicture role")
      .select("blockedUsers");

    if (!user) {
      return res.status(404).json({
        ok: false,
        message: "User not found",
      });
    }

    return res.json({
      ok: true,
      blockedUsers: user.blockedUsers,
    });
  } catch (err) {
    console.error("get blocked users error:", err);
    return res.status(500).json({
      ok: false,
      message: "Server error",
    });
  }
});


// Get last message for each friend
router.get("/last-messages", authMiddleware, async (req, res) => {
  try {
    const userId = req.user._id.toString();
    const { data: friends } = await supabase
      .from("private_chats")
      .select("sender_id, receiver_id, message, message_type, file_url, created_at")
      .or(`sender_id.eq.${userId},receiver_id.eq.${userId}`)
      .order("created_at", { ascending: false });

    if (!friends) {
      return res.json({ ok: true, lastMessages: [] });
    }

    // Group by friend and get last message
    const lastMessagesMap = new Map();
    friends.forEach((msg) => {
      const friendId = msg.sender_id === userId ? msg.receiver_id : msg.sender_id;
      if (!lastMessagesMap.has(friendId)) {
        lastMessagesMap.set(friendId, msg);
      }
    });

    res.json({ ok: true, lastMessages: Array.from(lastMessagesMap.values()) });
  } catch (err) {
    console.error("get last messages error:", err);
    return res.status(500).json({ ok: false, message: "Server error" });
  }
});

// Block user
router.post("/block/:userId", authMiddleware, async (req, res) => {
  try {
    const currentUserId = req.user._id;
    const targetUserId = req.params.userId;

    if (String(currentUserId) === String(targetUserId)) {
      return res
        .status(400)
        .json({ ok: false, message: "Cannot block yourself" });
    }

    await User.findByIdAndUpdate(currentUserId, {
      $addToSet: { blockedUsers: targetUserId },
    });

    return res.json({ ok: true, message: "User blocked successfully" });
  } catch (err) {
    console.error("block user error:", err);
    return res.status(500).json({ ok: false, message: "Server error" });
  }
});


// Unblock user
router.post("/unblock/:userId", authMiddleware, async (req, res) => {
  try {
    const currentUserId = req.user._id;
    const targetUserId = req.params.userId;

    await User.findByIdAndUpdate(currentUserId, {
      $pull: { blockedUsers: targetUserId }
    });

    res.json({ ok: true, message: "User unblocked successfully" });
  } catch (err) {
    console.error("unblock user error:", err);
    return res.status(500).json({ ok: false, message: "Server error" });
  }
});

// Report user
router.post("/report/:userId", authMiddleware, async (req, res) => {
  try {
    const { reason, description } = req.body;
    const reporterId = req.user._id;
    const reportedUserId = req.params.userId;

    // In production, save to a reports collection
    console.log(`User ${reporterId} reported user ${reportedUserId}: ${reason} - ${description}`);

    res.json({ ok: true, message: "User reported successfully" });
  } catch (err) {
    console.error("report user error:", err);
    return res.status(500).json({ ok: false, message: "Server error" });
  }
});

// Update online status
router.post("/online", authMiddleware, async (req, res) => {
  try {
    await User.findByIdAndUpdate(req.user._id, {
      isOnline: true,
      lastSeen: new Date()
    });
    res.json({ ok: true });
  } catch (err) {
    console.error("update online status error:", err);
    return res.status(500).json({ ok: false, message: "Server error" });
  }
});

// Update offline status
router.post("/offline", authMiddleware, async (req, res) => {
  try {
    await User.findByIdAndUpdate(req.user._id, {
      isOnline: false,
      lastSeen: new Date()
    });
    res.json({ ok: true });
  } catch (err) {
    console.error("update offline status error:", err);
    return res.status(500).json({ ok: false, message: "Server error" });
  }
});

// Get user online status
router.get("/status/:userId", authMiddleware, async (req, res) => {
  try {
    const user = await User.findById(req.params.userId).select("isOnline lastSeen");
    if (!user) {
      return res.status(404).json({ ok: false, message: "User not found" });
    }

    const lastSeenMs = user.lastSeen ? new Date(user.lastSeen).getTime() : 0;
    const nowMs = Date.now();
    // If user hasn't pinged recently, treat them as offline even if isOnline is still true.
    const ONLINE_TTL_MS = 60 * 1000;
    const isFresh = lastSeenMs > 0 && nowMs - lastSeenMs <= ONLINE_TTL_MS;
    const computedOnline = Boolean(user.isOnline && isFresh);

    // Auto-correct stale sessions
    if (user.isOnline && !computedOnline) {
      user.isOnline = false;
      await user.save();
    }

    res.json({ ok: true, isOnline: computedOnline, lastSeen: user.lastSeen });
  } catch (err) {
    console.error("get status error:", err);
    return res.status(500).json({ ok: false, message: "Server error" });
  }
});

export default router;

