// routes/adminRoutes.js
import { Router } from 'express';

import { getPendingVerifications, verifyFemale, getAllUsers } from '../controllers/adminController.js';
import authMiddleware from '../middleware/authMiddleware.js';
import isAdmin from '../middleware/isAdminMiddleware.js';
const router = Router();
// Protected admin routes
router.get('/pending-verifications', authMiddleware, isAdmin, getPendingVerifications);
router.post('/verify-female', authMiddleware, isAdmin, verifyFemale);
router.get('/users', authMiddleware, isAdmin, getAllUsers);

export default router;
