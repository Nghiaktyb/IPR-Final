'use client';
import { useEffect, useMemo, useRef, useState } from 'react';
import api from '@/lib/api';
import styles from './training.module.css';
import sharedStyles from '../admin.module.css';
import {
  Upload,
  Trash2,
  Play,
  Rocket,
  CheckCircle2,
  AlertCircle,
  Cpu,
  RefreshCcw,
  Database,
  Activity,
  FileArchive,
  FileText,
  Image as ImageIcon,
  StopCircle,
} from 'lucide-react';

const STATUS_BADGE = {
  ready: { label: 'Ready', cls: 'badge-success' },
  ingesting: { label: 'Ingesting', cls: 'badge-warning' },
  failed: { label: 'Failed', cls: 'badge-danger' },
  queued: { label: 'Queued', cls: 'badge-warning' },
  running: { label: 'Running', cls: 'badge-primary' },
  completed: { label: 'Completed', cls: 'badge-success' },
  promoted: { label: 'Promoted', cls: 'badge-success' },
  cancelled: { label: 'Cancelled', cls: 'badge-secondary' },
};

function StatusBadge({ status }) {
  const meta = STATUS_BADGE[status] || { label: status || 'Unknown', cls: 'badge-primary' };
  return <span className={`badge ${meta.cls}`}>{meta.label}</span>;
}

function formatDate(s) {
  if (!s) return '—';
  try {
    return new Date(s).toLocaleString();
  } catch {
    return s;
  }
}

