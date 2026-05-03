'use client';
import { useEffect, useMemo, useState } from 'react';
import api from '@/lib/api';
import sharedStyles from '../admin.module.css';
import styles from './retention.module.css';
import {
  AlertTriangle,
  CheckCircle2,
  Clock,
  Database,
  FileText,
  Loader2,
  RefreshCcw,
  Search,
  ShieldAlert,
  Trash2,
  Users,
} from 'lucide-react';

const fmtDate = (s) => {
  if (!s) return '—';
  try { return new Date(s).toLocaleDateString(); } catch { return s; }
};
const fmtBytes = (b) => {
  if (b == null) return '0 B';
  const u = ['B', 'KB', 'MB', 'GB', 'TB'];
  let i = 0, n = b;
  while (n >= 1024 && i < u.length - 1) { n /= 1024; i++; }
  return `${n.toFixed(n >= 100 || i === 0 ? 0 : 1)} ${u[i]}`;
};
const ageFromDob = (dob) => {
  if (!dob) return '—';
  try {
    const d = new Date(dob);
    const diff = Date.now() - d.getTime();
    return `${Math.floor(diff / (1000 * 60 * 60 * 24 * 365.25))}y`;
  } catch { return '—'; }
};

export default function DataRetentionPage() {
  const [config, setConfig] = useState(null);
  const [years, setYears] = useState(7);
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [scanning, setScanning] = useState(false);
  const [error, setError] = useState(null);

  const [confirmPurge, setConfirmPurge] = useState(false);
  const [confirmOne, setConfirmOne] = useState(null);
  const [busy, setBusy] = useState(false);
  const [lastResult, setLastResult] = useState(null);
  const [search, setSearch] = useState('');

  // Initial config load — establishes the slider bounds + default.
  useEffect(() => {
    (async () => {
      try {
        const c = await api.getRetentionConfig();
        setConfig(c);
        setYears(c.default_years);
        await refresh(c.default_years);
      } catch (e) {
        setError(e.message);
        setLoading(false);
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const refresh = async (y = years) => {
    setScanning(true);
    setError(null);
    try {
      const d = await api.getExpiredPatients(y);
      setData(d);
    } catch (e) {
      setError(e.message);
    } finally {
      setScanning(false);
      setLoading(false);
    }
  };

  const filteredPatients = useMemo(() => {
    if (!data?.patients) return [];
    const q = search.trim().toLowerCase();
    if (!q) return data.patients;
    return data.patients.filter(
      p => p.full_name.toLowerCase().includes(q) || p.id.includes(q),
    );
  }, [data, search]);

  const handlePurgeAll = async () => {
    if (!data?.expired_count) return;
    setBusy(true);
    setError(null);
    try {
      const result = await api.purgeExpiredPatients(years);
      setLastResult({ kind: 'purge', ...result });
      setConfirmPurge(false);
      await refresh();
    } catch (e) {
      setError(`Purge failed: ${e.message}`);
    } finally {
      setBusy(false);
    }
  };

  const handleDeleteOne = async (p) => {
    setBusy(true);
    setError(null);
    try {
      const result = await api.deleteExpiredPatient(p.id);
      setLastResult({ kind: 'single', name: p.full_name, ...result });
      setConfirmOne(null);
      await refresh();
    } catch (e) {
      setError(`Could not delete: ${e.message}`);
    } finally {
      setBusy(false);
    }
  };

  if (loading) {
    return <div className="loading-center"><div className="loading-spinner"></div></div>;
  }

  return (
    <div>
      <div className={sharedStyles.header}>
        <div className={sharedStyles.headerBadge}>COMMAND CENTER</div>
        <h1>Data Retention</h1>
        <p className={styles.subheading}>
          Find and remove patient records that have passed the retention window.
          Cascades through cases, findings, reports, and on-disk files.
        </p>
      </div>

      {/* ── Caution banner ─────────────────────────────────── */}
      <div className={styles.warnBanner}>
        <ShieldAlert size={20} />
        <div>
          <strong>Destructive action.</strong> Deletions are <em>permanent</em> and
          cascade through every linked case, finding, report, X-ray image,
          heatmap, and PDF on disk. Make sure your backups are current before
          purging.
        </div>
      </div>

      {/* ── Policy controls ────────────────────────────────── */}
      <section className={styles.panel}>
        <header className={styles.panelHead}>
          <h2><Clock size={18} /> Retention policy</h2>
          <span className={styles.panelSub}>
            Patients with no activity (case upload, edit, or profile change) older
            than this window are flagged as expired.
          </span>
        </header>
        <div className={styles.policyRow}>
          <label className={styles.policyLabel} htmlFor="years">Inactivity threshold</label>
          <input
            id="years"
            type="range"
            min={config?.min_years || 1}
            max={config?.max_years || 30}
            step={1}
            value={years}
            onChange={e => setYears(Number(e.target.value))}
            className={styles.slider}
          />
          <div className={styles.policyValue}>
            <strong>{years}</strong>
            <small>year{years === 1 ? '' : 's'}</small>
          </div>
          <button
            className="btn btn-primary btn-sm"
            onClick={() => refresh(years)}
            disabled={scanning}
          >
            {scanning ? <Loader2 size={14} className={styles.spin} /> : <RefreshCcw size={14} />}
            {scanning ? ' Scanning…' : ' Re-scan'}
          </button>
        </div>
        {data && (
          <p className={styles.cutoffNote}>
            Cutoff date: <strong>{fmtDate(data.cutoff_date)}</strong> ·
            Anything dormant since this date will be removed.
          </p>
        )}
      </section>

      {/* ── Summary tiles ─────────────────────────────────── */}
      {data && (
        <div className={styles.summaryGrid}>
          <SummaryCard
            icon={<Users size={18} />}
            label="Patients in DB"
            value={data.total_patients_in_db}
            tone="neutral"
          />
          <SummaryCard
            icon={<AlertTriangle size={18} />}
            label="Flagged as expired"
            value={data.expired_count}
            tone="warning"
          />
          <SummaryCard
            icon={<Database size={18} />}
            label="Cases to remove"
            value={data.expired_case_count}
            tone="danger"
          />
          <SummaryCard
            icon={<FileText size={18} />}
            label="Reports to remove"
            value={data.expired_report_count}
            tone="danger"
          />
        </div>
      )}

      {error && (
        <div className={styles.errorBox}>
          <AlertTriangle size={16} />
          <span>{error}</span>
        </div>
      )}

      {lastResult && (
        <div className={styles.successBox}>
          <CheckCircle2 size={16} />
          <span>
            {lastResult.kind === 'purge'
              ? `Purge complete: ${lastResult.patients_deleted} patient(s), ${lastResult.cases_deleted} case(s), `
                + `${lastResult.reports_deleted} report(s), ${lastResult.files_removed} file(s) (${fmtBytes(lastResult.bytes_removed)}) removed.`
              : `Deleted "${lastResult.name}" — ${lastResult.cases_deleted} case(s), ${lastResult.files_removed} file(s) (${fmtBytes(lastResult.bytes_removed)}) cleaned.`
            }
            {lastResult.errors?.length > 0 && (
              <span className={styles.errorList}>
                {' '}({lastResult.errors.length} non-fatal error{lastResult.errors.length === 1 ? '' : 's'})
              </span>
            )}
          </span>
          <button
            className="btn btn-ghost btn-sm"
            onClick={() => setLastResult(null)}
            style={{ marginLeft: 'auto' }}
          >
            Dismiss
          </button>
        </div>
      )}

      {/* ── Expired patients table ────────────────────────── */}
      <section className={styles.panel}>
        <header className={styles.panelHead}>
          <h2><Trash2 size={18} /> Expired patients</h2>
          <div className={styles.tableActions}>
            <div className={styles.searchBox}>
              <Search size={14} />
              <input
                placeholder="Filter by name or ID"
                value={search}
                onChange={e => setSearch(e.target.value)}
              />
            </div>
            <button
              className="btn btn-danger btn-sm"
              onClick={() => setConfirmPurge(true)}
              disabled={!data?.expired_count || busy}
            >
              <Trash2 size={14} /> Purge all expired
            </button>
          </div>
        </header>

        {!data || data.patients.length === 0 ? (
          <div className={styles.empty}>
            <CheckCircle2 size={36} />
            <p>
              <strong>Nothing to clean up.</strong>
              <br />
              No patients are past the {years}-year retention window.
            </p>
          </div>
        ) : (
          <div className={styles.tableWrap}>
            <table className={styles.table}>
              <thead>
                <tr>
                  <th>Patient</th>
                  <th>Born</th>
                  <th>Sex</th>
                  <th>Last activity</th>
                  <th className={styles.colNum}>Days inactive</th>
                  <th className={styles.colNum}>Cases</th>
                  <th className={styles.colNum}>Reports</th>
                  <th>State</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {filteredPatients.map(p => (
                  <tr key={p.id}>
                    <td>
                      <div className={styles.nameCell}>
                        <div className={styles.avatar}>
                          {p.full_name?.[0]?.toUpperCase() || '?'}
                        </div>
                        <div>
                          <div className={styles.name}>{p.full_name}</div>
                          <div className={styles.idLine}>{p.id.slice(0, 8)}…</div>
                        </div>
                      </div>
                    </td>
                    <td>
                      {fmtDate(p.date_of_birth)}{' '}
                      <small className={styles.muted}>({ageFromDob(p.date_of_birth)})</small>
                    </td>
                    <td>{p.sex}</td>
                    <td>{fmtDate(p.last_activity_at)}</td>
                    <td className={styles.colNum}>{p.days_inactive ?? '—'}</td>
                    <td className={styles.colNum}>{p.case_count}</td>
                    <td className={styles.colNum}>{p.report_count}</td>
                    <td>
                      {p.is_archived
                        ? <span className="badge badge-secondary">Archived</span>
                        : <span className="badge badge-warning">Active</span>}
                    </td>
                    <td>
                      <button
                        className="btn btn-danger btn-sm"
                        onClick={() => setConfirmOne(p)}
                        disabled={busy}
                      >
                        <Trash2 size={14} /> Delete
                      </button>
                    </td>
                  </tr>
                ))}
                {filteredPatients.length === 0 && (
                  <tr>
                    <td colSpan={9} className={styles.muted} style={{ textAlign: 'center', padding: 20 }}>
                      No patients match “{search}”.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {/* ── Confirm: purge all ──────────────────────────────── */}
      {confirmPurge && data && (
        <div className="modal-overlay" onClick={() => !busy && setConfirmPurge(false)}>
          <div className="modal" onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <h2>Purge {data.expired_count} expired patient{data.expired_count === 1 ? '' : 's'}?</h2>
            </div>
            <p className={styles.confirmBody}>
              This will permanently delete every patient inactive for ≥
              <strong> {years} year{years === 1 ? '' : 's'}</strong>, plus
              their <strong>{data.expired_case_count}</strong> case(s) and
              <strong> {data.expired_report_count}</strong> report(s).
              The X-ray images, AI heatmaps, and PDF reports for those cases
              will be removed from disk.
              <br /><br />
              <strong>This cannot be undone.</strong>
            </p>
            <div className="modal-footer">
              <button
                className="btn btn-secondary"
                onClick={() => setConfirmPurge(false)}
                disabled={busy}
              >
                Cancel
              </button>
              <button
                className="btn btn-danger"
                onClick={handlePurgeAll}
                disabled={busy}
              >
                {busy ? <Loader2 size={14} className={styles.spin} /> : <Trash2 size={14} />}
                {busy ? ' Purging…' : ` Permanently delete ${data.expired_count}`}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Confirm: single delete ──────────────────────────── */}
      {confirmOne && (
        <div className="modal-overlay" onClick={() => !busy && setConfirmOne(null)}>
          <div className="modal" onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <h2>Delete “{confirmOne.full_name}”?</h2>
            </div>
            <p className={styles.confirmBody}>
              Permanently removes this patient and{' '}
              <strong>{confirmOne.case_count}</strong> case(s) /{' '}
              <strong>{confirmOne.report_count}</strong> report(s).
              All linked X-rays, heatmaps, and PDFs will be deleted from disk.
              <br /><br />
              <strong>This cannot be undone.</strong>
            </p>
            <div className="modal-footer">
              <button
                className="btn btn-secondary"
                onClick={() => setConfirmOne(null)}
                disabled={busy}
              >
                Cancel
              </button>
              <button
                className="btn btn-danger"
                onClick={() => handleDeleteOne(confirmOne)}
                disabled={busy}
              >
                {busy ? <Loader2 size={14} className={styles.spin} /> : <Trash2 size={14} />}
                {busy ? ' Deleting…' : ' Delete patient'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function SummaryCard({ icon, label, value, tone }) {
  return (
    <div className={`${styles.summaryCard} ${styles[`tone_${tone}`]}`}>
      <div className={styles.summaryIcon}>{icon}</div>
      <div>
        <div className={styles.summaryValue}>{value}</div>
        <div className={styles.summaryLabel}>{label}</div>
      </div>
    </div>
  );
}
