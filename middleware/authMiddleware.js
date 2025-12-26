// middleware/authMiddleware.js
import admin from '../config/firebase.js';
import User from '../models/User.js';

/**
 * Express middleware for HTTP routes
 * Verifies Firebase ID tokens
 */
const authMiddleware = async (req, res, next) => {
  try {
    const header = req.headers.authorization;
    if (!header || !header.startsWith('Bearer ')) {
      return res.status(401).json({ message: 'No token provided' });
    }

    const idToken = header.split(' ')[1];
    
    // Verify Firebase ID token
    let decodedToken;
    try {
      decodedToken = await admin.auth().verifyIdToken(idToken);
    } catch (error) {
      console.error('Token verification error:', error);
      return res.status(401).json({});
    }

    // Find user in our database by email or firebaseUid
    const user = await User.findOne({ 
      $or: [
        { email: decodedToken.email },
        { firebaseUid: decodedToken.uid }
      ]
    });

    if (!user) {
      return res.status(401).json();
    }

    // Update firebaseUid if not set
    if (!user.firebaseUid) {
      user.firebaseUid = decodedToken.uid;
      await user.save();
    }

    req.user = user;
    req.firebaseUser = decodedToken; // Store Firebase user info for reference
    next();
  } catch (err) {
    console.error('Auth error:', err);
    return res.status(401).json({ message: 'Unauthorized' });
  }
};

/**
 * Socket.IO authentication helper
 * - Called from io.use() middleware
 * - Verifies Firebase ID token passed in handshake (auth.token or query.token)
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

    // Verify Firebase ID token
    let decodedToken;
    try {
      decodedToken = await admin.auth().verifyIdToken(cleanToken);
    } catch (error) {
      return ;
    }

    // Find user in our database
    const user = await User.findOne({ 
      $or: [
        { email: decodedToken.email },
        { firebaseUid: decodedToken.uid }
      ]
    });

    if (!user) {
      return ;
    }

    // Update firebaseUid if not set
    if (!user.firebaseUid) {
      user.firebaseUid = decodedToken.uid;
      await user.save();
    }

    // Attach user to socket
    socket.user = user;
    socket.firebaseUser = decodedToken;
    next();
  } catch (err) {
    console.error('Socket auth error:', err.message);
    next(new Error('Unauthorized'));
  }
};

/**
 * Utility function to verify Firebase ID token manually (optional)
 * Can be used elsewhere if you just have a token string.
 */
export const verifySocketToken = async (token) => {
  try {
    if (!token) return null;
    const cleanToken = token.startsWith('Bearer ')
      ? token.split(' ')[1]
      : token;
    
    const decodedToken = await admin.auth().verifyIdToken(cleanToken);
    const user = await User.findOne({ 
      $or: [
        { email: decodedToken.email },
        { firebaseUid: decodedToken.uid }
      ]
    });
    return user || null;
  } catch {
    return null;
  }
};

export default authMiddleware;
