'use client';
import { useEffect, useState } from 'react';
import { useAuth } from '@/lib/auth';
import api from '@/lib/api';
import Link from 'next/link';
import styles from './page.module.css';

export default function DashboardPage() {
  const { user } = useAuth();
  const [stats, setStats] = useState(null);
  const [cases, setCases] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function load() {
      try {
        const [s, c] = await Promise.all([
          api.getDashboardStats(),
          api.getCases({ limit: 5 }),
        ]);
        setStats(s);
        setCases(c.cases || []);
      } catch (e) {
        console.error(e);
      } finally {
        setLoading(false);
      }
    }
    load();
  }, []);

  if (loading) return <div className="loading-center"><div className="loading-spinner"></div></div>;

  return (
    <div>
      <div className={styles.pageHeader}>
        <div>
          <h1>Dashboard</h1>
          <p className={styles.subtitle}>Welcome back, {user?.full_name}</p>
        </div>
        <Link href="/cases/new" className="btn btn-primary">
          + Upload X-ray
        </Link>
      </div>

      <div className="stats-grid" style={{marginBottom: 28}}>
        <div className="stat-card">
          <div className="stat-icon" style={{background: 'var(--primary-light)', color: 'var(--primary)'}}>CT</div>
          <div className="stat-value">{stats?.total_cases || 0}</div>
          <div className="stat-label">Total Cases</div>
        </div>
        <div className="stat-card">
          <div className="stat-icon" style={{background: 'var(--danger-light)', color: 'var(--danger)'}}>!</div>
          <div className="stat-value">{stats?.flagged_urgent || 0}</div>
          <div className="stat-label">Flagged Urgent</div>
        </div>
        <div className="stat-card">
          <div className="stat-icon" style={{background: 'var(--warning-light)', color: 'var(--warning)'}}>?</div>
          <div className="stat-value">{stats?.pending_review || 0}</div>
          <div className="stat-label">Pending Review</div>
        </div>
        <div className="stat-card">
          <div className="stat-icon" style={{background: 'var(--success-light)', color: 'var(--success)'}}>OK</div>
          <div className="stat-value">{stats?.completed || 0}</div>
          <div className="stat-label">Completed</div>
        </div>
      </div>

      <div className="card" style={{overflow:'hidden'}}>
        <div className={styles.tableHeader}>
          <h3>Recent Cases</h3>
          <Link href="/patients" className="btn btn-ghost btn-sm">View all patients</Link>
        </div>
        {cases.length === 0 ? (
          <div className="empty-state">
            <div className="empty-icon">X</div>
            <p>No cases yet. Upload your first X-ray to get started.</p>
            <Link href="/cases/new" className="btn btn-primary" style={{marginTop: 16}}>Upload X-ray</Link>
          </div>
        ) : (
          <div className="table-wrapper" style={{border:'none'}}>
            <table className="table">
              <thead>
                <tr>
                  <th>Patient</th>
                  <th>File</th>
                  <th>Status</th>
                  <th>Uploaded By</th>
                  <th>Date</th>
                  <th>Action</th>
                </tr>
              </thead>
              <tbody>
                {cases.map(c => (
                  <tr key={c.id}>
                    <td style={{fontWeight:600}}>{c.patient_name || 'Unknown'}</td>
                    <td>{c.image_filename}</td>
                    <td><span className={`badge ${c.status === 'finalized' ? 'badge-success' : c.status === 'analyzed' ? 'badge-primary' : 'badge-warning'}`}>{c.status}</span></td>
                    <td>{c.uploaded_by_name || '-'}</td>
                    <td>{new Date(c.created_at).toLocaleDateString()}</td>
                    <td><Link href={`/cases/${c.id}`} className="btn btn-ghost btn-sm">View</Link></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
