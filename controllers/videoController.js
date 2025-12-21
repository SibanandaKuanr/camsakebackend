// controllers/videoController.js
import Call from "../models/call.js";
import User from "../models/User.js";

// GET /api/video/history
export const getCallHistory = async (req, res) => {
  try {
    const uid = req.user._id;
    const currentUser = await User.findById(uid).select("friends").lean();

    const calls = await Call.find({ $or: [{ caller: uid }, { callee: uid }] })
      .sort({ createdAt: -1 })
      .limit(100)
      .populate("caller", "firstName lastName email role profilePicture")
      .populate("callee", "firstName lastName email role profilePicture")
      .lean();

    const callsWithOther = calls.map((c) => {
      const isCaller = String(c.caller?._id) === String(uid);
      const otherUser = isCaller ? c.callee : c.caller;

      const rel = currentUser?.friends?.find(
        (f) => String(f.user) === String(otherUser?._id)
      );

      const friendStatus = rel ? rel.status : "not_friends";

      return {
        ...c,
        otherUser,
        friendStatus,
      };
    });

    res.json({ calls: callsWithOther });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Server error' });
  }
};

// POST /api/video/report
export const reportCall = async (req, res) => {
  try {
    const { callId, reason } = req.body;
    // minimal: store report — you might have a Report model. For now just acknowledge.
    // TODO: save to DB and notify admins.
    res.json({ message: 'Report submitted', callId, reason });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Server error' });
  }
};
