// routes/videoRoutes.js
import express from 'express';
import authMiddleware from "../middleware/authMiddleware.js";
import { getCallHistory, reportCall } from '../controllers/videoController.js';

const router = express.Router();

router.get('/history', authMiddleware, getCallHistory);
router.post('/report', authMiddleware, reportCall);

export default router;
