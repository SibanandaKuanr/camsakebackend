// routes/authRoutes.js
import { Router } from 'express';

import { register, login, googleSignIn, uploadVerificationVideo, getProfile, updateProfile } from '../controllers/authController.js';
import authMiddleware from '../middleware/authMiddleware.js';
import { single } from '../middleware/uploadMiddleware.js';
const router = Router();

// Register and login
router.post('/register', register);
router.post('/login', login);

// Google sign-in from client: send firebase idToken
router.post('/google', googleSignIn);

// Female upload verification video (protected)
router.post('/upload-verification-video', authMiddleware, single('video'), uploadVerificationVideo);

// get profile
router.get('/me', authMiddleware, getProfile);

// update profile (protected) - only name/photo allowed
router.patch('/profile', authMiddleware, updateProfile);

export default router;

