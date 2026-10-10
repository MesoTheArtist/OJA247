import axios from 'axios';
import { attachCsrfToken, rememberCsrfToken } from './csrf';

const API_BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:5000';

// Create axios instance with base configuration
const axiosInstance = axios.create({
  baseURL: API_BASE_URL,
  withCredentials: true,
  headers: {
    'Content-Type': 'application/json',
  },
});

axiosInstance.interceptors.request.use(attachCsrfToken);
axiosInstance.interceptors.response.use(
  rememberCsrfToken,
  (error) => {
    if (error.response) rememberCsrfToken(error.response);
    return Promise.reject(error);
  }
);

// Business API calls
export const getAllBusinesses = () => axiosInstance.get('/api/businesses');
export const getBusinessById = (id) => axiosInstance.get(`/api/businesses/${id}`);
export const getBusinessDashboard = (id) => axiosInstance.get(`/api/businesses/${id}/dashboard`);
export const getFollowStatus = (businessId) => axiosInstance.get(`/api/follows/status/${businessId}`);
export const followBusiness = (businessId) => axiosInstance.post(`/api/follows/${businessId}`);
export const unfollowBusiness = (businessId) => axiosInstance.delete(`/api/follows/${businessId}`);
export const updateBusiness = (id, businessData) => axiosInstance.put(`/api/businesses/${id}`, businessData);
export const deleteBusiness = (id) => axiosInstance.delete(`/api/businesses/${id}`);

// Product API calls
export const getAllProducts = () => axiosInstance.get('/api/products');
export const getProductById = (id) => axiosInstance.get(`/api/products/${id}`);
export const getProductsByBusiness = (businessId) => axiosInstance.get(`/api/products/business/${businessId}`);
export const createProduct = (productData) => axiosInstance.post('/api/products', productData);
export const updateProduct = (id, productData) => axiosInstance.put(`/api/products/${id}`, productData);
export const deleteProduct = (id) => axiosInstance.delete(`/api/products/${id}`);

// Auth API calls
export const login = (credentials) => axiosInstance.post('/api/auth/login', credentials);
export const register = (userData) => axiosInstance.post('/api/auth/register', userData);
export const verifyToken = () => axiosInstance.get('/api/auth/verify');

// Upload API calls
export const uploadImage = (formData) => {
  return axiosInstance.post('/api/upload/single', formData, {
    headers: {
      'Content-Type': 'multipart/form-data',
    },
  });
};

// Admin API calls
export const getAdminStats = () => axiosInstance.get('/api/admin/stats');
export const getAllUsers = () => axiosInstance.get('/api/admin/users');

export default axiosInstance;