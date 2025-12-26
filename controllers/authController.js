// controllers/authController.js
import User from '../models/User.js';
import admin from '../config/firebase.js'; // firebase admin sdk
import path from 'path';
import fs from 'fs';

// Helper to upload video (if using Cloudinary, replace with cloudinary.uploader.upload)
const saveLocalVideoUrl = (file) => {
  if (!file) return null;
  return `/uploads/${file.filename}`; // ensure Express serves /uploads as static
};

export const updateProfile = async (req, res) => {
  try {
    const user = req.user;
    if (!user) return res.status(401).json({ message: 'Unauthorized' });

    const { firstName, lastName, profilePicture, role, dateOfBirth } = req.body;

    // Hard block gender/birthday changes
    if (role || dateOfBirth) {
      return res.status(400).json({ message: 'Gender and birthday cannot be changed' });
    }

    if (typeof firstName === 'string') user.firstName = firstName;
    if (typeof lastName === 'string') user.lastName = lastName;
    if (typeof profilePicture === 'string') user.profilePicture = profilePicture;

    await user.save();

    res.json({
      user: {
        id: user._id,
        email: user.email,
        role: user.role,
        isVerified: user.isVerified,
        firstName: user.firstName,
        lastName: user.lastName,
        dateOfBirth: user.dateOfBirth,
        profilePicture: user.profilePicture,
        subscriptionType: user.subscriptionType || 'free',
        verificationStatus: user.verificationStatus,
        verificationVideoUrl: user.verificationVideoUrl,
      },
    });
  } catch (err) {
    console.error('Update profile error:', err);
    res.status(500).json({ message: 'Server error', error: err.message });
  }
};

export const register = async (req, res) => {
  try {
    const { idToken, role, firstName, lastName, dateOfBirth, profilePicture } = req.body;
    if (!idToken || !role) return res.status(400).json({ message: 'Firebase ID token and role required' });

    // Verify Firebase ID token
    let decodedToken;
    try {
      decodedToken = await admin.auth().verifyIdToken(idToken);
    } catch (error) {
      return res.status(401).json({ error: error.message });
    }

    const email = decodedToken.email;

    // Check if user already exists in our database
    const existing = await User.findOne({ email });
    if (existing) return res.status(400).json({ message: 'User already exists' });

    // Create user in our database
    const userData = { 
      email, 
      role,
      firebaseUid: decodedToken.uid // Store Firebase UID for reference
    };
    if (firstName) userData.firstName = firstName;
    if (lastName) userData.lastName = lastName;
    if (dateOfBirth) userData.dateOfBirth = dateOfBirth;
    if (profilePicture) userData.profilePicture = profilePicture;

    if (role === 'male' || role === 'admin') {
      if (role === 'admin') userData.isAdmin = true;
      userData.isVerified = true;
      userData.verificationStatus = 'not_required';
    } else if (role === 'female') {
      userData.isVerified = false;
      userData.verificationStatus = 'pending';
    } else {
      return res.status(400).json({ message: 'Invalid role' });
    }

    const user = new User(userData);
    await user.save();

    res.status(201).json({
      message: 'User registered successfully',
      idToken, // Return the Firebase ID token
      user: { 
        id: user._id, 
        email: user.email, 
        role: user.role, 
        isVerified: user.isVerified,
        firstname: user.firstName,
        lastname: user.lastName,
        dateOfBirth: user.dateOfBirth,
        firebaseUid: decodedToken.uid,
        profilePicture: user.profilePicture,
        subscriptionType: user.subscriptionType || "free"
      }
    });
  } catch (err) {
    console.error('Register error:', err);
    res.status(500).json({ message: 'Server error', error: err.message });
  }
};

