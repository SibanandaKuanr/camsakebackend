// routes/videoRoutes.js
import express from 'express';
import { requireAuth } from '../middleware/auth.js';
import { getCallHistory, reportCall } from '../controllers/videoController.js';

const router = express.Router();

router.get('/history', requireAuth, getCallHistory);
router.post('/report', requireAuth, reportCall);

export default router;
