import axios from 'axios';
import { API_URL } from './config';

// Backend API. Every function returns the axios response — use `res.data` in the page.
const http = axios.create({ baseURL: API_URL, timeout: 20000 });

// Send the saved login token with every request
http.interceptors.request.use((config) => {
  const token = typeof window !== 'undefined' ? localStorage.getItem('token') : null;
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

// Use the backend's error message (e.g. "Wrong email or password") as error.message
http.interceptors.response.use(
  (res) => res,
  (err) => {
    err.message = err.response?.data?.error?.message ?? 'Cannot reach the server. Please try again.';
    return Promise.reject(err);
  },
);

export const get = (url) => http.get(url);
export const post = (url, body) => http.post(url, body);
export const put = (url, body) => http.put(url, body);
export const patch = (url, body) => http.patch(url, body);
export const del = (url) => http.delete(url);
