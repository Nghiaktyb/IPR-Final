'use client';
import { useEffect, useState } from 'react';
import api from '@/lib/api';
import styles from '../admin.module.css';

export default function AIPerformancePage() {
  const [data, setData] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api.getAIPerformance().then(d => { setData(d); setLoading(false); }).catch(() => setLoading(false));
  }, []);

  if (loading) return <div className="loading-center"><div className="loading-spinner"></div></div>;

  const totalFindings = data.reduce((a, d) => a + d.total_findings, 0);
  const totalAccepted = data.reduce((a, d) => a + d.accepted, 0);
  const totalRejected = data.reduce((a, d) => a + d.rejected, 0);
  const overallAcceptRate = totalFindings > 0 ? (totalAccepted / totalFindings * 100).toFixed(1) : 0;

  return (
    <div>
      <div className={styles.header}>
        <div className={styles.headerBadge}>COMMAND CENTER</div>
        <h1>AI Performance & Quality Control</h1>
      </div>

      <div className={styles.statsGrid} style={{gridTemplateColumns:'repeat(4, 1fr)'}}>
        <div className={styles.statCard}>
          <div className={styles.statValue} style={{color:'#1a73e8'}}>{totalFindings}</div>
          <div className={styles.statLabel}>Total Findings</div>
        </div>
        <div className={styles.statCard}>
          <div className={styles.statValue} style={{color:'#0d904f'}}>{overallAcceptRate}%</div>
          <div className={styles.statLabel}>Overall Accept Rate</div>
        </div>
        <div className={styles.statCard}>
          <div className={styles.statValue} style={{color:'#0d904f'}}>{totalAccepted}</div>
          <div className={styles.statLabel}>Accepted</div>
        </div>
        <div className={styles.statCard}>
          <div className={styles.statValue} style={{color:'#d93025'}}>{totalRejected}</div>
          <div className={styles.statLabel}>Rejected</div>
        </div>
      </div>

      <h2 style={{marginBottom:16}}>Per-Disease Analysis</h2>
      <div style={{display:'grid', gridTemplateColumns:'repeat(auto-fit, minmax(280px, 1fr))', gap:16}}>
        {data.map(d => (
          <div key={d.disease} style={{background:'var(--admin-card)', border:'1px solid var(--admin-border)', borderRadius:14, padding:24}}>
            <h3 style={{marginBottom:16}}>{d.disease}</h3>
            <div style={{display:'grid', gridTemplateColumns:'repeat(2, 1fr)', gap:12, marginBottom:16}}>
              <div>
                <div style={{fontSize:'1.5rem', fontWeight:800, color:'#0d904f'}}>{d.accepted}</div>
                <div style={{fontSize:'0.75rem', color:'var(--text-muted)'}}>ACCEPTED</div>
              </div>
              <div>
                <div style={{fontSize:'1.5rem', fontWeight:800, color:'#d93025'}}>{d.rejected}</div>
                <div style={{fontSize:'0.75rem', color:'var(--text-muted)'}}>REJECTED</div>
              </div>
              <div>
                <div style={{fontSize:'1.5rem', fontWeight:800, color:'#f9a825'}}>{d.edited}</div>
                <div style={{fontSize:'0.75rem', color:'var(--text-muted)'}}>EDITED</div>
              </div>
              <div>
                <div style={{fontSize:'1.5rem', fontWeight:800, color:'#1a73e8'}}>{d.pending}</div>
                <div style={{fontSize:'0.75rem', color:'var(--text-muted)'}}>PENDING</div>
              </div>
            </div>
            <div style={{marginBottom:8, fontSize:'0.85rem', display:'flex', justifyContent:'space-between'}}>
              <span>Agreement Rate</span>
              <span style={{fontWeight:700, color: d.accept_rate >= 0.7 ? '#0d904f' : d.accept_rate >= 0.4 ? '#f9a825' : '#d93025'}}>
                {(d.accept_rate * 100).toFixed(0)}%
              </span>
            </div>
            <div style={{height:8, background:'rgba(0,0,0,0.08)', borderRadius:4, overflow:'hidden'}}>
              <div style={{height:'100%', width:`${d.accept_rate * 100}%`, background: d.accept_rate >= 0.7 ? '#0d904f' : d.accept_rate >= 0.4 ? '#f9a825' : '#d93025', borderRadius:4, transition:'width 0.6s ease'}}></div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
