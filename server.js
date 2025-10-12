// server.js
import 'dotenv/config';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import express from 'express';
import cors from 'cors';
import http from 'http';
import { Server } from 'socket.io';
import connectDB from './config/db.js';
import authRoutes from './routes/authRoutes.js';
import adminRoutes from './routes/adminRoutes.js';
import { socketAuth } from './middleware/authMiddleware.js';
import Call from './models/call.js';
import User from './models/User.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const app = express();
connectDB();

// middleware
app.use(cors({ origin: 'http://localhost:3000' }));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// serve uploaded files statically (dev)
app.use('/uploads', express.static(join(__dirname, 'uploads')));

// routes
app.use('/api/auth', authRoutes);
app.use('/api/admin', adminRoutes);

// basic root
app.get('/', (req, res) => res.send('MERN verification backend running'));

// error handler
app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(500).json({ message: err.message });
});

// ----------------------------
// SOCKET.IO + WEBRTC INTEGRATION
// ----------------------------
const httpServer = http.createServer(app);
const io = new Server(httpServer, {
  cors: {
    origin: 'http://localhost:3000',
    methods: ['GET', 'POST'],
  },
});

// attach socket auth middleware
io.use(socketAuth);

// matchmaking queues
const maleQueue = new Map();
const femaleQueue = new Map();
const activeCalls = new Map();

io.on('connection', (socket) => {
  const user = socket.user;
  console.log(`✅ Socket connected: ${socket.id} (${user.email}) [${user.role}]`);

  // user joins matchmaking queue
  socket.on('join_queue', async (_, cb) => {
    try {
      if (user.role !== 'male' && user.role !== 'female') {
        return cb?.({ ok: false, message: 'Invalid role for queue' });
      }
      if (user.role === 'female' && !user.isVerified) {
        return cb?.({ ok: false, message: 'Female must be verified' });
      }

      // Add to queue
      if (user.role === 'male')
        maleQueue.set(socket.id, { socket, user, joinedAt: Date.now() });
      else
        femaleQueue.set(socket.id, { socket, user, joinedAt: Date.now() });

      const match = findMatch(socket);
      if (match) {
        startCall(match.initiator, match.receiver);
        cb?.({ ok: true, message: 'Matched! Connecting you...' });
      } else {
        cb?.({ ok: true, message: 'Waiting for opposite gender...' });
        socket.emit('waiting_status', {
          message:
            user.role === 'male'
              ? 'No girls available right now'
              : 'No boys available right now',
        });
      }
    } catch (err) {
      console.error(err);
      cb?.({ ok: false, message: 'Server error' });
    }
  });

  socket.on('leave_queue', () => {
    maleQueue.delete(socket.id);
    femaleQueue.delete(socket.id);
  });

  // Skip user: end current match and rejoin queue
  socket.on('skip_user', async (data) => {
    const { roomId } = data || {};
    console.log(`🔁 ${user.email} skipped current chat.`);
    await endCall(roomId, socket.id);

    // Put the user back into queue
    if (user.role === 'male') {
      maleQueue.set(socket.id, { socket, user, joinedAt: Date.now() });
    } else {
      femaleQueue.set(socket.id, { socket, user, joinedAt: Date.now() });
    }

    const match = findMatch(socket);
    if (match) startCall(match.initiator, match.receiver);
    else
      socket.emit('waiting_status', {
        message: 'No users available, searching...',
      });
  });

  // User leaves chat manually
  socket.on('leave_chat', async () => {
    console.log(`🚪 ${user.email} left chat.`);
    for (const [roomId, info] of activeCalls.entries()) {
      if (
        info.callerSocketId === socket.id ||
        info.calleeSocketId === socket.id
      ) {
        await endCall(roomId, socket.id);
      }
    }
  });

  // WebRTC signaling (offer/answer)
  socket.on('signal', (data) => {
    const { roomId, description } = data || {};
    if (!roomId || !description) return;
    socket.to(roomId).emit('signal', { from: socket.id, description });
  });

  // ICE candidate relay
  socket.on('ice_candidate', (data) => {
    const { roomId, candidate } = data || {};
    if (!roomId || !candidate) return;
    socket.to(roomId).emit('ice_candidate', { from: socket.id, candidate });
  });

  // In-call chat message
  socket.on('chat_message', (data) => {
    const { roomId, text } = data || {};
    if (!roomId || !text) return;
    io.to(roomId).emit('chat_message', {
      from: {
        id: socket.user._id,
        name: socket.user.firstName || socket.user.email,
      },
      text,
      ts: Date.now(),
    });
  });

  // end call
  socket.on('end_call', async (data) => {
    const { roomId } = data || {};
    await endCall(roomId, socket.id);
  });

  socket.on('disconnect', async () => {
    console.log(`❌ Disconnected: ${socket.id} (${user.email})`);
    maleQueue.delete(socket.id);
    femaleQueue.delete(socket.id);

    for (const [roomId, info] of activeCalls.entries()) {
      if (
        info.callerSocketId === socket.id ||
        info.calleeSocketId === socket.id
      ) {
        await endCall(roomId, socket.id);
      }
    }
  });
  socket.on("toggle_media", (data) => {
  const { roomId, kind, enabled } = data;
  socket.to(roomId).emit("remote_toggle_media", { kind, enabled });
});

});

