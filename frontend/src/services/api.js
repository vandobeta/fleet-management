import axios from 'axios';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3000/api';

const api = axios.create({
  baseURL: API_URL,
  headers: {
    'Content-Type': 'application/json',
  },
});

// Add token to requests
api.interceptors.request.use((config) => {
  const token = localStorage.getItem('token');
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

// Handle auth errors
api.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response?.status === 401) {
      localStorage.removeItem('token');
      window.location.href = '/login';
    }
    return Promise.reject(error);
  }
);

// Auth API
export const authAPI = {
  register: (data) => api.post('/auth/register', data),
  login: (data) => api.post('/auth/login', data),
  getMe: () => api.get('/auth/me'),
  updateMe: (data) => api.put('/auth/me', data),
  changePassword: (data) => api.put('/auth/password', data),
};

// Vehicles API
export const vehiclesAPI = {
  register: (data) => api.post('/vehicles/register', data),
  getAll: () => api.get('/vehicles'),
  getOne: (id) => api.get(`/vehicles/${id}`),
  update: (id, data) => api.put(`/vehicles/${id}`, data),
  delete: (id) => api.delete(`/vehicles/${id}`),
  activateLostMode: (id) => api.post(`/vehicles/${id}/lost-mode`),
  deactivateLostMode: (id) => api.delete(`/vehicles/${id}/lost-mode`),
};

// Geofences API
export const geofencesAPI = {
  create: (data) => api.post('/geofences', data),
  getAll: (params) => api.get('/geofences', { params }),
  getOne: (id) => api.get(`/geofences/${id}`),
  update: (id, data) => api.put(`/geofences/${id}`, data),
  delete: (id) => api.delete(`/geofences/${id}`),
  getBreaches: (id, params) => api.get(`/geofences/${id}/breaches`, { params }),
};

// Telemetry API
export const telemetryAPI = {
  getLatest: () => api.get('/telemetry/latest'),
  getHistory: (vehicleId, params) => api.get(`/telemetry/history/${vehicleId}`, { params }),
  getLocation: (vehicleId) => api.get(`/telemetry/location/${vehicleId}`),
};

// Commands API
export const commandsAPI = {
  send: (data) => api.post('/commands/send', data),
  getHistory: (params) => api.get('/commands/history', { params }),
  getOne: (id) => api.get(`/commands/${id}`),
  cancel: (id) => api.delete(`/commands/${id}`),
};

// Analytics API
export const analyticsAPI = {
  getDriverScores: () => api.get('/analytics/driver-scores'),
  getDriverScore: (vehicleId) => api.get(`/analytics/driver-scores/${vehicleId}`),
  getAccelerationEvents: (vehicleId, params) => api.get(`/analytics/acceleration-events/${vehicleId}`, { params }),
  getBrakeWear: () => api.get('/analytics/brake-wear'),
  getBrakeWear: (vehicleId) => api.get(`/analytics/brake-wear/${vehicleId}`),
  getFleetOverview: () => api.get('/analytics/fleet-overview'),
};

// Alerts API
export const alertsAPI = {
  getAll: (params) => api.get('/alerts', { params }),
  getOne: (id) => api.get(`/alerts/${id}`),
  acknowledge: (id) => api.post(`/alerts/${id}/acknowledge`),
  test: (data) => api.post('/alerts/test', data),
};

// Devices API
export const devicesAPI = {
  getConfig: (id) => api.get(`/devices/${id}/config`),
  sendSmsCommand: (id, data) => api.post(`/devices/${id}/sms-command`, data),
  requestLocation: (id) => api.post(`/devices/${id}/sms-location`),
  requestStatus: (id) => api.post(`/devices/${id}/sms-status`),
  parseSmsResponse: (data) => api.post('/devices/parse-sms-response', data),
};

// Subscriptions API
export const subscriptionsAPI = {
  getAll: () => api.get('/subscriptions'),
  getOne: (vehicleId) => api.get(`/subscriptions/vehicle/${vehicleId}`),
  renew: (data) => api.post('/subscriptions/renew', data),
};

// Payments API
export const paymentsAPI = {
  getAll: () => api.get('/payments'),
  getOne: (vehicleId) => api.get(`/payments/vehicle/${vehicleId}`),
  pay: (data) => api.post('/payments/pay', data),
  getAccountReference: (vehicleId) => api.get(`/payments/account-reference/${vehicleId}`),
};

export default api;