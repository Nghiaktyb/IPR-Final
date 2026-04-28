'use client';
import { useEffect, useState } from 'react';
import api from '@/lib/api';
import Link from 'next/link';

export default function PatientsPage() {
  const [patients, setPatients] = useState([]);
  const [search, setSearch] = useState('');
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [form, setForm] = useState({ full_name: '', date_of_birth: '', sex: 'male' });
  const [creating, setCreating] = useState(false);

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

  const handleCreate = async (e) => {
    e.preventDefault();
    setCreating(true);
    try {
      await api.createPatient(form);
      setShowCreate(false);
      setForm({ full_name: '', date_of_birth: '', sex: 'male' });
      loadPatients(search);
    } catch (e) { alert(e.message); }
    finally { setCreating(false); }
  };

  return (
    <div>
      <div style={{display:'flex', justifyContent:'space-between', alignItems:'flex-start', marginBottom:28}}>
        <div>
          <h1>Patient Directory</h1>
          <p style={{color:'var(--text-secondary)', marginTop:4}}>Manage cases and review AI diagnostic insights</p>
        </div>
        <button onClick={() => setShowCreate(true)} className="btn btn-primary">+ New Patient</button>
      </div>

      <div className="stats-grid" style={{marginBottom:24}}>
        <div className="stat-card">
          <div className="stat-value">{total}</div>
          <div className="stat-label">Total Patients</div>
        </div>
      </div>

      <div className="card" style={{overflow:'hidden'}}>
        <div style={{padding:'16px 20px', borderBottom:'1px solid var(--border-light)', display:'flex', gap:12}}>
          <input className="input" placeholder="Search patients..." value={search} onChange={handleSearch} style={{maxWidth:300}} />
        </div>

        {loading ? (
          <div className="loading-center"><div className="loading-spinner"></div></div>
        ) : patients.length === 0 ? (
          <div className="empty-state">
            <p>No patients found. Create your first patient to begin.</p>
          </div>
        ) : (
          <table className="table">
            <thead><tr><th>Name</th><th>DOB</th><th>Sex</th><th>Cases</th><th>Created</th><th>Actions</th></tr></thead>
            <tbody>
              {patients.map(p => (
                <tr key={p.id}>
                  <td style={{fontWeight:600}}>{p.full_name}</td>
                  <td>{p.date_of_birth}</td>
                  <td><span className="badge badge-primary">{p.sex}</span></td>
                  <td>{p.case_count}</td>
                  <td>{new Date(p.created_at).toLocaleDateString()}</td>
                  <td>
                    <Link href={`/cases/new?patient=${p.id}`} className="btn btn-ghost btn-sm">Upload X-ray</Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {showCreate && (
        <div className="modal-overlay" onClick={() => setShowCreate(false)}>
          <div className="modal" onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <h3>New Patient</h3>
              <button onClick={() => setShowCreate(false)} className="btn btn-ghost btn-icon">X</button>
            </div>
            <form onSubmit={handleCreate}>
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
              <div className="modal-footer">
                <button type="button" onClick={() => setShowCreate(false)} className="btn btn-secondary">Cancel</button>
                <button type="submit" className="btn btn-primary" disabled={creating}>{creating ? 'Creating...' : 'Create Patient'}</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
