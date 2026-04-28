/**
 * MedicX — API Client
 * Centralized fetch wrapper for backend communication.
 */
const API_BASE = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000';

class ApiClient {
  constructor() {
    this.base = API_BASE;
  }

  getToken() {
    if (typeof window !== 'undefined') {
      return localStorage.getItem('medix_token');
    }
    return null;
  }

  setToken(token) {
    if (typeof window !== 'undefined') {
      localStorage.setItem('medix_token', token);
    }
  }

  clearToken() {
    if (typeof window !== 'undefined') {
      localStorage.removeItem('medix_token');
      localStorage.removeItem('medix_user');
    }
  }

  getUser() {
    if (typeof window !== 'undefined') {
      const user = localStorage.getItem('medix_user');
      return user ? JSON.parse(user) : null;
    }
    return null;
  }

  setUser(user) {
    if (typeof window !== 'undefined') {
      localStorage.setItem('medix_user', JSON.stringify(user));
    }
  }

  async request(endpoint, options = {}) {
    const url = `${this.base}${endpoint}`;
    const token = this.getToken();

    const config = {
      headers: {
        ...(options.headers || {}),
      },
      ...options,
    };

    if (token) {
      config.headers['Authorization'] = `Bearer ${token}`;
    }

    // Don't set Content-Type for FormData (browser sets multipart boundary)
    if (!(options.body instanceof FormData)) {
      config.headers['Content-Type'] = config.headers['Content-Type'] || 'application/json';
    }

    try {
      const response = await fetch(url, config);

      if (response.status === 401) {
        this.clearToken();
        if (typeof window !== 'undefined') {
          window.location.href = '/auth/login';
        }
        throw new Error('Unauthorized');
      }

      if (!response.ok) {
        const error = await response.json().catch(() => ({ detail: 'An error occurred' }));
        throw new Error(error.detail || `HTTP ${response.status}`);
      }

      // Handle blob responses (PDF downloads)
      if (options.responseType === 'blob') {
        return response.blob();
      }

      return response.json();
    } catch (err) {
      console.error(`API Error [${endpoint}]:`, err.message);
      throw err;
    }
  }

  // Auth
  async login(email, password) {
    const res = await this.request('/api/auth/login', {
      method: 'POST',
      body: JSON.stringify({ email, password }),
    });
    this.setToken(res.access_token);
    this.setUser(res.user);
    return res;
  }

  async register(data) {
    const res = await this.request('/api/auth/register', {
      method: 'POST',
      body: JSON.stringify(data),
    });
    this.setToken(res.access_token);
    this.setUser(res.user);
    return res;
  }

  async getMe() {
    return this.request('/api/auth/me');
  }

  // Patients
  async getPatients(params = {}) {
    const query = new URLSearchParams(params).toString();
    return this.request(`/api/patients?${query}`);
  }

  async getPatient(id) {
    return this.request(`/api/patients/${id}`);
  }

  async createPatient(data) {
    return this.request('/api/patients/', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  }

  async updatePatient(id, data) {
    return this.request(`/api/patients/${id}`, {
      method: 'PUT',
      body: JSON.stringify(data),
    });
  }

  async archivePatient(id) {
    return this.request(`/api/patients/${id}/archive`, { method: 'POST' });
  }

  // Cases
  async getCases(params = {}) {
    const query = new URLSearchParams(params).toString();
    return this.request(`/api/cases?${query}`);
  }

  async getCase(id) {
    return this.request(`/api/cases/${id}`);
  }

  async createCase(patientId, image, clinicalNotes) {
    const formData = new FormData();
    formData.append('patient_id', patientId);
    formData.append('image', image);
    if (clinicalNotes) formData.append('clinical_notes', clinicalNotes);

    return this.request('/api/cases/', {
      method: 'POST',
      body: formData,
    });
  }

  async rerunAnalysis(caseId, threshold) {
    const query = threshold !== undefined ? `?threshold=${threshold}` : '';
    return this.request(`/api/cases/${caseId}/analyze${query}`, { method: 'POST' });
  }

  async validateFinding(findingId, data) {
    return this.request(`/api/cases/findings/${findingId}/validate`, {
      method: 'PUT',
      body: JSON.stringify(data),
    });
  }

  async finalizeCase(caseId) {
    return this.request(`/api/cases/${caseId}/finalize`, { method: 'PUT' });
  }

  getCaseImageUrl(caseId) {
    return `${this.base}/api/cases/${caseId}/image`;
  }

  getHeatmapUrl(caseId, disease) {
    return `${this.base}/api/cases/${caseId}/heatmap/${disease}`;
  }

  // Reports
  async generateReport(caseId, data) {
    return this.request(`/api/reports/${caseId}/generate`, {
      method: 'POST',
      body: JSON.stringify(data),
    });
  }

  async downloadReport(reportId) {
    return this.request(`/api/reports/${reportId}/download`, {
      responseType: 'blob',
    });
  }

  // Admin
  async getDashboardStats() {
    return this.request('/api/admin/dashboard');
  }

  async getUsers() {
    return this.request('/api/admin/users');
  }

  async updateUser(id, data) {
    return this.request(`/api/admin/users/${id}`, {
      method: 'PUT',
      body: JSON.stringify(data),
    });
  }

  async deactivateUser(id) {
    return this.request(`/api/admin/users/${id}/deactivate`, { method: 'POST' });
  }

  async getAuditLogs(params = {}) {
    const query = new URLSearchParams(params).toString();
    return this.request(`/api/admin/audit-logs?${query}`);
  }

  async getAIPerformance() {
    return this.request('/api/admin/ai-performance');
  }
}

export const api = new ApiClient();
export default api;