// match male↔female
function findMatch(socket) {
  const user = socket.user;
  if (user.role === 'male') {
    const femaleEntry = [...femaleQueue.values()].sort(
      (a, b) => a.joinedAt - b.joinedAt
    )[0];
    if (femaleEntry) {
      femaleQueue.delete(femaleEntry.socket.id);
      maleQueue.delete(socket.id);
      return { initiator: socket, receiver: femaleEntry.socket };
    }
  } else {
    const maleEntry = [...maleQueue.values()].sort(
      (a, b) => a.joinedAt - b.joinedAt
    )[0];
    if (maleEntry) {
      femaleQueue.delete(socket.id);
      maleQueue.delete(maleEntry.socket.id);
      return { initiator: maleEntry.socket, receiver: socket };
    }
  }
  return null;
}

// start call between matched users
async function startCall(initiator, receiver) {
  const roomId = `call_${initiator.id}_${receiver.id}_${Date.now()}`;
  try {
    const callDoc = await Call.create({
      caller: initiator.user._id,
      callee: receiver.user._id,
      startedAt: new Date(),
      status: 'active',
    });

    initiator.join(roomId);
    receiver.join(roomId);

    activeCalls.set(roomId, {
      callerSocketId: initiator.id,
      calleeSocketId: receiver.id,
      callDocId: callDoc._id,
      startedAt: Date.now(),
    });

    // Emit matched event to both users
    initiator.emit('matched', {
      roomId,
      role: 'caller',
      other: receiver.user,
    });
    receiver.emit('matched', {
      roomId,
      role: 'callee',
      other: initiator.user,
    });
  } catch (err) {
    console.error('startCall error:', err);
  }
}

// finish and clean call
async function endCall(roomId, endedBySocketId) {
  const info = activeCalls.get(roomId);
  if (!info) return;

  try {
    const duration = Math.floor((Date.now() - info.startedAt) / 1000);

    // Update call record
    const callDoc = await Call.findByIdAndUpdate(
      info.callDocId,
      { endedAt: new Date(), durationSeconds: duration, status: 'completed' },
      { new: true }
    ).populate(['caller', 'callee']);

    // ✅ Update total video seconds for both users
    if (callDoc?.caller) {
      await User.findByIdAndUpdate(callDoc.caller._id, {
        $inc: { totalVideoSeconds: duration },
      });
    }
    if (callDoc?.callee) {
      await User.findByIdAndUpdate(callDoc.callee._id, {
        $inc: { totalVideoSeconds: duration },
      });
    }

    // Notify both peers
    io.to(roomId).emit('call_ended', {
      roomId,
      endedBy: endedBySocketId,
      duration,
    });

    activeCalls.delete(roomId);
  } catch (err) {
    console.error('endCall error:', err);
  }
}

// total time spent by user
// const totalSeconds = await Call.aggregate([
//   { $match: { $or: [{ caller: UserId }, { callee: UserId }] } },
//   { $group: { _id: null, total: { $sum: "$durationSeconds" } } }
// ]);

// ----------------------------
// PERIODIC QUEUE STATUS UPDATES
// ----------------------------
setInterval(() => {
  maleQueue.forEach(({ socket }) =>
    socket.emit('waiting_status', { message: 'No girls available right now' })
  );
  femaleQueue.forEach(({ socket }) =>
    socket.emit('waiting_status', { message: 'No boys available right now' })
  );
}, 10000);

// ----------------------------
// START SERVER
// ----------------------------
const PORT = process.env.PORT || 5000;
httpServer.listen(PORT, () =>
  console.log(`🚀 Server + Socket.IO running on port ${PORT}`)
);
