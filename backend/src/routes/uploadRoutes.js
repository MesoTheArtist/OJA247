import express from 'express';
import cloudinary from '../config/cloudinaryConfig.js';
import multer from 'multer';
import { uploadLimiter } from '../middleware/rateLimiters.js';
import { sniffReceiptType } from '../services/receiptStorage.js';

const router = express.Router();

// Use memory storage for multer
const storage = multer.memoryStorage();

const upload = multer({ 
  storage: storage,
  limits: {
    fileSize: 5 * 1024 * 1024 // 5MB limit
  },
  fileFilter: (req, file, cb) => {
    if (['image/jpeg', 'image/png', 'image/webp'].includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error('Only JPG, PNG, and WEBP images are allowed'), false);
    }
  }
});

function hasSupportedImageSignature(buffer) {
  const imageType = sniffReceiptType(buffer);
  return imageType && imageType.ext !== 'pdf' ? imageType : null;
}

// Helper function to upload to Cloudinary
const uploadToCloudinary = async (fileBuffer, filename) => {
  const safeBase = String(filename || 'image')
    .split(/[\\/]/)
    .pop()
    .split('.')[0]
    .replace(/[^a-zA-Z0-9_-]/g, '')
    .slice(0, 40) || 'image';
  return new Promise((resolve, reject) => {
    const uploadStream = cloudinary.uploader.upload_stream(
      {
        folder: 'oja247',
        public_id: `${Date.now()}-${safeBase}`,
        transformation: [{ width: 1000, height: 1000, crop: 'limit' }]
      },
      (error, result) => {
        if (error) reject(error);
        else resolve(result);
      }
    );
    uploadStream.end(fileBuffer);
  });
};

// Upload single image
router.post('/single', uploadLimiter, upload.single('image'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ message: 'No file uploaded' });
    }
    if (!hasSupportedImageSignature(req.file.buffer)) {
      return res.status(400).json({ message: 'The file must be a valid JPG, PNG, or WEBP image.' });
    }

    const result = await uploadToCloudinary(req.file.buffer, req.file.originalname);

    res.json({
      message: 'Image uploaded successfully',
      url: result.secure_url,
      publicId: result.public_id
    });
  } catch (error) {
    console.error('Upload error:', error);
    res.status(500).json({ message: 'Image upload failed. Please try again.' });
  }
});

// Upload multiple images (max 5)
router.post('/multiple', uploadLimiter, upload.array('images', 5), async (req, res) => {
  try {
    if (!req.files || req.files.length === 0) {
      return res.status(400).json({ message: 'No files uploaded' });
    }
    if (req.files.some((file) => !hasSupportedImageSignature(file.buffer))) {
      return res.status(400).json({ message: 'Every file must be a valid JPG, PNG, or WEBP image.' });
    }

    const uploadPromises = req.files.map(file => 
      uploadToCloudinary(file.buffer, file.originalname)
    );

    const results = await Promise.all(uploadPromises);

    const uploadedImages = results.map(result => ({
      url: result.secure_url,
      publicId: result.public_id
    }));

    res.json({
      message: `${req.files.length} images uploaded successfully`,
      images: uploadedImages
    });
  } catch (error) {
    console.error('Upload error:', error);
    res.status(500).json({ message: 'Image upload failed. Please try again.' });
  }
});

export default router;