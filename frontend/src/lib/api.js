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
        const payload = await response.json().catch(() => ({ detail: 'An error occurred' }));
        // FastAPI may return either a string `detail` or a structured dict
        // (e.g. our 409 duplicate-patient response). Surface a readable
        // message but also attach the raw payload + status so callers can
        // branch on structured fields like `existing_patient_id`.
        let message;
        if (typeof payload.detail === 'string') {
          message = payload.detail;
        } else if (payload.detail && typeof payload.detail === 'object' && payload.detail.detail) {
          message = payload.detail.detail;
        } else {
          message = `HTTP ${response.status}`;
        }
        const err = new Error(message);
        err.status = response.status;
        err.payload = payload.detail && typeof payload.detail === 'object'
          ? payload.detail
          : payload;
        throw err;
      }

      // Handle blob responses (PDF downloads)
      if (options.responseType === 'blob') {
        return response.blob();
      }

      if (response.status === 204) {
        return null;
      }
      const text = await response.text();
      return text ? JSON.parse(text) : null;
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

  async deletePatient(id) {
    return this.request(`/api/patients/${id}`, { method: 'DELETE' });
  }

  // Cases
  async getCases(params = {}) {
    const query = new URLSearchParams(params).toString();
    return this.request(`/api/cases?${query}`);
  }

  async getCase(id) {
    return this.request(`/api/cases/${id}`);
  }

  async createCase(patientId, image, clinicalNotes, vitals = {}) {
    const formData = new FormData();
    formData.append('patient_id', patientId);
    formData.append('image', image);
    if (clinicalNotes) formData.append('clinical_notes', clinicalNotes);
    
    // Append vitals
    if (vitals.patient_weight) formData.append('patient_weight', vitals.patient_weight);
    if (vitals.patient_height) formData.append('patient_height', vitals.patient_height);
    if (vitals.blood_pressure) formData.append('blood_pressure', vitals.blood_pressure);
    if (vitals.heart_rate) formData.append('heart_rate', vitals.heart_rate);
    if (vitals.temperature) formData.append('temperature', vitals.temperature);
    if (vitals.reason_for_visit) formData.append('reason_for_visit', vitals.reason_for_visit);

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
    const token = this.getToken();
    return `${this.base}/api/cases/${caseId}/image?token=${encodeURIComponent(token)}`;
  }

  getHeatmapUrl(caseId, disease) {
    const token = this.getToken();
    return `${this.base}/api/cases/${caseId}/heatmap/${disease}?token=${encodeURIComponent(token)}`;
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

  // Admin — AI Training
  async getTrainingCapabilities() {
    return this.request('/api/admin/training/capabilities');
  }

  async getTrainingDatasets() {
    return this.request('/api/admin/training/datasets');
  }

  async uploadTrainingDataset({ name, description, csvFile, images, archive }) {
    const fd = new FormData();
    fd.append('name', name);
    if (description) fd.append('description', description);
    if (csvFile) fd.append('csv_file', csvFile);
    (images || []).forEach(img => fd.append('images', img));
    if (archive) fd.append('archive', archive);
    return this.request('/api/admin/training/datasets', {
      method: 'POST',
      body: fd,
    });
  }

  async deleteTrainingDataset(id) {
    return this.request(`/api/admin/training/datasets/${id}`, { method: 'DELETE' });
  }

  async getTrainingRuns(datasetId) {
    const q = datasetId ? `?dataset_id=${encodeURIComponent(datasetId)}` : '';
    return this.request(`/api/admin/training/runs${q}`);
  }

  async getTrainingRun(id) {
    return this.request(`/api/admin/training/runs/${id}`);
  }

  async startTrainingRun(payload) {
    return this.request('/api/admin/training/runs', {
      method: 'POST',
      body: JSON.stringify(payload),
    });
  }

  async promoteTrainingRun(id) {
    return this.request(`/api/admin/training/runs/${id}/promote`, { method: 'POST' });
  }

  async cancelTrainingRun(id) {
    return this.request(`/api/admin/training/runs/${id}/cancel`, { method: 'POST' });
  }

  // ── Data retention (admin) ───────────────────────────────────
  async getRetentionConfig() {
    return this.request('/api/admin/retention/config');
  }

  async getExpiredPatients(retentionYears) {
    const qs = retentionYears ? `?retention_years=${retentionYears}` : '';
    return this.request(`/api/admin/retention/expired${qs}`);
  }

  async deleteExpiredPatient(patientId, { dryRun = false } = {}) {
    const qs = dryRun ? '?dry_run=true' : '';
    return this.request(
      `/api/admin/retention/patients/${patientId}${qs}`,
      { method: 'DELETE' },
    );
  }

  async purgeExpiredPatients(retentionYears, { dryRun = false } = {}) {
    const params = new URLSearchParams();
    if (retentionYears) params.set('retention_years', retentionYears);
    if (dryRun) params.set('dry_run', 'true');
    const qs = params.toString();
    return this.request(
      `/api/admin/retention/purge${qs ? `?${qs}` : ''}`,
      { method: 'POST' },
    );
  }
}

export const api = new ApiClient();
export default api;
