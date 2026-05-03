/**
 * MedicX — Lightweight SVG chart kit
 *
 * Pure-React + SVG so we don't pull in a heavyweight charting library.
 * Charts share a small palette and respect the existing CSS theme (text
 * colours come from `var(--text-*)`, surface colours from `var(--admin-*)`).
 *
 * All components accept a `title`/`aria-label` and degrade gracefully when
 * given an empty/zero dataset (they render an empty-state instead of NaN).
 */
'use client';
import { useEffect, useId, useState } from 'react';
import styles from './charts.module.css';

/**
 * Tiny hook that flips `false → true` on the next paint after mount,
 * letting us drive a CSS transition (e.g. SVG `stroke-dasharray`) from
 * "empty" to "real value" on first render. Honours OS reduced-motion.
 */
function useMountedTick(delay = 80) {
  const [ready, setReady] = useState(false);
  useEffect(() => {
    if (typeof window !== 'undefined' &&
        window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) {
      setReady(true);
      return;
    }
    const t = setTimeout(() => setReady(true), delay);
    return () => clearTimeout(t);
  }, [delay]);
  return ready;
}

export const STATUS_COLORS = {
  accepted: '#0d904f',
  rejected: '#d93025',
  edited:   '#f9a825',
  pending:  '#1a73e8',
};

export const STATUS_LABELS = {
  accepted: 'Accepted',
  rejected: 'Rejected',
  edited:   'Edited',
  pending:  'Pending',
};

const _round = (n, digits = 1) => {
  const m = Math.pow(10, digits);
  return Math.round(n * m) / m;
};

/**
 * Compact horizontal legend.
 * items: [{ label, color, value? }]
 */
export function Legend({ items }) {
  return (
    <ul className={styles.legend}>
      {items.map(it => (
        <li key={it.label}>
          <span className={styles.legendDot} style={{ background: it.color }} />
          <span className={styles.legendLabel}>{it.label}</span>
          {it.value != null && (
            <span className={styles.legendValue}>{it.value}</span>
          )}
        </li>
      ))}
    </ul>
  );
}

/**
 * Donut chart drawn with a single SVG circle whose stroke is split into
 * arc segments via `stroke-dasharray`. Center labels are rendered as
 * absolutely-positioned HTML so they use the site font at crisp sizes
 * instead of relying on SVG text scaling.
 *
 * segments: [{ label, value, color }]
 */
export function DonutChart({
  segments,
  size = 200,
  thickness = 18,
  centerTop,
  centerBottom,
  responsive = false,
}) {
  const total = segments.reduce((a, s) => a + (s.value || 0), 0);
  const radius = 50 - thickness / 2;
  const circumference = 2 * Math.PI * radius;
  // Two-phase mount: first paint shows zero-length arcs, then we flip
  // `ready=true` so the CSS transition sweeps each arc to its real
  // length. Visually this looks like the donut "drawing in".
  const ready = useMountedTick(120);

  const arcs = [];
  if (total > 0) {
    let offset = 0;
    for (const seg of segments) {
      if (!seg.value) continue;
      const length = (seg.value / total) * circumference;
      arcs.push({
        ...seg,
        length,
        gap: circumference - length,
        offset: -offset,
      });
      offset += length;
    }
  }

  return (
    <div
      className={styles.donutWrap}
      style={responsive ? { width: '100%' } : { width: size, height: size }}
    >
      <svg viewBox="0 0 100 100" width="100%" height="100%" role="img">
        {/* background ring */}
        <circle
          cx="50"
          cy="50"
          r={radius}
          fill="none"
          stroke="var(--border-light, #f0f2f5)"
          strokeWidth={thickness}
        />
        {arcs.map(seg => (
          <circle
            key={seg.label}
            cx="50"
            cy="50"
            r={radius}
            fill="none"
            stroke={seg.color}
            strokeWidth={thickness}
            strokeLinecap="butt"
            strokeDasharray={
              ready ? `${seg.length} ${seg.gap}` : `0 ${circumference}`
            }
            strokeDashoffset={seg.offset}
            transform="rotate(-90 50 50)"
            style={{
              transition:
                'stroke-dasharray 1100ms cubic-bezier(0.16, 1, 0.3, 1)',
            }}
          >
            <title>{`${seg.label}: ${seg.value} (${_round((seg.value / total) * 100)}%)`}</title>
          </circle>
        ))}
      </svg>
      {/* HTML overlay so center text uses site font at native pixel size. */}
      <div className={styles.donutCenter}>
        {total === 0 ? (
          <span className={styles.donutCenterEmpty}>No data</span>
        ) : (
          <>
            {centerTop && (
              <span className={styles.donutCenterTop}>{centerTop}</span>
            )}
            {centerBottom && (
              <span className={styles.donutCenterBottom}>{centerBottom}</span>
            )}
          </>
        )}
      </div>
    </div>
  );
}

