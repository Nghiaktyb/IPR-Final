'use client';
import { useEffect, useMemo, useState } from 'react';
import api from '@/lib/api';
import styles from '../admin.module.css';
import perfStyles from './ai-performance.module.css';
import {
  DonutChart,
  StackedBarRows,
  RankedBars,
  RadialGauge,
  Legend,
  STATUS_COLORS,
  STATUS_LABELS,
} from '@/components/charts/Charts';
import {
  Activity,
  CheckCircle2,
  XCircle,
  Edit3,
  Clock,
  TrendingUp,
  Layers,
  BarChart3,
} from 'lucide-react';

const rateColor = (r) =>
  r >= 0.7 ? '#0d904f' : r >= 0.4 ? '#f9a825' : '#d93025';

export default function AIPerformancePage() {
  const [data, setData] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api.getAIPerformance()
      .then(d => { setData(d || []); setLoading(false); })
      .catch(() => setLoading(false));
  }, []);

  const totals = useMemo(() => {
    return data.reduce(
      (acc, d) => ({
        findings: acc.findings + d.total_findings,
        accepted: acc.accepted + d.accepted,
        rejected: acc.rejected + d.rejected,
        edited:   acc.edited   + d.edited,
        pending:  acc.pending  + d.pending,
      }),
      { findings: 0, accepted: 0, rejected: 0, edited: 0, pending: 0 },
    );
  }, [data]);

  const overallRate = totals.findings > 0
    ? (totals.accepted / totals.findings) * 100
    : 0;

  // Status breakdown segments for the central donut.
  const overallSegments = [
    { label: STATUS_LABELS.accepted, value: totals.accepted, color: STATUS_COLORS.accepted },
    { label: STATUS_LABELS.rejected, value: totals.rejected, color: STATUS_COLORS.rejected },
    { label: STATUS_LABELS.edited,   value: totals.edited,   color: STATUS_COLORS.edited },
    { label: STATUS_LABELS.pending,  value: totals.pending,  color: STATUS_COLORS.pending },
  ];

  // Per-disease stacked rows — one bar per disease, segmented by status.
  const stackedRows = data.map(d => ({
    label: d.disease,
    total: <>{d.total_findings}<small>findings</small></>,
    segments: [
      { label: STATUS_LABELS.accepted, value: d.accepted, color: STATUS_COLORS.accepted },
      { label: STATUS_LABELS.rejected, value: d.rejected, color: STATUS_COLORS.rejected },
      { label: STATUS_LABELS.edited,   value: d.edited,   color: STATUS_COLORS.edited },
      { label: STATUS_LABELS.pending,  value: d.pending,  color: STATUS_COLORS.pending },
    ],
  }));

  // Accept-rate ranking (sorted high → low so "best disease" is on top).
  const rankItems = [...data]
    .sort((a, b) => b.accept_rate - a.accept_rate)
    .map(d => ({
      label: d.disease,
      value: (d.accept_rate || 0) * 100,
      color: rateColor(d.accept_rate || 0),
    }));

  if (loading) {
    return <div className="loading-center"><div className="loading-spinner"></div></div>;
  }

  return (
    <div>
      <div className={`${styles.header} ${perfStyles.headerEntrance}`}>
        <div className={styles.headerBadge}>COMMAND CENTER</div>
        <h1 className={perfStyles.headline}>AI Performance &amp; Quality Control</h1>
        <p className={perfStyles.subheading}>
          How clinicians are reviewing each AI finding — at a glance.
        </p>
      </div>

      {/* ── KPI strip ───────────────────────────────────── */}
      <div className={perfStyles.kpiStrip}>
        {[
          { icon: <Activity size={18} />,    label: 'Total findings',       value: totals.findings.toLocaleString(),  accent: '#1a73e8' },
          { icon: <TrendingUp size={18} />,  label: 'Overall accept rate',  value: `${overallRate.toFixed(1)}%`,      accent: rateColor(overallRate / 100) },
          { icon: <CheckCircle2 size={18} />, label: 'Accepted',            value: totals.accepted.toLocaleString(),  accent: STATUS_COLORS.accepted },
          { icon: <XCircle size={18} />,     label: 'Rejected',             value: totals.rejected.toLocaleString(),  accent: STATUS_COLORS.rejected },
          { icon: <Edit3 size={18} />,       label: 'Edited',               value: totals.edited.toLocaleString(),    accent: STATUS_COLORS.edited },
          { icon: <Clock size={18} />,       label: 'Pending',              value: totals.pending.toLocaleString(),   accent: STATUS_COLORS.pending },
        ].map((k, i) => (
          <KPI
            key={k.label}
            icon={k.icon}
            label={k.label}
            value={k.value}
            accent={k.accent}
            delay={120 + i * 70}
          />
        ))}
      </div>

      {/* ── Top row: overall donut + accept-rate ranking ── */}
      <div className={perfStyles.twoCol}>
        <section className={perfStyles.panel}>
          <header className={perfStyles.panelHead}>
            <h2><Layers size={18} /> Overall status mix</h2>
            <span className={perfStyles.panelSub}>
              Across all diseases &amp; cases
            </span>
          </header>
          <div className={perfStyles.panelBody}>
            <div className={perfStyles.donutLayout}>
              <DonutChart
                segments={overallSegments}
                size={240}
                thickness={22}
                centerTop={`${overallRate.toFixed(1)}%`}
                centerBottom="Accept rate"
              />
              <Legend
                items={overallSegments.map(s => ({
                  label: s.label,
                  color: s.color,
                  value: s.value,
                }))}
              />
            </div>
          </div>
        </section>

        <section className={perfStyles.panel}>
          <header className={perfStyles.panelHead}>
            <h2><BarChart3 size={18} /> Accept rate by disease</h2>
            <span className={perfStyles.panelSub}>
              Sorted high → low. Green ≥ 70%, amber ≥ 40%, red &lt; 40%.
            </span>
          </header>
          <div className={perfStyles.panelBody}>
            {rankItems.length > 0 ? (
              <RankedBars items={rankItems} />
            ) : (
              <p className={perfStyles.empty}>No findings to evaluate yet.</p>
            )}
          </div>
        </section>
      </div>

      {/* ── Status distribution per disease ────────────── */}
      <section className={perfStyles.panel} style={{ marginTop: 20 }}>
        <header className={perfStyles.panelHead}>
          <h2><Layers size={18} /> Status distribution per disease</h2>
          <span className={perfStyles.panelSub}>
            Each row totals 100% — segment width shows the share of that
            disease's findings in each review state.
          </span>
        </header>
        {stackedRows.length > 0 ? (
          <>
            <StackedBarRows rows={stackedRows} />
            <div className={perfStyles.legendFooter}>
              <Legend items={overallSegments.map(s => ({ label: s.label, color: s.color }))} />
            </div>
          </>
        ) : (
          <p className={perfStyles.empty}>No diseases configured.</p>
        )}
      </section>

      {/* ── Per-disease detail cards ───────────────────── */}
      <h2 className={perfStyles.sectionH2}>Per-disease detail</h2>
      <div className={perfStyles.cardGrid}>
        {data.map((d, i) => (
          <DiseaseCard key={d.disease} d={d} delay={800 + i * 90} />
        ))}
        {data.length === 0 && (
          <p className={perfStyles.empty}>No data available.</p>
        )}
      </div>
    </div>
  );
}

