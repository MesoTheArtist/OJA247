import axios from "axios";
import { attachCsrfToken, rememberCsrfToken } from "./csrf";

const API_BASE_URL = import.meta.env.DEV
  ? (import.meta.env.VITE_API_URL || "http://localhost:5000")
  : "";

// Marketer sessions are a distinct account type from the business owner's
// (see backend marketerAuthMiddleware.js) — kept on a separate axios
// instance so the two tokens never collide on the same requests.
const marketerApi = axios.create({
  baseURL: API_BASE_URL,
  withCredentials: true,
  headers: { "Content-Type": "application/json" },
});

marketerApi.interceptors.request.use(attachCsrfToken);
marketerApi.interceptors.response.use(
  rememberCsrfToken,
  (error) => {
    if (error.response) rememberCsrfToken(error.response);
    return Promise.reject(error);
  }
);

export default marketerApi;
