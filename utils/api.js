// utils/api.js
import axios from 'axios';

const api = axios.create({
  baseURL: 'https://mobile-backend-aftl.onrender.com/api', // change to your backend URL
  headers: {
    'Content-Type': 'application/json',
  },
});

export default api;
