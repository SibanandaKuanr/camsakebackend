// models/User.js
import mongoose from "mongoose";

const FriendSchema = new mongoose.Schema(
  {
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    status: {
      type: String,
      enum: ["pending", "accepted"],
      default: "pending",
    },
  },
  { _id: false }
);

const UserSchema = new mongoose.Schema({
  firstName: { type: String },
  lastName: { type: String },
  dateOfBirth: { type: String },
  email: {
    type: String,
    required: true,
    unique: true,
    lowercase: true,
    trim: true,
  },
  password: { type: String }, // Deprecated - keeping for backward compatibility
  firebaseUid: { type: String, unique: true, sparse: true }, // Firebase Authentication UID
  profilePicture: { type: String }, // Profile picture URL (from Google or uploaded)
  role: { type: String, enum: ["male", "female", "admin"], required: true },
  isAdmin: { type: Boolean, default: false },

  // Female verification
  verificationVideoUrl: { type: String },
  verificationStatus: {
    type: String,
    enum: ["not_required", "pending", "approved", "rejected"],
    default: "not_required",
  },

  isVerified: { type: Boolean, default: false },
  totalVideoSeconds: { type: Number, default: 0 },
  createdAt: { type: Date, default: Date.now },

  // ✅ Subscription system
  subscriptionType: { 
    type: String, 
    enum: ["free", "premium"], 
    default: "free" 
  },

  // ✅ NEW: Friendship system
  friends: [FriendSchema], // current friends or pending requests
  
  // ✅ Block and Report system
  blockedUsers: [{ type: mongoose.Schema.Types.ObjectId, ref: "User" }],
  
  // ✅ Online status
  isOnline: { type: Boolean, default: false },
  lastSeen: { type: Date, default: Date.now },
});

export default mongoose.model("User", UserSchema);
