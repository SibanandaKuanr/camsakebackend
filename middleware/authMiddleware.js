// middleware/authMiddleware.js
import jwt from 'jsonwebtoken';
import User from '../models/User.js';

/**
 * Express middleware for HTTP routes
 */
const authMiddleware = async (req, res, next) => {
  try {
    const header = req.headers.authorization;
    if (!header || !header.startsWith('Bearer ')) {
      return res.status(401).json({ message: 'No token provided' });
    }

    const token = header.split(' ')[1];
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    const user = await User.findById(decoded.id);

    if (!user) return res.status(401).json({ message: 'User not found' });

    req.user = user;
    next();
  } catch (err) {
    console.error('Auth error:', err);
    return res.status(401).json({ message: 'Unauthorized' });
  }
};

/**
 * Socket.IO authentication helper
 * - Called from io.use() middleware
 * - Verifies JWT token passed in handshake (auth.token or query.token)
 * - Returns user or null
 */
export const socketAuth = async (socket, next) => {
  try {
    const token =
      socket.handshake.auth?.token ||
      socket.handshake.query?.token ||
      null;

    if (!token) {
      return next(new Error('No token provided'));
    }

    // Remove optional "Bearer " prefix if sent
    const cleanToken = token.startsWith('Bearer ')
      ? token.split(' ')[1]
      : token;

    const decoded = jwt.verify(cleanToken, process.env.JWT_SECRET);
    const user = await User.findById(decoded.id);

    if (!user) {
      return next(new Error('User not found'));
    }

    // Attach user to socket
    socket.user = user;
    next();
  } catch (err) {
    console.error('Socket auth error:', err.message);
    next(new Error('Unauthorized'));
  }
};

/**
 * Utility function to verify token manually (optional)
 * Can be used elsewhere if you just have a token string.
 */
export const verifySocketToken = async (token) => {
  try {
    if (!token) return null;
    const cleanToken = token.startsWith('Bearer ')
      ? token.split(' ')[1]
      : token;
    const decoded = jwt.verify(cleanToken, process.env.JWT_SECRET);
    const user = await User.findById(decoded.id);
    return user || null;
  } catch {
    return null;
  }
};

export default authMiddleware;
