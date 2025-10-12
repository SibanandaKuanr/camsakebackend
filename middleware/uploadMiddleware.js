// middleware/uploadMiddleware.js
import multer from 'multer';
import path from 'path';

// Save to local 'uploads/' (dev). In production, upload to Cloudinary/S3 instead.
const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    cb(null, 'uploads/');
  },
  filename: function (req, file, cb) {
    const ext = path.extname(file.originalname);
    const fname = `${Date.now()}-${Math.round(Math.random()*1e9)}${ext}`;
    cb(null, fname);
  }
});

function fileFilter(req, file, cb) {
  // accept video mime types
  if (!file.mimetype.startsWith('video/')) {
    return cb(new Error('Only video files are allowed!'), false);
  }
  cb(null, true);
}

const upload = multer({
  storage,
  fileFilter,
  limits: { fileSize: 50 * 1024 * 1024 } // 50MB
});

export const single = (field) => upload.single(field);
