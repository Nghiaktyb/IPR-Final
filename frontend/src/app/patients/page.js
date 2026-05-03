'use client';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import api from '@/lib/api';
import Link from 'next/link';
import { useAuth } from '@/lib/auth';

const EMPTY_FORM = {
  patient_code: '',
  full_name: '',
  date_of_birth: '',
  sex: 'male',
  blood_type: '',
  medical_history: '',
};

export default function PatientsPage() {
  const router = useRouter();
  const { user } = useAuth();
  const isAdmin = user?.role === 'admin';

  const [patients, setPatients] = useState([]);
  const [search, setSearch] = useState('');
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);

  const [showCreate, setShowCreate] = useState(false);
  const [form, setForm] = useState(EMPTY_FORM);
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState(null);

  // Pending delete confirmation (admin only)
  const [confirmDelete, setConfirmDelete] = useState(null);
  const [deleting, setDeleting] = useState(false);

  const loadPatients = async (q = '') => {
    setLoading(true);
    try {
      const res = await api.getPatients({ search: q, limit: 50 });
      setPatients(res.patients || []);
      setTotal(res.total || 0);
    } catch (e) { console.error(e); }
    finally { setLoading(false); }
  };

  useEffect(() => { loadPatients(); }, []);

  const handleSearch = (e) => {
    setSearch(e.target.value);
    loadPatients(e.target.value);
  };

  const openCreate = () => {
    setCreateError(null);
    setForm(EMPTY_FORM);
    setShowCreate(true);
  };

  const handleCreate = async (e) => {
    e.preventDefault();
    setCreateError(null);
    setCreating(true);
    try {
      const created = await api.createPatient(form);
      setShowCreate(false);
      setForm(EMPTY_FORM);
      // Jump straight to the newly-created profile so the user can verify.
      if (created?.id) {
        router.push(`/patients/${created.id}`);
      } else {
        loadPatients(search);
      }
    } catch (err) {
      // 409 → render an actionable duplicate-patient panel inline; other
      // errors fall back to a generic message at the top of the form.
      if (err.status === 409 && err.payload?.existing_patient_id) {
        setCreateError({
          kind: 'duplicate',
          message: err.message,
          existingId: err.payload.existing_patient_id,
          existingName: err.payload.existing_patient_name,
          code: err.payload.patient_code,
        });
      } else {
        setCreateError({ kind: 'generic', message: err.message });
      }
    } finally {
      setCreating(false);
    }
  };

  const handleDelete = async (p) => {
    setDeleting(true);
    try {
      await api.deletePatient(p.id);
      setConfirmDelete(null);
      loadPatients(search);
    } catch (e) {
      alert(`Could not delete patient: ${e.message}`);
    } finally {
      setDeleting(false);
    }
  };

  return (
    <div>
      <div style={{display:'flex', justifyContent:'space-between', alignItems:'flex-start', marginBottom:28}}>
        <div>
          <h1>Patient Directory</h1>
          <p style={{color:'var(--text-secondary)', marginTop:4}}>Manage cases and review AI diagnostic insights</p>
        </div>
        <button onClick={openCreate} className="btn btn-primary">+ New Patient</button>
      </div>

      <div className="stats-grid" style={{marginBottom:24}}>
        <div className="stat-card">
          <div className="stat-value">{total}</div>
          <div className="stat-label">Total Patients</div>
        </div>
      </div>

      <div className="card" style={{overflow:'hidden'}}>
        <div style={{padding:'16px 20px', borderBottom:'1px solid var(--border-light)', display:'flex', gap:12}}>
          <input
            className="input"
            placeholder="Search by name or patient ID..."
            value={search}
            onChange={handleSearch}
            style={{maxWidth:340}}
          />
        </div>

        {loading ? (
          <div className="loading-center"><div className="loading-spinner"></div></div>
        ) : patients.length === 0 ? (
          <div className="empty-state">
            <p>No patients found. Create your first patient to begin.</p>
          </div>
        ) : (
          <table className="table">
            <thead>
              <tr>
                <th>Patient ID</th>
                <th>Name</th>
                <th>DOB</th>
                <th>Sex</th>
                <th>Cases</th>
                <th>Created</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {patients.map(p => (
                <tr key={p.id}>
                  <td>
                    {p.patient_code ? (
                      <code style={{
                        fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace',
                        fontSize: '0.85rem',
                        background: 'var(--primary-light)',
                        color: 'var(--primary)',
                        padding: '2px 8px',
                        borderRadius: 6,
                        fontWeight: 600,
                      }}>{p.patient_code}</code>
                    ) : (
                      <span style={{color: 'var(--text-muted)', fontStyle: 'italic'}}>—</span>
                    )}
                  </td>
                  <td style={{fontWeight:600}}>
                    <Link href={`/patients/${p.id}`} className="link">{p.full_name}</Link>
                  </td>
                  <td>{p.date_of_birth ? new Date(p.date_of_birth + 'T00:00:00').toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' }) : '—'}</td>
                  <td><span className="badge badge-primary">{p.sex}</span></td>
                  <td>{p.case_count}</td>
                  <td>{new Date(p.created_at).toLocaleDateString()}</td>
                  <td style={{whiteSpace:'nowrap'}}>
                    <Link href={`/cases/new?patient=${p.id}`} className="btn btn-ghost btn-sm">Upload X-ray</Link>
                    <Link href={`/patients/${p.id}`} className="btn btn-ghost btn-sm" style={{marginLeft: 8}}>Profile</Link>
                    {isAdmin && (
                      <button
                        className="btn btn-danger btn-sm"
                        style={{marginLeft: 8}}
                        onClick={() => setConfirmDelete(p)}
                        title="Delete this patient and every linked case/report"
                      >
                        Delete
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* ── Create Patient Modal ───────────────────────────────── */}
      {showCreate && (
        <div className="modal-overlay" onClick={() => !creating && setShowCreate(false)}>
          <div className="modal" onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <h3>New Patient</h3>
              <button onClick={() => setShowCreate(false)} className="btn btn-ghost btn-icon" disabled={creating}>X</button>
            </div>

            {createError?.kind === 'duplicate' && (
              <div style={{
                background: 'var(--warning-light)',
                border: '1px solid color-mix(in srgb, var(--warning) 30%, transparent)',
                color: '#7a4a00',
                padding: '12px 14px',
                borderRadius: 10,
                marginBottom: 16,
                fontSize: '0.92rem',
                lineHeight: 1.5,
              }}>
                <strong>Patient already exists.</strong> Patient ID{' '}
                <code style={{
                  background: 'rgba(0,0,0,0.06)',
                  padding: '1px 6px',
                  borderRadius: 4,
                  fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace',
                }}>{createError.code}</code>{' '}
                is already registered to <strong>{createError.existingName}</strong>.{' '}
                <Link
                  href={`/patients/${createError.existingId}`}
                  style={{textDecoration: 'underline', fontWeight: 600}}
                >
                  Open existing profile →
                </Link>
              </div>
            )}

            {createError?.kind === 'generic' && (
              <div style={{
                background: 'var(--danger-light)',
                color: 'var(--danger)',
                padding: '10px 14px',
                borderRadius: 10,
                marginBottom: 16,
                fontSize: '0.9rem',
              }}>
                {createError.message}
              </div>
            )}

            <form onSubmit={handleCreate}>
              <div className="input-group" style={{marginBottom:14}}>
                <label>
                  Patient ID <span style={{color: 'var(--danger)'}}>*</span>
                </label>
                <input
                  className="input"
                  placeholder="e.g. MRN-00821 or hospital ID"
                  value={form.patient_code}
                  onChange={e => setForm(f => ({ ...f, patient_code: e.target.value }))}
                  required
                  autoFocus
                  style={{
                    fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace',
                    fontSize: '0.95rem',
                  }}
                />
                <small style={{color: 'var(--text-secondary)', marginTop: 4, display: 'block'}}>
                  Must be unique. Reuse any existing identifier you already track for this patient.
                </small>
              </div>
              <div className="input-group" style={{marginBottom:14}}>
                <label>Full Name</label>
                <input className="input" placeholder="Patient name" value={form.full_name} onChange={e => setForm(f=>({...f, full_name: e.target.value}))} required />
              </div>
              <div className="input-group" style={{marginBottom:14}}>
                <label>Date of Birth</label>
                <input type="date" className="input" value={form.date_of_birth} onChange={e => setForm(f=>({...f, date_of_birth: e.target.value}))} required />
              </div>
              <div className="input-group" style={{marginBottom:14}}>
                <label>Sex</label>
                <select className="input select" value={form.sex} onChange={e => setForm(f=>({...f, sex: e.target.value}))}>
                  <option value="male">Male</option>
                  <option value="female">Female</option>
                </select>
              </div>
              <div className="input-group" style={{marginBottom:14}}>
                <label>Blood Type (Optional)</label>
                <select className="input select" value={form.blood_type} onChange={e => setForm(f=>({...f, blood_type: e.target.value}))}>
                  <option value="">Unknown</option>
                  <option value="A+">A+</option>
                  <option value="A-">A-</option>
                  <option value="B+">B+</option>
                  <option value="B-">B-</option>
                  <option value="AB+">AB+</option>
                  <option value="AB-">AB-</option>
                  <option value="O+">O+</option>
                  <option value="O-">O-</option>
                </select>
              </div>
              <div className="input-group" style={{marginBottom:14}}>
                <label>Medical History</label>
                <textarea className="input" placeholder="Allergies, chronic conditions..." value={form.medical_history} onChange={e => setForm(f=>({...f, medical_history: e.target.value}))} style={{minHeight: 60}} />
              </div>
              <div className="modal-footer">
                <button type="button" onClick={() => setShowCreate(false)} className="btn btn-secondary" disabled={creating}>Cancel</button>
                <button type="submit" className="btn btn-primary" disabled={creating}>{creating ? 'Creating...' : 'Create Patient'}</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ── Confirm Delete Modal (admin) ───────────────────────── */}
      {confirmDelete && (
        <div className="modal-overlay" onClick={() => !deleting && setConfirmDelete(null)}>
          <div className="modal" onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <h3>Delete patient?</h3>
            </div>
            <p style={{margin: '14px 0', lineHeight: 1.6}}>
              Permanently delete <strong>{confirmDelete.full_name}</strong>
              {confirmDelete.patient_code && (
                <> (<code>{confirmDelete.patient_code}</code>)</>
              )}{' '}
              and their <strong>{confirmDelete.case_count}</strong> case(s)?
              <br /><br />
              All linked X-rays, AI heatmaps, and PDF reports will be removed
              from disk.
              <span style={{color: 'var(--danger)', display: 'block', marginTop: 8, fontWeight: 600}}>
                This cannot be undone.
              </span>
            </p>
            <div className="modal-footer">
              <button
                className="btn btn-secondary"
                onClick={() => setConfirmDelete(null)}
                disabled={deleting}
              >
                Cancel
              </button>
              <button
                className="btn btn-danger"
                onClick={() => handleDelete(confirmDelete)}
                disabled={deleting}
              >
                {deleting ? 'Deleting...' : 'Delete patient'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