function KPI({ icon, label, value, accent, delay = 0 }) {
  return (
    <div className={perfStyles.kpi} style={{ '--enter-delay': `${delay}ms` }}>
      <div
        className={perfStyles.kpiIcon}
        style={{ color: accent, background: `${accent}1f` }}
      >
        {icon}
      </div>
      <div className={perfStyles.kpiBody}>
        <div className={perfStyles.kpiValue} style={{ color: accent }}>{value}</div>
        <div className={perfStyles.kpiLabel}>{label}</div>
      </div>
    </div>
  );
}

function DiseaseCard({ d, delay = 0 }) {
  const segments = [
    { label: STATUS_LABELS.accepted, value: d.accepted, color: STATUS_COLORS.accepted },
    { label: STATUS_LABELS.rejected, value: d.rejected, color: STATUS_COLORS.rejected },
    { label: STATUS_LABELS.edited,   value: d.edited,   color: STATUS_COLORS.edited },
    { label: STATUS_LABELS.pending,  value: d.pending,  color: STATUS_COLORS.pending },
  ];
  const ratePct = (d.accept_rate || 0) * 100;
  const color = rateColor(d.accept_rate || 0);

  return (
    <div className={perfStyles.diseaseCard} style={{ '--enter-delay': `${delay}ms` }}>
      <div className={perfStyles.diseaseCardHead}>
        <h3>{d.disease}</h3>
        <span className={perfStyles.diseaseTotal}>
          {d.total_findings} <small>findings</small>
        </span>
      </div>
      <div className={perfStyles.diseaseCardBody}>
        <RadialGauge
          value={ratePct}
          label="Accept"
          color={color}
          size={130}
        />
        <div className={perfStyles.diseaseStats}>
          <StatTile color={STATUS_COLORS.accepted} label="Accepted" value={d.accepted} />
          <StatTile color={STATUS_COLORS.rejected} label="Rejected" value={d.rejected} />
          <StatTile color={STATUS_COLORS.edited}   label="Edited"   value={d.edited} />
          <StatTile color={STATUS_COLORS.pending}  label="Pending"  value={d.pending} />
        </div>
      </div>
      <div className={perfStyles.diseaseCardFooter}>
        <div className={perfStyles.miniLegendRow}>
          <span>Status mix</span>
          <span className={perfStyles.miniLegendHint}>
            hover for counts
          </span>
        </div>
        <MiniStacked segments={segments} />
      </div>
    </div>
  );
}

function StatTile({ color, label, value }) {
  return (
    <div className={perfStyles.statTile}>
      <div className={perfStyles.statDot} style={{ background: color }} />
      <div>
        <div className={perfStyles.statTileVal}>{value}</div>
        <div className={perfStyles.statTileLbl}>{label}</div>
      </div>
    </div>
  );
}

// Lightweight inline stacked bar used in disease cards (avoids importing the
// shared StackedBar styles for a special tighter look).
function MiniStacked({ segments }) {
  const total = segments.reduce((a, s) => a + (s.value || 0), 0);
  if (total === 0) {
    return <div className={perfStyles.miniBarEmpty}>No findings</div>;
  }
  return (
    <div className={perfStyles.miniBarTrack}>
      {segments.map(seg => {
        const w = (seg.value / total) * 100;
        if (w <= 0) return null;
        return (
          <div
            key={seg.label}
            className={perfStyles.miniBarSeg}
            style={{ width: `${w}%`, background: seg.color }}
            title={`${seg.label}: ${seg.value} (${w.toFixed(1)}%)`}
          />
        );
      })}
    </div>
  );
}