export const login = async (req, res) => {
  try {
    const { idToken } = req.body;
    if (!idToken) return res.status(400).json({ message: 'Firebase ID token required' });

    // Verify Firebase ID token
    let decodedToken;
    try {
      decodedToken = await admin.auth().verifyIdToken(idToken);
    } catch (error) {
      return res.status(401).json({error: error.message });
    }

    // Find user in our database
    const user = await User.findOne({ email: decodedToken.email });
    
    if (!user) {
      return res.status(404).json();
    }

    // Update Firebase UID if not set
    if (!user.firebaseUid) {
      user.firebaseUid = decodedToken.uid;
      await user.save();
    }

    res.json({
      idToken, // Return the Firebase ID token (client will use this)
      user: { 
        id: user._id, 
        email: user.email, 
        role: user.role, 
        isVerified: user.isVerified,
        firstname: user.firstName, 
        lastname: user.lastName,
        dateOfBirth: user.dateOfBirth,
        firebaseUid: decodedToken.uid,
        profilePicture: user.profilePicture,
        subscriptionType: user.subscriptionType || "free"
      }
    });
  } catch (err) {
    console.error('Login error:', err);
    res.status(500).json({ message: 'Server error', error: err.message });
  }
};

// Google Sign-in using Firebase Authentication
export const googleSignIn = async (req, res) => {
  try {
    const { idToken, role, dateOfBirth, firstName, lastName, profilePicture: profilePictureFromClient } = req.body;
    if (!idToken) return res.status(400).json({ message: 'Firebase ID token required' });

    // Verify Firebase ID token
    let decodedToken;
    try {
      decodedToken = await admin.auth().verifyIdToken(idToken);
    } catch (error) {
      return res.status(401).json({error: error.message });
    }

    const email = decodedToken.email;
    // Get user info from Firebase to get profile picture
    let firebaseUser;
    try {
      firebaseUser = await admin.auth().getUser(decodedToken.uid);
    } catch (error) {
      console.error('Error fetching Firebase user:', error);
    }

    const profilePicture = profilePictureFromClient || firebaseUser?.photoURL || decodedToken.picture || null;
    
    let user = await User.findOne({ email });
    const isNewUser = !user;
    
    if (!user) {
      // New user - require role (gender)
      // if (!role) {
      //   return res.status(400).json({ 
      //     message: 'Gender selection is required for new users', 
      //     requiresGender: true 
      //   });
      // }

      // Create new user in database
      user = new User({
        email,
        firstName: firstName || decodedToken.name?.split(' ')[0] || undefined,
        lastName: lastName || decodedToken.name?.split(' ').slice(1).join(' ') || undefined,
        dateOfBirth: dateOfBirth || undefined,
        role: role,
        firebaseUid: decodedToken.uid,
        profilePicture: profilePicture
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
    } else {
      // Existing user - update Firebase UID and profile picture if not set
      if (!user.firebaseUid) {
        user.firebaseUid = decodedToken.uid;
      }
      if (profilePicture) {
        user.profilePicture = profilePicture;
      }
      if (firstName) user.firstName = firstName;
      if (lastName) user.lastName = lastName;

      // Gender and birthday are immutable once set
      if (dateOfBirth && !user.dateOfBirth) {
        user.dateOfBirth = dateOfBirth;
      }
      await user.save();
    }

    res.json({
      idToken, // Return the Firebase ID token (client will use this)
      isNewUser, // Indicate if this was a new user
      user: { 
        id: user._id, 
        email: user.email, 
        role: user.role, 
        isVerified: user.isVerified,
        firstname: user.firstName,
        lastname: user.lastName,
        dateOfBirth: user.dateOfBirth,
        firebaseUid: decodedToken.uid,
        profilePicture: user.profilePicture,
        subscriptionType: user.subscriptionType || "free"
      }
    });
  } catch (err) {
    console.error('Google sign-in error:', err);
    res.status(401).json({ message: 'Authentication failed', error: err.message });
  }
};
const createBackendToken = (userId) => {
  return jwt.sign(
    { id: userId },
    process.env.JWT_SECRET,
    { expiresIn: "7d" } // 👈 expires in 7 days (change as needed)
  );
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
    id: user._id, 
    email: user.email, 
    role: user.role, 
    isVerified: user.isVerified, 
    firstName: user.firstName, 
    lastName: user.lastName,
    dateOfBirth: user.dateOfBirth,
    profilePicture: user.profilePicture,
    subscriptionType: user.subscriptionType || "free",
    verificationStatus: user.verificationStatus, 
    verificationVideoUrl: user.verificationVideoUrl
  }});
};
