import React, { useState } from 'react';
import axiosInstance from '../services/api';

const ImageUpload = ({ onImagesUploaded, multiple = false, maxFiles = 5 }) => {
  const [uploading, setUploading] = useState(false);
  const [dragActive, setDragActive] = useState(false);
  const [previews, setPreviews] = useState([]);
  const [error, setError] = useState('');

  const handleDrag = (e) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === "dragenter" || e.type === "dragover") {
      setDragActive(true);
    } else if (e.type === "dragleave") {
      setDragActive(false);
    }
  };

  const handleDrop = (e) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);
    
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      handleFiles(e.dataTransfer.files);
    }
  };

  const handleChange = (e) => {
    e.preventDefault();
    if (e.target.files && e.target.files.length > 0) {
      handleFiles(e.target.files);
    }
  };

  const handleFiles = async (files) => {
    setError('');
    
    // Check file count
    if (multiple && files.length > maxFiles) {
      setError(`You can only upload up to ${maxFiles} images at once`);
      return;
    }

    // Check file types and sizes
    const validFiles = [];
    for (let file of files) {
      if (!file.type.startsWith('image/')) {
        setError('Only image files are allowed');
        return;
      }
      if (file.size > 5 * 1024 * 1024) {
        setError('Each image must be less than 5MB');
        return;
      }
      validFiles.push(file);
    }

    // Create previews
    const previewUrls = validFiles.map(file => URL.createObjectURL(file));
    setPreviews(previewUrls);

    // Upload files
    await uploadFiles(validFiles);
  };

  const uploadFiles = async (files) => {
    setUploading(true);
    try {
      const formData = new FormData();
      
      if (multiple) {
        // Multiple files
        files.forEach(file => {
          formData.append('images', file);
        });
        
        const response = await axiosInstance.post('/api/upload/multiple', formData, {
          headers: { 'Content-Type': 'multipart/form-data' }
        });
        
        const imageUrls = response.data.images.map(img => img.url);
        onImagesUploaded(imageUrls);
      } else {
        // Single file
        formData.append('image', files[0]);
        
        const response = await axiosInstance.post('/api/upload/single', formData, {
          headers: { 'Content-Type': 'multipart/form-data' }
        });
        
        onImagesUploaded([response.data.url]);
      }
      
      // Clear previews after successful upload
      setTimeout(() => {
        setPreviews([]);
      }, 1000);
    } catch (err) {
      setError(err.response?.data?.message || 'Upload failed');
      setPreviews([]);
    } finally {
      setUploading(false);
    }
  };

  return (
    <div className="w-full">
      {error && (
        <div className="mb-3 p-3 bg-red-100 border border-red-400 text-red-700 rounded text-sm">
          {error}
        </div>
      )}

      <div
        className={`relative border-2 border-dashed rounded-lg p-4 sm:p-6 text-center cursor-pointer transition-colors ${
          dragActive 
            ? 'border-blue-500 bg-blue-50' 
            : 'border-gray-300 hover:border-gray-400'
        }`}
        onDragEnter={handleDrag}
        onDragLeave={handleDrag}
        onDragOver={handleDrag}
        onDrop={handleDrop}
      >
        <input
          type="file"
          multiple={multiple}
          accept="image/*"
          onChange={handleChange}
          className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
          disabled={uploading}
        />

        {uploading ? (
          <div className="flex flex-col items-center">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mb-3"></div>
            <p className="text-gray-600">Uploading...</p>
          </div>
        ) : previews.length > 0 ? (
          <div className="space-y-3">
            <div className="flex flex-wrap gap-2 justify-center">
              {previews.map((preview, index) => (
                <img
                  key={index}
                  src={preview}
                  alt={`Preview ${index + 1}`}
                  className="h-20 w-20 object-cover rounded"
                />
              ))}
            </div>
            <p className="text-green-600 font-medium">✓ Upload successful!</p>
          </div>
        ) : (
          <div className="flex flex-col items-center">
            <svg
              className="mx-auto h-12 w-12 text-gray-400 mb-3"
              stroke="currentColor"
              fill="none"
              viewBox="0 0 48 48"
            >
              <path
                d="M28 8H12a4 4 0 00-4 4v20m32-12v8m0 0v8a4 4 0 01-4 4H12a4 4 0 01-4-4v-4m32-4l-3.172-3.172a4 4 0 00-5.656 0L28 28M8 32l9.172-9.172a4 4 0 015.656 0L28 28m0 0l4 4m4-24h8m-4-4v8m-12 4h.02"
                strokeWidth={2}
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
            <p className="text-gray-600 mb-1">
              <span className="font-semibold text-blue-600">Click to upload</span> or drag and drop
            </p>
            <p className="text-xs text-gray-500">
              {multiple ? `PNG, JPG, GIF up to 5MB (max ${maxFiles} files)` : 'PNG, JPG, GIF up to 5MB'}
            </p>
          </div>
        )}
      </div>
    </div>
  );
};

export default ImageUpload;