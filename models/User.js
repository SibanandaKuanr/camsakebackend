// models/User.js
import mongoose from 'mongoose';

const UserSchema = new mongoose.Schema({
  firstName: { type: String },
  lastName: { type: String },
  email: { type: String, required: true, unique: true, lowercase: true, trim: true },
  password: { type: String },
  role: { type: String, enum: ['male', 'female', 'admin'], required: true },
  isAdmin: { type: Boolean, default: false },

  // Female verification
  verificationVideoUrl: { type: String },
  verificationStatus: { type: String, enum: ['not_required','pending','approved','rejected'], default: 'not_required' },

  isVerified: { type: Boolean, default: false },
  totalVideoSeconds: { type: Number, default: 0 }, // <-- new field
  createdAt: { type: Date, default: Date.now }
});

export default mongoose.model('User', UserSchema);
