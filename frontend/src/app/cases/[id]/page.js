'use client';
import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import api from '@/lib/api';
import styles from './viewer.module.css';

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

  return (
    <div className={styles.viewer}>
      <div className={styles.viewerHeader}>
        <div>
          <h2>Diagnostic Viewer</h2>
          <p className={styles.caseInfo}>
            Case #{id.slice(0,8)} &bull; {caseData.patient_name} &bull;
            <span className={`badge ${caseData.status === 'finalized' ? 'badge-success' : 'badge-primary'}`} style={{marginLeft:8}}>
              {caseData.status}
            </span>
          </p>
        </div>
        <div style={{display:'flex', gap:8}}>
          <button onClick={() => setShowReport(true)} className="btn btn-primary">Generate Report</button>
        </div>
      </div>

      <div className={styles.viewerGrid}>
        {/* Left: Image Viewer */}
        <div className={styles.imagePanel}>
          <div className={styles.imageContainer}>
            <img
              src={activeHeatmap ? api.getHeatmapUrl(id, activeHeatmap) : imageUrl}
              alt="X-ray"
              className={styles.xrayImage}
              style={activeHeatmap ? {opacity: heatmapOpacity * 2} : {}}
              crossOrigin="anonymous"
            />
            {activeHeatmap && (
              <div className={styles.heatmapLabel}>
                Heatmap: {activeHeatmap}
              </div>
            )}
          </div>

          <div className={styles.imageControls}>
            <button className={`btn btn-sm ${!activeHeatmap ? 'btn-primary' : 'btn-secondary'}`} onClick={() => setActiveHeatmap(null)}>
              Original
            </button>
            {findings.map(f => (
              <button
                key={f.disease_name}
                className={`btn btn-sm ${activeHeatmap === f.disease_name ? 'btn-primary' : 'btn-secondary'}`}
                onClick={() => setActiveHeatmap(f.disease_name === activeHeatmap ? null : f.disease_name)}
              >
                {f.disease_name}
              </button>
            ))}
          </div>

          {activeHeatmap && (
            <div className={styles.opacityControl}>
              <span>Opacity</span>
              <input type="range" min="0.1" max="1" step="0.05" value={heatmapOpacity} onChange={e => setHeatmapOpacity(parseFloat(e.target.value))} />
              <span>{Math.round(heatmapOpacity * 100)}%</span>
            </div>
          )}
        </div>

        {/* Right: AI Insights */}
        <div className={styles.insightsPanel}>
          <div className={styles.insightsHeader}>
            <h3>AI Insights</h3>
            {flagged.length > 0 && (
              <span className="badge badge-danger">{flagged.length} Flagged</span>
            )}
          </div>

          <div className={styles.thresholdControl}>
            <label>Sensitivity: {Math.round(threshold * 100)}%</label>
            <input type="range" min="0.1" max="0.9" step="0.05" value={threshold} onChange={e => setThreshold(parseFloat(e.target.value))} />
            <button className="btn btn-sm btn-secondary" onClick={handleRerun}>Re-analyze</button>
          </div>

          <div className={styles.findingsList}>
            {findings.map(f => (
              <div key={f.id} className={`${styles.findingCard} ${f.is_flagged === 'true' ? styles.flagged : ''}`}>
                <div className={styles.findingTop}>
                  <div>
                    <span className={styles.diseaseName}>{f.disease_name}</span>
                    {f.is_flagged === 'true' && <span className="badge badge-danger" style={{marginLeft:6}}>FLAGGED</span>}
                  </div>
                  <span className={styles.confValue} style={{color: getConfColor(f.confidence_score)}}>
                    {(f.confidence_score * 100).toFixed(1)}%
                  </span>
                </div>

                <div className="confidence-bar">
                  <div className="confidence-bar-fill" style={{
                    width: `${f.confidence_score * 100}%`,
                    background: getConfColor(f.confidence_score),
                  }}></div>
                </div>

                <div className={styles.validationRow}>
                  {f.validation_status === 'pending' ? (
                    <>
                      <button
                        className="btn btn-success btn-sm"
                        disabled={validating[f.id]}
                        onClick={() => handleValidate(f.id, 'accepted')}
                      >Accept</button>
                      <button
                        className="btn btn-danger btn-sm"
                        disabled={validating[f.id]}
                        onClick={() => handleValidate(f.id, 'rejected')}
                      >Reject</button>
                    </>
                  ) : (
                    <span className={`badge ${f.validation_status === 'accepted' ? 'badge-success' : 'badge-danger'}`}>
                      {f.validation_status}
                    </span>
                  )}
                  <button
                    className="btn btn-ghost btn-sm"
                    onClick={() => setActiveHeatmap(f.disease_name === activeHeatmap ? null : f.disease_name)}
                  >View Heatmap</button>
                </div>

                <textarea
                  className={`input ${styles.noteArea}`}
                  placeholder="Doctor's notes..."
                  value={notes[f.id] || f.doctor_notes || ''}
                  onChange={e => setNotes(n => ({...n, [f.id]: e.target.value}))}
                  rows={2}
                />
              </div>
            ))}
          </div>

          {caseData.clinical_notes && (
            <div className={styles.clinicalNotes}>
              <h4>Clinical Notes</h4>
              <p>{caseData.clinical_notes}</p>
            </div>
          )}
        </div>
      </div>

      {/* Report Modal */}
      {showReport && (
        <div className="modal-overlay" onClick={() => setShowReport(false)}>
          <div className="modal" onClick={e => e.stopPropagation()} style={{maxWidth:550}}>
            <div className="modal-header">
              <h3>Generate Report</h3>
              <button onClick={() => setShowReport(false)} className="btn btn-ghost btn-icon">X</button>
            </div>
            <div className="input-group" style={{marginBottom:16}}>
              <label>Clinical Conclusion</label>
              <textarea className="input textarea" value={conclusion} onChange={e => setConclusion(e.target.value)}
                placeholder="Final diagnostic assessment..." rows={4} />
            </div>
            <div className="modal-footer">
              <button onClick={() => setShowReport(false)} className="btn btn-secondary">Cancel</button>
              <button onClick={handleReport} className="btn btn-primary" disabled={generating}>
                {generating ? 'Generating PDF...' : 'Generate & Download'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
