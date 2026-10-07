// Load .env here too. In ES modules every import runs before server.js gets to
// dotenv.config(), so without this the three values below can be read as
// undefined and Cloudinary throws "Must supply api_key" on every upload.
import "dotenv/config";
import { v2 as cloudinary } from 'cloudinary';

cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
  secure: true,
});

export default cloudinary;