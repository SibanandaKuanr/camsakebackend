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
  email: {
    type: String,
    required: true,
    unique: true,
    lowercase: true,
    trim: true,
  },
  password: { type: String },
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

  // ✅ NEW: Friendship system
  friends: [FriendSchema], // current friends or pending requests
});

export default mongoose.model("User", UserSchema);
