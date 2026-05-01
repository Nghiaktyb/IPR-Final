'use client';
import { useEffect, useState } from 'react';
import api from '@/lib/api';
import styles from '../admin.module.css';

export default function AuditPage() {
  const [logs, setLogs] = useState([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState('');

  const load = async (action = '') => {
    setLoading(true);
    try {
      const params = { limit: 50 };
      if (action) params.action = action;
      const r = await api.getAuditLogs(params);
      setLogs(r.logs || []);
      setTotal(r.total || 0);
    } catch (e) { console.error(e); }
    finally { setLoading(false); }
  };
  useEffect(() => { load(); }, []);

  const actionColor = (action) => {
    if (action.includes('login') || action.includes('register')) return 'badge-primary';
    if (action.includes('upload') || action.includes('create')) return 'badge-success';
    if (action.includes('deactivate') || action.includes('delete')) return 'badge-danger';
    if (action.includes('validate') || action.includes('generate')) return 'badge-warning';
    return 'badge-primary';
  };

  return (
    <div>
      <div className={styles.header}>
        <div className={styles.headerBadge}>COMMAND CENTER</div>
        <h1>Security & Audit Trail</h1>
        <p style={{color:'var(--text-muted)', marginTop:4}}>Showing {logs.length} of {total} entries</p>
      </div>

      <div style={{marginBottom:16, display:'flex', gap:8}}>
        {['', 'login', 'upload_xray', 'validate_finding', 'generate_report'].map(a => (
          <button key={a} className={`btn btn-sm ${filter === a ? 'btn-primary' : 'btn-secondary'}`}
            style={filter !== a ? {background:'var(--admin-card)', borderColor:'var(--admin-border)', color:'var(--admin-text)'} : {}}
            onClick={() => { setFilter(a); load(a); }}>
            {a || 'All'}
          </button>
        ))}
      </div>

      <div style={{background:'var(--admin-card)', borderRadius:14, border:'1px solid var(--admin-border)', overflow:'hidden'}}>
        {loading ? <div className="loading-center"><div className="loading-spinner"></div></div> : (
          <table className="table" style={{color:'var(--admin-text)'}}>
            <thead><tr style={{background:'var(--admin-bg)'}}><th>Timestamp</th><th>User</th><th>Action</th><th>Resource</th><th>IP</th></tr></thead>
            <tbody>
              {logs.map(l => (
                <tr key={l.id} style={{borderColor:'var(--admin-border)'}}>
                  <td style={{fontSize:'0.82rem'}}>{new Date(l.created_at).toLocaleString()}</td>
                  <td style={{fontWeight:600}}>{l.user_name || l.user_id?.slice(0,8)}</td>
                  <td><span className={`badge ${actionColor(l.action)}`}>{l.action}</span></td>
                  <td style={{fontSize:'0.82rem'}}>{l.resource_type ? `${l.resource_type} #${l.resource_id?.slice(0,8) || ''}` : '-'}</td>
                  <td style={{fontSize:'0.82rem', color:'var(--text-muted)'}}>{l.ip_address || '-'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
