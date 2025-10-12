// models/Call.js
import mongoose from 'mongoose';

const CallSchema = new mongoose.Schema({
  caller: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  callee: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  startedAt: { type: Date, default: Date.now },
  endedAt: { type: Date },
  status: { type: String, enum: ['active','completed','cancelled','rejected','no_answer'], default: 'active' },
  durationSeconds: { type: Number, default: 0 },
  metadata: { type: Object } // e.g. rtc stats or any meta
}, { timestamps: true });

export default mongoose.model('Call', CallSchema);
