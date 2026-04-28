'use client';
import { useEffect, useState } from 'react';
import api from '@/lib/api';
import styles from '../admin.module.css';

export default function UsersPage() {
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);

  const load = async () => {
    try {
      const r = await api.getUsers();
      setUsers(r.users || []);
    } catch (e) { console.error(e); }
    finally { setLoading(false); }
  };
  useEffect(() => { load(); }, []);

  const handleRoleChange = async (userId, newRole) => {
    try {
      await api.updateUser(userId, { role: newRole });
      load();
    } catch (e) { alert(e.message); }
  };

  const handleDeactivate = async (userId) => {
    if (!confirm('Deactivate this user?')) return;
    try {
      await api.deactivateUser(userId);
      load();
    } catch (e) { alert(e.message); }
  };

  if (loading) return <div className="loading-center"><div className="loading-spinner"></div></div>;

  return (
    <div>
      <div className={styles.header}>
        <div className={styles.headerBadge}>COMMAND CENTER</div>
        <h1>User Management</h1>
      </div>
      <div style={{background:'var(--admin-card)', borderRadius:14, border:'1px solid var(--admin-border)', overflow:'hidden'}}>
        <table className="table" style={{color:'var(--admin-text)'}}>
          <thead><tr style={{background:'var(--admin-bg)'}}><th>Name</th><th>Email</th><th>Role</th><th>Status</th><th>Joined</th><th>Actions</th></tr></thead>
          <tbody>
            {users.map(u => (
              <tr key={u.id} style={{borderColor:'var(--admin-border)'}}>
                <td style={{fontWeight:600}}>{u.full_name}</td>
                <td>{u.email}</td>
                <td>
                  <select value={u.role} onChange={e => handleRoleChange(u.id, e.target.value)}
                    style={{background:'transparent', color:'inherit', border:'1px solid var(--admin-border)', borderRadius:6, padding:'4px 8px', fontSize:'0.85rem'}}>
                    <option value="technician">Technician</option>
                    <option value="radiologist">Radiologist</option>
                    <option value="admin">Admin</option>
                  </select>
                </td>
                <td><span className={`badge ${u.is_active ? 'badge-success' : 'badge-danger'}`}>{u.is_active ? 'Active' : 'Inactive'}</span></td>
                <td>{new Date(u.created_at).toLocaleDateString()}</td>
                <td>
                  {u.is_active && <button className="btn btn-danger btn-sm" onClick={() => handleDeactivate(u.id)}>Deactivate</button>}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
