// middleware/isAdminMiddleware.js
export default (req, res, next) => {
  if (!req.user) return res.status(401).json({ message: 'Unauthorized' });
  if (!req.user.isAdmin) return res.status(403).json({ message: 'Admin only' });
  next();
};
