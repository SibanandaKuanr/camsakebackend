import express from "express";
import authMiddleware from "../middleware/authMiddleware.js";
import {
  sendFriendRequest,
  acceptFriendRequest,
  getFriends,
  getOppositeUsers,
    rejectFriendRequest,
} from "../controllers/friendcontroller.js";

const router = express.Router();

router.post("/request/:id", authMiddleware, sendFriendRequest);
router.post("/accept/:id", authMiddleware, acceptFriendRequest);
router.get("/friends", authMiddleware, getFriends);
router.get("/opposite-users", authMiddleware, getOppositeUsers);
router.post("/reject/:id", authMiddleware, rejectFriendRequest);

export default router;
