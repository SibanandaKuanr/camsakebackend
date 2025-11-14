// middleware/uploadMessageMiddleware.js
import multer from 'multer';
import { CloudinaryStorage } from 'multer-storage-cloudinary';
import cloudinary from '../config/cloudinary.js';

// Configure Cloudinary storage
const storage = new CloudinaryStorage({
  cloudinary: cloudinary,
  params: async (req, file) => {
    // Determine resource type based on file type
    let resourceType = 'auto'; // 'auto' lets Cloudinary detect the type
    let folder = 'messages';
    
    if (file.mimetype.startsWith('image/')) {
      resourceType = 'image';
      folder = 'messages/images';
    } else if (file.mimetype.startsWith('video/')) {
      resourceType = 'video';
      folder = 'messages/videos';
    } else if (file.mimetype.startsWith('audio/')) {
      resourceType = 'video'; // Cloudinary uses 'video' for audio too
      folder = 'messages/audio';
    } else if (file.mimetype === 'application/pdf') {
      resourceType = 'raw';
      folder = 'messages/documents';
    } else {
      resourceType = 'raw';
      folder = 'messages/documents';
    }
    
    return {
      folder: folder,
      resource_type: resourceType,
      allowed_formats: ['jpg', 'jpeg', 'png', 'gif', 'webp', 'mp4', 'webm', 'mov', 'mp3', 'wav', 'ogg', 'pdf', 'doc', 'docx'],
      public_id: `${Date.now()}-${Math.round(Math.random() * 1e9)}`,
      overwrite: false,
    };
  },
});

function fileFilter(req, file, cb) {
  // Accept images, videos, audio, PDFs, and documents
  const allowedMimes = [
    'image/jpeg', 'image/jpg', 'image/png', 'image/gif', 'image/webp',
    'video/mp4', 'video/webm', 'video/quicktime', 'video/x-msvideo',
    'audio/mpeg', 'audio/mp3', 'audio/wav', 'audio/ogg', 'audio/webm',
    'application/pdf',
    'application/msword', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', // .doc, .docx
  ];
  
  if (allowedMimes.includes(file.mimetype)) {
    cb(null, true);
  } else {
    cb(new Error('Invalid file type. Only images, videos, audio, PDFs, and documents are allowed!'), false);
  }
}

const upload = multer({
  storage,
  fileFilter,
  limits: { fileSize: 100 * 1024 * 1024 } // 100MB
});

export const messageFile = (field) => upload.single(field);

