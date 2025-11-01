// controllers/authController.js
import bcrypt from 'bcryptjs';
import User from '../models/User.js';
import { signToken } from '../utils/jwt.js';
import admin from '../config/firebase.js'; // firebase admin sdk (for google token verification)
import path from 'path';
import fs from 'fs';
import crypto from 'crypto';

// Encryption helper
const encryptField = (text) => {
  if (!text) return null;
  const iv = crypto.randomBytes(16);
  const cipher = crypto.createCipheriv('aes-256-cbc', Buffer.from(process.env.JWT_ENCRYPTION_KEY, 'hex'), iv);
  let encrypted = cipher.update(text, 'utf8', 'hex');
  encrypted += cipher.final('hex');
  return iv.toString('hex') + ':' + encrypted;
};

// Helper to upload video (if using Cloudinary, replace with cloudinary.uploader.upload)
const saveLocalVideoUrl = (file) => {
  if (!file) return null;
  return `/uploads/${file.filename}`; // ensure Express serves /uploads as static
};

export const register = async (req, res) => {
  try {
    const { email, password, role, firstName, lastName } = req.body;
    if (!email || !role) return res.status(400).json({ message: 'email and role required' });

    const existing = await User.findOne({ email });
    if (existing) return res.status(400).json({ message: 'User already exists' });

    const userData = { email, role };
    if (firstName) userData.firstName = firstName;
    if (lastName) userData.lastName = lastName;

    if (role === 'male' || role === 'admin') {
      if (!password) return res.status(400).json({ message: 'Password required' });
      const salt = await bcrypt.genSalt(10);
      userData.password = await bcrypt.hash(password, salt);
      if (role === 'admin') userData.isAdmin = true;
      userData.isVerified = true;
      userData.verificationStatus = 'not_required';
    } else if (role === 'female') {
      if (password) {
        const salt = await bcrypt.genSalt(10);
        userData.password = await bcrypt.hash(password, salt);
      }
      userData.isVerified = false;
      userData.verificationStatus = 'pending';
    } else {
      return res.status(400).json({ message: 'Invalid role' });
    }

    const user = new User(userData);
    await user.save();

    // Encrypt role and email before signing
    const encryptedRole = encryptField(user.role);
    const encryptedEmail = encryptField(user.email);

    const token = signToken({ id: user._id, role: encryptedRole, email: encryptedEmail });

    res.status(201).json({
      message: 'User registered',
      user: { id: user._id, email: user.email, role: user.role, isVerified: user.isVerified },
      token
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Server error', error: err.message });
  }
};

export const login = async (req, res) => {
  try {
    const { email, password } = req.body;
    if (!email || !password) return res.status(400).json({ message: 'email and password required' });

    const user = await User.findOne({ email });
    if (!user) return res.status(400).json({ message: 'Invalid credentials' });
    if (!user.password) return res.status(400).json({ message: 'Account has no password, maybe login with Google' });

    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) return res.status(400).json({ message: 'Invalid credentials' });

    const encryptedRole = encryptField(user.role);
    const encryptedEmail = encryptField(user.email);

    const token = signToken({ id: user._id, role: encryptedRole, email: encryptedEmail });

    res.json({
      token,
      user: { id: user._id, email: user.email, role: user.role, isVerified: user.isVerified,firstname: user.firstName, lastname: user.lastName }
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Server error' });
  }
};

// Google Sign-in remains the same but add encryption before token creation
export const googleSignIn = async (req, res) => {
  try {
    const { idToken, role } = req.body;
    if (!idToken) return res.status(400).json({ message: 'idToken required' });

    const decoded = await admin.auth().verifyIdToken(idToken);
    const email = decoded.email;

    let user = await User.findOne({ email });
    if (!user) {
      user = new User({
        email,
        firstName: decoded.name?.split(' ')[0] || undefined,
        lastName: decoded.name?.split(' ').slice(1).join(' ') || undefined,
        role: role || 'male'
      });

      if (user.role === 'admin') user.isAdmin = true;
      if (user.role === 'male') {
        user.isVerified = true;
        user.verificationStatus = 'not_required';
      } else if (user.role === 'female') {
        user.isVerified = false;
        user.verificationStatus = 'pending';
      }
      await user.save();
    }

    const encryptedRole = encryptField(user.role);
    const encryptedEmail = encryptField(user.email);

    const token = signToken({ id: user._id, role: encryptedRole, email: encryptedEmail });

    res.json({
      token,
      user: { id: user._id, email: user.email, role: user.role, isVerified: user.isVerified }
    });
  } catch (err) {
    console.error(err);
    res.status(401).json({ message: 'Invalid idToken', error: err.message });
  }
};




// Female uploads verification video
// uploadMiddleware should put file in req.file
export const uploadVerificationVideo = async (req, res) => {
  try {
    const user = req.user;
    if (!user) return res.status(401).json({ message: 'Unauthorized' });
    if (user.role !== 'female') return res.status(400).json({ message: 'Only female users upload verification' });

    if (!req.file) return res.status(400).json({ message: 'Video file required' });

    // Save local or upload to cloud
    const videoUrl = saveLocalVideoUrl(req.file);
    user.verificationVideoUrl = videoUrl;
    user.verificationStatus = 'pending';
    user.isVerified = false;
    await user.save();

    res.json({ message: 'Video uploaded, awaiting admin verification', verificationStatus: user.verificationStatus, videoUrl });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Server error', error: err.message });
  }
};

export const getProfile = async (req, res) => {
  const user = req.user;
  res.json({ user: {
    id: user._id, email: user.email, role: user.role, isVerified: user.isVerified,
    verificationStatus: user.verificationStatus, verificationVideoUrl: user.verificationVideoUrl
  }});
};
