// controllers/adminController.js
import User from '../models/User.js';

export const getPendingVerifications = async (req, res) => {
  try {
    const pending = await User.find({ role: 'female', verificationStatus: 'pending' });
    res.json({ pending });
  } catch (err) {
    res.status(500).json({ message: 'Server error' });
  }
};

export const verifyFemale = async (req, res) => {
  try {
    const { userId, action, adminNote } = req.body;
    // action: 'approve' or 'reject'
    if (!userId || !['approve','reject'].includes(action)) return res.status(400).json({ message: 'Invalid input' });

    const user = await User.findById(userId);
    if (!user) return res.status(404).json({ message: 'User not found' });
    if (user.role !== 'female') return res.status(400).json({ message: 'Not a female user' });

    if (action === 'approve') {
      user.verificationStatus = 'approved';
      user.isVerified = true;
    } else {
      user.verificationStatus = 'rejected';
      user.isVerified = false;
    }
    await user.save();
    res.json({ message: `User ${action}d`, user: { id: user._id, verificationStatus: user.verificationStatus } });
  } catch (err) {
    res.status(500).json({ message: 'Server error' });
  }
};

export const getAllUsers = async (req, res) => {
  const users = await User.find().select('-password');
  res.json({ users });
};
