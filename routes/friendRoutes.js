import express from "express";
import authMiddleware from "../middleware/authMiddleware.js";
import {
  sendFriendRequest,
  acceptFriendRequest,
  getFriends,
  getOppositeUsers,
    rejectFriendRequest,
  unfriendUser,
  getFriendlists,
} from "../controllers/friendcontroller.js";

const router = express.Router();

router.post("/request/:id", authMiddleware, sendFriendRequest);
router.post("/accept/:id", authMiddleware, acceptFriendRequest);
router.get("/friends", authMiddleware, getFriendlists);
router.get("/opposite-users", authMiddleware, getOppositeUsers);
router.post("/reject/:id", authMiddleware, rejectFriendRequest);
router.delete("/unfriend/:id", authMiddleware, unfriendUser);

export default router;
