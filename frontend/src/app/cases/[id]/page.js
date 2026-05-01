'use client';
import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import api from '@/lib/api';
import styles from './viewer.module.css';
import {
  ClipboardList,
  User,
  Stethoscope,
  CalendarDays,
  RefreshCw,
  FileText,
  Image,
  Brain,
  AlertTriangle,
  Crosshair,
  Search,
  Check,
  X,
  Flame,
  PenLine,
  Download,
  Loader,
  Wind,
  Droplets,
  Bug,
  Circle,
  PlusCircle,
  Microscope,
} from 'lucide-react';

export default function DiagnosticViewer() {
  const { id } = useParams();
  const router = useRouter();
  const [caseData, setCaseData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [activeHeatmap, setActiveHeatmap] = useState(null);
  const [heatmapOpacity, setHeatmapOpacity] = useState(0.5);
  const [validating, setValidating] = useState({});
  const [notes, setNotes] = useState({});
  const [showReport, setShowReport] = useState(false);
  const [conclusion, setConclusion] = useState('');
  const [generating, setGenerating] = useState(false);
  const [threshold, setThreshold] = useState(0.5);
  const [imgError, setImgError] = useState(false);

  const loadCase = async () => {
    try {
      const data = await api.getCase(id);
      setCaseData(data);
      setThreshold(data.sensitivity_threshold || 0.5);
    } catch (e) { console.error(e); }
    finally { setLoading(false); }
  };

  useEffect(() => { loadCase(); }, [id]);

  const handleValidate = async (findingId, status) => {
    setValidating(v => ({...v, [findingId]: true}));
    try {
      await api.validateFinding(findingId, {
        validation_status: status,
        doctor_notes: notes[findingId] || null,
      });
      await loadCase();
    } catch (e) { alert(e.message); }
    finally { setValidating(v => ({...v, [findingId]: false})); }
  };

  const handleRerun = async () => {
    setLoading(true);
    try {
      await api.rerunAnalysis(id, threshold);
      await loadCase();
    } catch (e) { alert(e.message); }
    finally { setLoading(false); }
  };

  const handleReport = async () => {
    setGenerating(true);
    try {
      const report = await api.generateReport(id, { conclusion, digital_signature: null });
      const blob = await api.downloadReport(report.id);
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url; a.download = `MediX_Report_${id.slice(0,8)}.pdf`; a.click();
      URL.revokeObjectURL(url);
      setShowReport(false);
      await loadCase();
    } catch (e) { alert(e.message); }
    finally { setGenerating(false); }
  };

  if (loading) return <div className="loading-center"><div className="loading-spinner"></div></div>;
  if (!caseData) return <div className="empty-state"><p>Case not found</p></div>;

  const imageUrl = api.getCaseImageUrl(id);
  const findings = caseData.findings || [];
  const flagged = findings.filter(f => f.is_flagged === 'true');

  const getConfColor = (conf) => {
    if (conf >= 0.7) return 'var(--danger)';
    if (conf >= 0.5) return 'var(--warning)';
    return 'var(--primary)';
  };

  const getSeverity = (conf) => {
    if (conf >= 0.7) return 'danger';
    if (conf >= 0.5) return 'warning';
    return 'normal';
  };

  const getDiseaseIcon = (disease) => {
    const icons = {
      'Atelectasis': Wind,
      'Effusion': Droplets,
      'Pneumonia': Bug,
      'Nodule': Circle,
      'Mass': PlusCircle,
    };
    const IconComp = icons[disease] || Microscope;
    return <IconComp size={16} />;
  };

  const statusConfig = {
    pending:   { label: 'Pending', class: 'badge-warning' },
    analyzed:  { label: 'Analyzed', class: 'badge-primary' },
    finalized: { label: 'Finalized', class: 'badge-success' },
  };

  const st = statusConfig[caseData.status] || statusConfig.pending;

  const currentImageSrc = activeHeatmap
    ? api.getHeatmapUrl(id, activeHeatmap)
    : imageUrl;

  return (
    <div className={styles.viewer}>
      {/* ── Header ───────────────────────────────────── */}
      <div className={styles.viewerHeader}>
        <div className={styles.headerLeft}>
          <h2>Diagnostic Viewer</h2>
          <div className={styles.headerMeta}>
            <span className={styles.metaChip}>
              <span className={styles.chipIcon}><ClipboardList size={14} /></span>
              Case #{id.slice(0,8)}
            </span>
            <span className={styles.metaChip}>
              <span className={styles.chipIcon}><User size={14} /></span>
              {caseData.patient_name || 'Unknown'}
            </span>
            <span className={`badge ${st.class}`}>
              {st.label}
            </span>
            {caseData.uploaded_by_name && (
              <span className={styles.metaChip}>
                <span className={styles.chipIcon}><Stethoscope size={14} /></span>
                Dr. {caseData.uploaded_by_name}
              </span>
            )}
            <span className={styles.metaChip}>
              <span className={styles.chipIcon}><CalendarDays size={14} /></span>
              {new Date(caseData.created_at).toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' })}
            </span>
          </div>
        </div>
        <div className={styles.headerActions}>
          <button onClick={handleRerun} className="btn btn-secondary btn-sm">
            <RefreshCw size={14} /> Re-analyze
          </button>
          <button onClick={() => setShowReport(true)} className="btn btn-primary">
            <FileText size={14} /> Generate Report
          </button>
        </div>
      </div>

      {/* ── Content Grid ─────────────────────────────── */}
      <div className={styles.viewerGrid}>

        {/* ─ Left: Image Viewer ─ */}
        <div className={styles.imagePanel}>
          {/* Toolbar with tabs */}
          <div className={styles.imageToolbar}>
            <div className={styles.toolbarTabs}>
              <button
                className={`${styles.tabBtn} ${!activeHeatmap ? styles.tabBtnActive : ''}`}
                onClick={() => { setActiveHeatmap(null); setImgError(false); }}
              >
                <Image size={14} /> Original
              </button>
              {findings.map(f => (
                <button
                  key={f.disease_name}
                  className={`${styles.tabBtn} ${activeHeatmap === f.disease_name ? styles.tabBtnActive : ''}`}
                  onClick={() => {
                    setActiveHeatmap(activeHeatmap === f.disease_name ? null : f.disease_name);
                    setImgError(false);
                  }}
                >
                  {getDiseaseIcon(f.disease_name)} {f.disease_name}
                </button>
              ))}
            </div>
          </div>

          {/* Image display */}
          <div className={styles.imageContainer}>
            {imgError ? (
              <div className={styles.noImageMsg}>
                <span className={styles.noImageIcon}><Image size={40} /></span>
                <span>{activeHeatmap ? `Heatmap not available for ${activeHeatmap}` : 'Image not available'}</span>
              </div>
            ) : (
              <img
                src={currentImageSrc}
                alt={activeHeatmap ? `${activeHeatmap} heatmap` : 'X-ray image'}
                className={styles.xrayImage}
                style={activeHeatmap ? { opacity: Math.min(heatmapOpacity * 1.5 + 0.25, 1) } : {}}
                onError={() => setImgError(true)}
              />
            )}

            {activeHeatmap && !imgError && (
              <div className={styles.heatmapOverlay}>
                <span className={styles.heatmapDot}></span>
                Heatmap: {activeHeatmap}
              </div>
            )}
          </div>

          {/* Opacity slider for heatmap */}
          {activeHeatmap && !imgError && (
            <div className={styles.opacityStrip}>
              <span>Opacity</span>
              <input
                type="range" min="0.1" max="1" step="0.05"
                value={heatmapOpacity}
                onChange={e => setHeatmapOpacity(parseFloat(e.target.value))}
              />
              <span className={styles.opacityValue}>{Math.round(heatmapOpacity * 100)}%</span>
            </div>
          )}
        </div>

        {/* ─ Right: AI Insights ─ */}
        <div className={styles.insightsPanel}>
          {/* Header */}
          <div className={styles.insightsHeader}>
            <div className={styles.insightsTitle}>
              <span className={styles.insightsIcon}><Brain size={20} /></span>
              <h3>AI Diagnostic Insights</h3>
            </div>
            {flagged.length > 0 && (
              <span className={styles.flagCount}>
                <AlertTriangle size={14} /> {flagged.length} Flagged
              </span>
            )}
          </div>

          {/* Sensitivity threshold */}
          <div className={styles.thresholdControl}>
            <span className={styles.thresholdLabel}>
              <span className={styles.tIcon}><Crosshair size={14} /></span> Sensitivity
            </span>
            <input
              type="range" min="0.1" max="0.9" step="0.05"
              value={threshold}
              onChange={e => setThreshold(parseFloat(e.target.value))}
            />
            <span className={styles.thresholdValue}>{Math.round(threshold * 100)}%</span>
          </div>

          {/* Findings list */}
          {findings.length === 0 ? (
            <div className={styles.emptyFindings}>
              <div className={styles.emptyIcon}><Search size={40} /></div>
              <p>No findings available. Upload an X-ray to get AI analysis.</p>
            </div>
          ) : (
            <div className={styles.findingsList}>
              {findings.map(f => {
                const severity = getSeverity(f.confidence_score);
                const isFlagged = f.is_flagged === 'true';

                return (
                  <div
                    key={f.id}
                    className={`${styles.findingCard} ${isFlagged ? styles.flagged : ''}`}
                  >
                    {/* Disease name + confidence */}
                    <div className={styles.findingTop}>
                      <div className={styles.diseaseInfo}>
                        <div className={`${styles.diseaseIcon} ${
                          severity === 'danger' ? styles.iconDanger :
                          severity === 'warning' ? styles.iconWarning :
                          styles.iconNormal
                        }`}>
                          {getDiseaseIcon(f.disease_name)}
                        </div>
                        <div>
                          <span className={styles.diseaseName}>
                            {f.disease_name}
                          </span>
                          {isFlagged && (
                            <span className={styles.flagBadge}>FLAGGED</span>
                          )}
                        </div>
                      </div>
                      <div className={styles.confBlock}>
                        <div className={styles.confValue} style={{ color: getConfColor(f.confidence_score) }}>
                          {(f.confidence_score * 100).toFixed(1)}%
                        </div>
                        <div className={styles.confLabel}>confidence</div>
                      </div>
                    </div>

                    {/* Confidence bar */}
                    <div className={styles.confBarTrack}>
                      <div
                        className={styles.confBarFill}
                        style={{
                          width: `${f.confidence_score * 100}%`,
                          background: `linear-gradient(90deg, ${getConfColor(f.confidence_score)}, ${getConfColor(f.confidence_score)}cc)`,
                        }}
                      />
                    </div>

                    {/* Validation buttons + heatmap toggle */}
                    <div className={styles.validationRow}>
                      {f.validation_status === 'pending' ? (
                        <>
                          <button
                            className="btn btn-success btn-sm"
                            disabled={validating[f.id]}
                            onClick={() => handleValidate(f.id, 'accepted')}
                          ><Check size={14} /> Accept</button>
                          <button
                            className="btn btn-danger btn-sm"
                            disabled={validating[f.id]}
                            onClick={() => handleValidate(f.id, 'rejected')}
                          ><X size={14} /> Reject</button>
                        </>
                      ) : (
                        <span className={`badge ${f.validation_status === 'accepted' ? 'badge-success' : 'badge-danger'}`}>
                          {f.validation_status === 'accepted' ? <><Check size={12} /> Accepted</> : <><X size={12} /> Rejected</>}
                        </span>
                      )}
                      <button
                        className={`${styles.heatmapBtn || ''} ${activeHeatmap === f.disease_name ? styles.heatmapBtnActive : ''}`}
                        onClick={() => {
                          setActiveHeatmap(activeHeatmap === f.disease_name ? null : f.disease_name);
                          setImgError(false);
                        }}
                        style={{
                          marginLeft: 'auto',
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: '4px',
                          padding: '5px 12px',
                          borderRadius: '6px',
                          fontSize: '0.78rem',
                          fontWeight: 600,
                          background: activeHeatmap === f.disease_name ? 'var(--primary-light)' : 'var(--bg-card)',
                          color: activeHeatmap === f.disease_name ? 'var(--primary)' : 'var(--text-secondary)',
                          border: `1px solid ${activeHeatmap === f.disease_name ? 'var(--primary)' : 'var(--border)'}`,
                          cursor: 'pointer',
                          transition: 'all 0.2s ease',
                        }}
                      >
                        <Flame size={14} /> {activeHeatmap === f.disease_name ? 'Hide' : 'View'} Heatmap
                      </button>
                    </div>

                    {/* Doctor notes */}
                    <textarea
                      className={styles.noteArea}
                      placeholder="Add clinical notes..."
                      value={notes[f.id] || f.doctor_notes || ''}
                      onChange={e => setNotes(n => ({...n, [f.id]: e.target.value}))}
                      rows={2}
                    />
                  </div>
                );
              })}
            </div>
          )}

          {/* Clinical notes from case */}
          {caseData.clinical_notes && (
            <div className={styles.clinicalNotes}>
              <div className={styles.clinicalNotesTitle}>
                <span className={styles.cnIcon}><PenLine size={16} /></span>
                Clinical Notes
              </div>
              <p>{caseData.clinical_notes}</p>
            </div>
          )}
        </div>
      </div>

      {/* ── Report Modal ─────────────────────────────── */}
      {showReport && (
        <div className="modal-overlay" onClick={() => setShowReport(false)}>
          <div className="modal" onClick={e => e.stopPropagation()} style={{maxWidth:550}}>
            <div className="modal-header">
              <h3><FileText size={18} style={{verticalAlign: 'middle', marginRight: 6}} />Generate Diagnostic Report</h3>
              <button onClick={() => setShowReport(false)} className="btn btn-ghost btn-icon"><X size={18} /></button>
            </div>
            <div className="input-group" style={{marginBottom:16}}>
              <label>Clinical Conclusion</label>
              <textarea
                className="input textarea"
                value={conclusion}
                onChange={e => setConclusion(e.target.value)}
                placeholder="Final diagnostic assessment and recommendations..."
                rows={4}
              />
            </div>
            <div className="modal-footer">
              <button onClick={() => setShowReport(false)} className="btn btn-secondary">Cancel</button>
              <button onClick={handleReport} className="btn btn-primary" disabled={generating}>
                {generating ? <><Loader size={14} className="spin" /> Generating PDF...</> : <><Download size={14} /> Generate &amp; Download</>}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
