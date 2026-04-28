'use client';
import { useEffect, useState } from 'react';
import api from '@/lib/api';
import Link from 'next/link';
import styles from './admin.module.css';

export default function AdminDashboard() {
  const [stats, setStats] = useState(null);
  const [aiPerf, setAiPerf] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function load() {
      try {
        const [s, a] = await Promise.all([api.getDashboardStats(), api.getAIPerformance()]);
        setStats(s);
        setAiPerf(a);
      } catch (e) { console.error(e); }
      finally { setLoading(false); }
    }
    load();
  }, []);

  if (loading) return <div className="loading-center"><div className="loading-spinner"></div></div>;

  return (
    <div>
      <div className={styles.header}>
        <div className={styles.headerBadge}>COMMAND CENTER</div>
        <h1>Admin Dashboard</h1>
      </div>

      <div className={styles.statsGrid}>
        {[
          { label: 'Total Cases', value: stats?.total_cases || 0, color: '#1a73e8' },
          { label: 'Active Users', value: stats?.total_users || 0, color: '#6c63ff' },
          { label: 'Pending Review', value: stats?.pending_review || 0, color: '#f9a825' },
          { label: 'Completed', value: stats?.completed || 0, color: '#0d904f' },
        ].map(s => (
          <div key={s.label} className={styles.statCard}>
            <div className={styles.statValue} style={{color: s.color}}>{s.value}</div>
            <div className={styles.statLabel}>{s.label}</div>
          </div>
        ))}
      </div>

      <div className={styles.section}>
        <h2>AI Performance by Disease</h2>
        <div className={styles.perfGrid}>
          {aiPerf.map(p => (
            <div key={p.disease} className={styles.perfCard}>
              <h4>{p.disease}</h4>
              <div className={styles.perfStats}>
                <div>
                  <span className={styles.perfNum} style={{color:'#0d904f'}}>{(p.accept_rate * 100).toFixed(0)}%</span>
                  <span className={styles.perfLabel}>Accept</span>
                </div>
                <div>
                  <span className={styles.perfNum} style={{color:'#d93025'}}>{(p.reject_rate * 100).toFixed(0)}%</span>
                  <span className={styles.perfLabel}>Reject</span>
                </div>
                <div>
                  <span className={styles.perfNum}>{p.total_findings}</span>
                  <span className={styles.perfLabel}>Total</span>
                </div>
              </div>
              <div className={styles.perfBar}>
                <div style={{width:`${p.accept_rate * 100}%`, background:'#0d904f', height:'100%', borderRadius:4}}></div>
              </div>
            </div>
          ))}
        </div>
      </div>

      <div className={styles.navCards}>
        <Link href="/admin/users" className={styles.navCard}>
          <span className={styles.navIcon}>K</span>
          <h3>User Management</h3>
          <p>Manage staff accounts and roles</p>
        </Link>
        <Link href="/admin/audit" className={styles.navCard}>
          <span className={styles.navIcon}>A</span>
          <h3>Audit Trail</h3>
          <p>Security and action logs</p>
        </Link>
        <Link href="/admin/ai-performance" className={styles.navCard}>
          <span className={styles.navIcon}>AI</span>
          <h3>AI Metrics</h3>
          <p>Model accuracy and feedback</p>
        </Link>
      </div>
    </div>
  );
}
