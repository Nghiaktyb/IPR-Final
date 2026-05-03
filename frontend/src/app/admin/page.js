'use client';
import { useEffect, useMemo, useState } from 'react';
import api from '@/lib/api';
import Link from 'next/link';
import styles from './admin.module.css';
import {
  StackedBarRows,
  RankedBars,
  Legend,
  STATUS_COLORS,
  STATUS_LABELS,
} from '@/components/charts/Charts';

const rateColor = (r) =>
  r >= 0.7 ? '#0d904f' : r >= 0.4 ? '#f9a825' : '#d93025';

export default function AdminDashboard() {
  const [stats, setStats] = useState(null);
  const [aiPerf, setAiPerf] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function load() {
      try {
        const [s, a] = await Promise.all([api.getDashboardStats(), api.getAIPerformance()]);
        setStats(s);
        setAiPerf(a || []);
      } catch (e) { console.error(e); }
      finally { setLoading(false); }
    }
    load();
  }, []);

  const stackedRows = useMemo(() => aiPerf.map(p => ({
    label: p.disease,
    total: p.total_findings,
    segments: [
      { label: STATUS_LABELS.accepted, value: p.accepted, color: STATUS_COLORS.accepted },
      { label: STATUS_LABELS.rejected, value: p.rejected, color: STATUS_COLORS.rejected },
      { label: STATUS_LABELS.edited,   value: p.edited,   color: STATUS_COLORS.edited },
      { label: STATUS_LABELS.pending,  value: p.pending,  color: STATUS_COLORS.pending },
    ],
  })), [aiPerf]);

  const acceptRanking = useMemo(() => [...aiPerf]
    .sort((a, b) => b.accept_rate - a.accept_rate)
    .map(p => ({
      label: p.disease,
      value: (p.accept_rate || 0) * 100,
      color: rateColor(p.accept_rate || 0),
    })), [aiPerf]);

  const legendItems = [
    { label: STATUS_LABELS.accepted, color: STATUS_COLORS.accepted },
    { label: STATUS_LABELS.rejected, color: STATUS_COLORS.rejected },
    { label: STATUS_LABELS.edited,   color: STATUS_COLORS.edited },
    { label: STATUS_LABELS.pending,  color: STATUS_COLORS.pending },
  ];

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

      <div className={styles.dashCharts}>
        <section className={styles.chartPanel}>
          <header className={styles.chartHead}>
            <h2>Status distribution by disease</h2>
            <span className={styles.chartSub}>
              Each bar = 100% of that disease's findings
            </span>
          </header>
          {stackedRows.length > 0 ? (
            <>
              <StackedBarRows rows={stackedRows} />
              <div style={{ marginTop: 14 }}>
                <Legend items={legendItems} />
              </div>
              <Link href="/admin/ai-performance" className={styles.chartMore}>
                View full AI performance →
              </Link>
            </>
          ) : (
            <p className={styles.chartEmpty}>No findings logged yet.</p>
          )}
        </section>

        <section className={styles.chartPanel}>
          <header className={styles.chartHead}>
            <h2>Accept rate ranking</h2>
            <span className={styles.chartSub}>Sorted high → low</span>
          </header>
          {acceptRanking.length > 0 ? (
            <RankedBars items={acceptRanking} />
          ) : (
            <p className={styles.chartEmpty}>No findings to rank yet.</p>
          )}
        </section>
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
        <Link href="/admin/training" className={styles.navCard}>
          <span className={styles.navIcon}>T</span>
          <h3>AI Training</h3>
          <p>Feed labelled X-rays and fine-tune the model</p>
        </Link>
        <Link href="/admin/retention" className={styles.navCard}>
          <span className={styles.navIcon}>R</span>
          <h3>Data Retention</h3>
          <p>Find and delete patient records past retention</p>
        </Link>
      </div>
    </div>
  );
}