export default function TrainingPage() {
  const [caps, setCaps] = useState(null);
  const [datasets, setDatasets] = useState([]);
  const [runs, setRuns] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  // Upload form
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [archive, setArchive] = useState(null);
  const [csvFile, setCsvFile] = useState(null);
  const [imageFiles, setImageFiles] = useState([]);
  const [uploading, setUploading] = useState(false);

  // Train modal
  const [trainModalDataset, setTrainModalDataset] = useState(null);
  const [hp, setHp] = useState({
    epochs: 5,
    batch_size: 16,
    learning_rate: 0.0001,
    val_split: 0.2,
    max_samples: '',
    seed: 42,
  });
  const [starting, setStarting] = useState(false);
  const [cancellingId, setCancellingId] = useState(null);

  const pollerRef = useRef(null);

  const load = async () => {
    try {
      const [c, ds, rs] = await Promise.all([
        api.getTrainingCapabilities().catch(() => null),
        api.getTrainingDatasets(),
        api.getTrainingRuns(),
      ]);
      setCaps(c);
      setDatasets(ds.datasets || []);
      setRuns(rs.runs || []);
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  // Auto-poll while any run is queued/running.
  const hasActiveRun = useMemo(
    () => runs.some(r => r.status === 'queued' || r.status === 'running'),
    [runs],
  );
  useEffect(() => {
    if (!hasActiveRun) {
      if (pollerRef.current) {
        clearInterval(pollerRef.current);
        pollerRef.current = null;
      }
      return;
    }
    pollerRef.current = setInterval(load, 3000);
    return () => {
      if (pollerRef.current) clearInterval(pollerRef.current);
      pollerRef.current = null;
    };
  }, [hasActiveRun]);

  const handleUpload = async (e) => {
    e.preventDefault();
    if (!name) return alert('Please give the dataset a name.');
    if (!archive && (!csvFile || imageFiles.length === 0)) {
      return alert('Upload either a ZIP archive, or a CSV file PLUS one or more images.');
    }
    setUploading(true);
    try {
      await api.uploadTrainingDataset({
        name, description,
        archive, csvFile,
        images: imageFiles,
      });
      setName('');
      setDescription('');
      setArchive(null);
      setCsvFile(null);
      setImageFiles([]);
      load();
    } catch (e) {
      alert(`Upload failed: ${e.message}`);
    } finally {
      setUploading(false);
    }
  };

  const handleDelete = async (ds) => {
    if (!confirm(`Delete dataset "${ds.name}" and its files?`)) return;
    try {
      await api.deleteTrainingDataset(ds.id);
      load();
    } catch (e) {
      alert(e.message);
    }
  };

  const handleStartTrain = async () => {
    if (!trainModalDataset) return;
    setStarting(true);
    try {
      const payload = {
        dataset_id: trainModalDataset.id,
        epochs: Number(hp.epochs),
        batch_size: Number(hp.batch_size),
        learning_rate: Number(hp.learning_rate),
        val_split: Number(hp.val_split),
        seed: Number(hp.seed),
      };
      if (hp.max_samples) payload.max_samples = Number(hp.max_samples);
      await api.startTrainingRun(payload);
      setTrainModalDataset(null);
      load();
    } catch (e) {
      alert(e.message);
    } finally {
      setStarting(false);
    }
  };

  const handleCancelRun = async (run) => {
    if (!confirm(
      `Stop training run on "${datasets.find(d => d.id === run.dataset_id)?.name || 'this dataset'}"?\n\n` +
      `The best checkpoint observed so far will be kept and can still be promoted.`,
    )) return;
    setCancellingId(run.id);
    try {
      await api.cancelTrainingRun(run.id);
      load();
    } catch (e) {
      alert(`Could not cancel: ${e.message}`);
    } finally {
      setCancellingId(null);
    }
  };

  const handlePromote = async (run) => {
    if (!confirm(
      `Promote this run's checkpoint to be the active production model?\n\n` +
      `This replaces the current model file (a backup will be saved alongside).`,
    )) return;
    try {
      await api.promoteTrainingRun(run.id);
      load();
    } catch (e) {
      alert(e.message);
    }
  };

  if (loading) {
    return <div className="loading-center"><div className="loading-spinner"></div></div>;
  }

  return (
    <div>
      <div className={sharedStyles.header}>
        <div className={sharedStyles.headerBadge}>COMMAND CENTER</div>
        <h1>AI Training</h1>
        <p className={styles.subheading}>
          Upload labelled chest X-rays (NIH ChestX-ray14 CSV format) and fine-tune the production model.
        </p>
      </div>

      {/* Capabilities banner */}
      <div className={`${styles.capsBanner} ${caps?.torch_available ? styles.capsOk : styles.capsWarn}`}>
        <Cpu size={18} />
        {caps ? (
          caps.torch_available ? (
            <span>
              PyTorch detected — training will run on{' '}
              <strong>{caps.device || 'cpu'}</strong>.
              {' '}Disease classes: <strong>{caps.disease_classes.join(', ')}</strong>.
            </span>
          ) : (
            <span>
              PyTorch is not installed on the server — datasets can be uploaded
              but training cannot run yet. Install <code>torch</code> + <code>torchvision</code> to enable.
            </span>
          )
        ) : <span>Checking server capabilities…</span>}
        <button className="btn btn-ghost btn-sm" onClick={load} style={{ marginLeft: 'auto' }}>
          <RefreshCcw size={14} /> Refresh
        </button>
      </div>

      {error && (
        <div className={`${styles.capsBanner} ${styles.capsWarn}`}>
          <AlertCircle size={18} /> <span>{error}</span>
        </div>
      )}

      <div className={styles.grid}>
        {/* ── Upload ── */}
        <section className={styles.panel}>
          <h2 className={styles.panelTitle}><Upload size={18} /> Upload a dataset</h2>
          <form onSubmit={handleUpload} className={styles.form}>
            <div className="input-group">
              <label>Name *</label>
              <input
                className="input"
                value={name}
                onChange={e => setName(e.target.value)}
                placeholder="e.g. NIH-mini-batch-1"
                required
              />
            </div>
            <div className="input-group">
              <label>Description</label>
              <textarea
                className="input textarea"
                value={description}
                onChange={e => setDescription(e.target.value)}
                placeholder="Optional notes about this dataset"
              />
            </div>

            <div className={styles.uploadModes}>
              <div className={styles.uploadCol}>
                <h4><FileArchive size={16} /> Option A — ZIP archive</h4>
                <p className={styles.subtle}>
                  Drop a single .zip containing both the CSV labels file and the image files.
                </p>
                <input
                  type="file"
                  accept=".zip"
                  onChange={e => setArchive(e.target.files?.[0] || null)}
                />
                {archive && <small>{archive.name} ({(archive.size / 1024 / 1024).toFixed(1)} MB)</small>}
              </div>

              <div className={styles.divider}><span>OR</span></div>

              <div className={styles.uploadCol}>
                <h4><FileText size={16} /> Option B — CSV + images</h4>
                <p className={styles.subtle}>
                  Upload the labels CSV and select all matching image files.
                </p>
                <label className={styles.inlineLabel}>CSV (Image Index, Finding Labels)</label>
                <input
                  type="file"
                  accept=".csv"
                  onChange={e => setCsvFile(e.target.files?.[0] || null)}
                />
                {csvFile && <small>{csvFile.name}</small>}

                <label className={styles.inlineLabel} style={{ marginTop: 12 }}>
                  <ImageIcon size={12} style={{ display: 'inline', verticalAlign: '-2px', marginRight: 4 }} />
                  Image files
                </label>
                <input
                  type="file"
                  accept=".png,.jpg,.jpeg"
                  multiple
                  onChange={e => setImageFiles(Array.from(e.target.files || []))}
                />
                {imageFiles.length > 0 && <small>{imageFiles.length} image(s) selected</small>}
              </div>
            </div>

            <button type="submit" className="btn btn-primary" disabled={uploading} style={{ marginTop: 12 }}>
              {uploading ? 'Uploading…' : 'Upload dataset'}
            </button>
            <p className={styles.helpText}>
              Only the <code>Image Index</code> and <code>Finding Labels</code> columns are read.
              Multi-labels are pipe-separated (e.g. <code>Effusion|Mass</code>). Rows without a
              supported label and not marked <code>No Finding</code> are skipped.
            </p>
          </form>
        </section>

        {/* ── Datasets ── */}
        <section className={styles.panel}>
          <h2 className={styles.panelTitle}><Database size={18} /> Datasets</h2>
          {datasets.length === 0 && (
            <div className={styles.emptyTraining}>
              <Database size={36} />
              <p>No datasets uploaded yet. Use the upload form to get started.</p>
            </div>
          )}
          {datasets.map(ds => (
            <div key={ds.id} className={styles.datasetCard}>
              <div className={styles.dsHeader}>
                <div>
                  <div className={styles.dsTitle}>{ds.name}</div>
                  <div className={styles.dsMeta}>
                    {ds.usable_rows} / {ds.total_rows} rows usable · uploaded {formatDate(ds.created_at)}
                  </div>
                </div>
                <StatusBadge status={ds.status} />
              </div>
              {ds.description && <p className={styles.dsDesc}>{ds.description}</p>}
              {ds.label_summary && (
                <div className={styles.labelChips}>
                  {Object.entries(ds.label_summary).map(([d, c]) => (
                    <span
                      key={d}
                      className={`${styles.chip} ${d === 'No Finding' ? styles.chipNoFinding : ''}`}
                      title={`${c} sample(s) labelled ${d}`}
                    >
                      {d} <strong>{c}</strong>
                    </span>
                  ))}
                </div>
              )}
              {ds.error_message && (
                <div className={styles.errorBox}>
                  <AlertCircle size={14} style={{ flexShrink: 0, marginTop: 1 }} />
                  <span>{ds.error_message}</span>
                </div>
              )}
              <div className={styles.dsActions}>
                <button
                  className="btn btn-primary btn-sm"
                  onClick={() => setTrainModalDataset(ds)}
                  disabled={ds.status !== 'ready' || ds.usable_rows < 4}
                >
                  <Play size={14} /> Train
                </button>
                <button className="btn btn-danger btn-sm" onClick={() => handleDelete(ds)}>
                  <Trash2 size={14} /> Delete
                </button>
              </div>
            </div>
          ))}
        </section>
      </div>

      {/* ── Runs ── */}
      <section className={styles.panel} style={{ marginTop: 24 }}>
        <h2 className={styles.panelTitle}><Activity size={18} /> Training runs</h2>
        {runs.length === 0 && (
          <div className={styles.emptyTraining}>
            <Activity size={36} />
            <p>No training runs yet. Click <strong>Train</strong> on a dataset to start one.</p>
          </div>
        )}
        {runs.map(r => {
          const ds = datasets.find(d => d.id === r.dataset_id);
          const pct = r.epochs ? Math.min(100, Math.round((r.current_epoch / r.epochs) * 100)) : 0;
          const isActive = r.status === 'queued' || r.status === 'running';
          return (
            <div key={r.id} className={styles.runCard}>
              <div className={styles.runHeader}>
                <div>
                  <div className={styles.runTitle}>{ds?.name || r.dataset_id.slice(0, 8)}</div>
                  <div className={styles.dsMeta}>
                    <span>{r.epochs} epochs</span>
                    <span>·</span>
                    <span>batch {r.batch_size}</span>
                    <span>·</span>
                    <span>lr {r.learning_rate}</span>
                    <span>·</span>
                    <span>val {Math.round(r.val_split * 100)}%</span>
                  </div>
                </div>
                <StatusBadge status={r.status} />
              </div>

              <div className={styles.progressTrack}>
                <div
                  className={`${styles.progressFill} ${!isActive ? styles.progressFillIdle : ''}`}
                  style={{ width: `${pct}%` }}
                />
              </div>
              <div className={styles.runStats}>
                <div className={styles.statPill}>
                  <span className={styles.statPillLabel}>Epoch</span>
                  <span className={`${styles.statPillValue} ${styles.accent}`}>
                    {r.current_epoch}/{r.epochs}
                  </span>
                </div>
                <div className={styles.statPill}>
                  <span className={styles.statPillLabel}>Train loss</span>
                  <span className={styles.statPillValue}>
                    {r.train_loss != null ? r.train_loss.toFixed(4) : '—'}
                  </span>
                </div>
                <div className={styles.statPill}>
                  <span className={styles.statPillLabel}>Val loss</span>
                  <span className={styles.statPillValue}>
                    {r.val_loss != null ? r.val_loss.toFixed(4) : '—'}
                  </span>
                </div>
                <div className={styles.statPill}>
                  <span className={styles.statPillLabel}>Best</span>
                  <span className={`${styles.statPillValue} ${styles.accent}`}>
                    {r.best_val_loss != null ? r.best_val_loss.toFixed(4) : '—'}
                  </span>
                </div>
              </div>

              {r.error_message && (
                <div className={styles.errorBox}>
                  <AlertCircle size={14} style={{ flexShrink: 0, marginTop: 1 }} />
                  <span>{r.error_message}</span>
                </div>
              )}

              <div className={styles.timestamps}>
                <span><strong>Started</strong>{formatDate(r.started_at)}</span>
                <span><strong>Finished</strong>{formatDate(r.finished_at)}</span>
              </div>

              <div className={styles.dsActions}>
                {isActive && (
                  <button
                    className="btn btn-danger btn-sm"
                    onClick={() => handleCancelRun(r)}
                    disabled={cancellingId === r.id}
                  >
                    <StopCircle size={14} />
                    {cancellingId === r.id ? 'Stopping…' : 'Stop training'}
                  </button>
                )}
                {(r.status === 'completed' || (r.status === 'cancelled' && r.checkpoint_path)) && (
                  <button className="btn btn-success btn-sm" onClick={() => handlePromote(r)}>
                    <Rocket size={14} /> Promote to active model
                  </button>
                )}
                {r.status === 'promoted' && (
                  <span className={styles.promotedBadge}>
                    <CheckCircle2 size={12} /> Active production checkpoint
                  </span>
                )}
              </div>
            </div>
          );
        })}
      </section>

      {/* ── Train modal ── */}
      {trainModalDataset && (
        <div className="modal-overlay" onClick={() => setTrainModalDataset(null)}>
          <div className="modal" onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <h2>Train on “{trainModalDataset.name}”</h2>
              <button className="btn btn-ghost btn-sm" onClick={() => setTrainModalDataset(null)}>✕</button>
            </div>
            <p className={styles.subtle} style={{ marginBottom: 14 }}>
              {trainModalDataset.usable_rows} usable rows.
              Training warm-starts from the current production checkpoint when available.
            </p>
            <div className={styles.hpGrid}>
              {[
                ['epochs', 'Epochs'],
                ['batch_size', 'Batch size'],
                ['learning_rate', 'Learning rate'],
                ['val_split', 'Validation split'],
                ['max_samples', 'Max samples (optional)'],
                ['seed', 'Random seed'],
              ].map(([k, label]) => (
                <div key={k} className="input-group">
                  <label>{label}</label>
                  <input
                    className="input"
                    type="number"
                    step={k === 'learning_rate' ? '0.00001' : k === 'val_split' ? '0.05' : '1'}
                    value={hp[k]}
                    onChange={e => setHp({ ...hp, [k]: e.target.value })}
                  />
                </div>
              ))}
            </div>
            <div className="modal-footer">
              <button className="btn btn-secondary" onClick={() => setTrainModalDataset(null)}>Cancel</button>
              <button
                className="btn btn-primary"
                onClick={handleStartTrain}
                disabled={starting || !caps?.torch_available}
              >
                {starting ? 'Starting…' : 'Start training'}
              </button>
            </div>
            {!caps?.torch_available && (
              <p className={styles.warnText}>
                PyTorch isn't installed on the server, so this run will fail immediately.
                Install <code>torch</code> + <code>torchvision</code> to enable training.
              </p>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
