// controllers/videoController.js
import Call from './models/Call.js';

// GET /api/video/history
export const getCallHistory = async (req, res) => {
  try {
    const uid = req.user._id;
    const calls = await Call.find({ $or: [{ caller: uid }, { callee: uid }] })
      .sort({ createdAt: -1 })
      .limit(100)
      .populate('caller', 'firstName lastName email role')
      .populate('callee', 'firstName lastName email role');
    res.json({ calls });
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
