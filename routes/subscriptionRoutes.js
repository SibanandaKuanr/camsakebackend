import express from "express";
import authMiddleware from "../middleware/authMiddleware.js";
import User from "../models/User.js";

const router = express.Router();

// Upgrade to premium (for testing - in production, integrate with payment gateway)
router.post("/upgrade", authMiddleware, async (req, res) => {
  try {
    const user = req.user;
    user.subscriptionType = "premium";
    await user.save();
    
    res.json({ 
      message: "Upgraded to premium successfully",
      subscriptionType: user.subscriptionType 
    });
  } catch (err) {
    console.error("Upgrade error:", err);
    res.status(500).json({ message: "Server error", error: err.message });
  }
});

// Downgrade to free (for testing)
router.post("/downgrade", authMiddleware, async (req, res) => {
  try {
    const user = req.user;
    user.subscriptionType = "free";
    await user.save();
    
    res.json({ 
      message: "Downgraded to free successfully",
      subscriptionType: user.subscriptionType 
    });
  } catch (err) {
    console.error("Downgrade error:", err);
    res.status(500).json({ message: "Server error", error: err.message });
  }
});

export default router;