/**
 * Single horizontal stacked bar, sized proportionally to the segment values.
 *
 * Numbers intentionally are NOT rendered inside segments — that would force
 * white-on-yellow contrast issues for amber "Edited" segments. Exact values
 * surface via the segment's hover tooltip and the accompanying legend.
 */
export function StackedBar({ segments, height = 22 }) {
  const total = segments.reduce((a, s) => a + (s.value || 0), 0);
  if (total === 0) {
    return (
      <div
        className={styles.stackedEmpty}
        style={{ height }}
        title="No data"
      >
        no data
      </div>
    );
  }
  return (
    <div className={styles.stackedBar} style={{ height }}>
      {segments.map(seg => {
        const w = (seg.value / total) * 100;
        if (w <= 0) return null;
        return (
          <div
            key={seg.label}
            className={styles.stackedSeg}
            style={{ width: `${w}%`, background: seg.color }}
            title={`${seg.label}: ${seg.value} (${_round(w)}%)`}
          />
        );
      })}
    </div>
  );
}

/**
 * Table-style chart: one row per dataset, each row showing the label,
 * a stacked bar, and the row total.
 *
 * rows: [{ label, segments: [...], total }]
 */
export function StackedBarRows({ rows }) {
  return (
    <div className={styles.rowChart}>
      {rows.map(r => (
        <div key={r.label} className={styles.rowChartRow}>
          <div className={styles.rowChartLabel}>{r.label}</div>
          <div className={styles.rowChartBar}>
            <StackedBar segments={r.segments} />
          </div>
          <div className={styles.rowChartTotal}>{r.total}</div>
        </div>
      ))}
    </div>
  );
}

/**
 * Horizontal bar chart for ranking values (e.g. accept-rate per disease).
 * Each item: { label, value, max?, color, suffix? }
 */
export function RankedBars({ items, max = 100, suffix = '%' }) {
  return (
    <div className={styles.ranked}>
      {items.map(it => {
        const pct = Math.max(0, Math.min(100, (it.value / (it.max || max)) * 100));
        return (
          <div key={it.label} className={styles.rankedRow}>
            <div className={styles.rankedLabel}>{it.label}</div>
            <div className={styles.rankedTrack}>
              <div
                className={styles.rankedFill}
                style={{ width: `${pct}%`, background: it.color }}
              />
            </div>
            <div className={styles.rankedValue} style={{ color: it.color }}>
              {_round(it.value)}{suffix}
            </div>
          </div>
        );
      })}
    </div>
  );
}

/**
 * Compact circular gauge — useful inside cards.
 * value: 0..max, default max=100. Optional accent colour.
 */
export function RadialGauge({ value, max = 100, label, color = '#0d904f', size = 120 }) {
  const id = useId();
  const radius = 42;
  const circumference = 2 * Math.PI * radius;
  const pct = Math.max(0, Math.min(1, value / max));
  const dash = circumference * pct;
  // Sweep-in: start empty, then transition to the real dash on mount.
  const ready = useMountedTick(160);

  return (
    <div className={styles.gaugeWrap} style={{ width: size, height: size }}>
      <svg viewBox="0 0 100 100" width="100%" height="100%" role="img">
        <defs>
          <linearGradient id={`gauge-${id}`} x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stopColor={color} stopOpacity="0.75" />
            <stop offset="100%" stopColor={color} stopOpacity="1" />
          </linearGradient>
        </defs>
        <circle
          cx="50" cy="50" r={radius}
          fill="none"
          stroke="var(--border-light, #f0f2f5)"
          strokeWidth="9"
        />
        <circle
          cx="50" cy="50" r={radius}
          fill="none"
          stroke={`url(#gauge-${id})`}
          strokeWidth="9"
          strokeLinecap="round"
          strokeDasharray={
            ready ? `${dash} ${circumference - dash}` : `0 ${circumference}`
          }
          transform="rotate(-90 50 50)"
          style={{
            transition:
              'stroke-dasharray 1100ms cubic-bezier(0.16, 1, 0.3, 1)',
          }}
        />
      </svg>
      <div className={styles.gaugeCenter}>
        <span className={styles.gaugeValue} style={{ color }}>
          {_round(value)}%
        </span>
        {label && <span className={styles.gaugeLabel}>{label}</span>}
      </div>
    </div>
  );
}
