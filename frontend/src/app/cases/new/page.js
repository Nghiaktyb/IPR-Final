'use client';
import { useState, useEffect, useRef } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import api from '@/lib/api';
import styles from './new.module.css';

export default function UploadXrayPage() {
  const [patients, setPatients] = useState([]);
  const [patientId, setPatientId] = useState('');
  const [notes, setNotes] = useState('');
  const [file, setFile] = useState(null);
  const [preview, setPreview] = useState(null);
  const [uploading, setUploading] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const fileRef = useRef(null);
  const router = useRouter();
  const searchParams = useSearchParams();

  useEffect(() => {
    api.getPatients({ limit: 100 }).then(r => {
      setPatients(r.patients || []);
      const pid = searchParams.get('patient');
      if (pid) setPatientId(pid);
    });
  }, [searchParams]);

  const handleFile = (f) => {
    if (!f) return;
    setFile(f);
    const reader = new FileReader();
    reader.onload = (e) => setPreview(e.target.result);
    reader.readAsDataURL(f);
  };

  const handleDrop = (e) => {
    e.preventDefault();
    setDragOver(false);
    handleFile(e.dataTransfer.files[0]);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!patientId || !file) return alert('Select a patient and upload an image');
    setUploading(true);
    try {
      const res = await api.createCase(patientId, file, notes);
      router.push(`/cases/${res.id}`);
    } catch (e) { alert(e.message); }
    finally { setUploading(false); }
  };

  return (
    <div>
      <h1 style={{marginBottom:8}}>Upload X-ray</h1>
      <p style={{color:'var(--text-secondary)', marginBottom:28}}>Submit a chest X-ray for AI-powered analysis</p>

      <form onSubmit={handleSubmit} className={styles.uploadForm}>
        <div className={styles.uploadLeft}>
          <div
            className={`${styles.dropzone} ${dragOver ? styles.dragOver : ''} ${preview ? styles.hasPreview : ''}`}
            onDragOver={e => { e.preventDefault(); setDragOver(true); }}
            onDragLeave={() => setDragOver(false)}
            onDrop={handleDrop}
            onClick={() => fileRef.current?.click()}
          >
            {preview ? (
              <img src={preview} alt="X-ray preview" className={styles.previewImg} />
            ) : (
              <div className={styles.dropContent}>
                <div className={styles.dropIcon}>+</div>
                <p className={styles.dropTitle}>Drop X-ray image here</p>
                <p className={styles.dropHint}>DICOM, JPG, or PNG (max 50MB)</p>
              </div>
            )}
            <input ref={fileRef} type="file" accept=".jpg,.jpeg,.png,.dcm,.dicom" onChange={e => handleFile(e.target.files[0])} hidden />
          </div>
          {file && <p style={{marginTop:8, fontSize:'0.85rem', color:'var(--text-secondary)'}}>Selected: {file.name} ({(file.size / 1024 / 1024).toFixed(1)} MB)</p>}
        </div>

        <div className={styles.uploadRight}>
          <div className="card" style={{padding: 24}}>
            <h3 style={{marginBottom:20}}>Case Details</h3>
            <div className="input-group" style={{marginBottom:16}}>
              <label>Patient *</label>
              <select className="input select" value={patientId} onChange={e => setPatientId(e.target.value)} required>
                <option value="">Select patient...</option>
                {patients.map(p => <option key={p.id} value={p.id}>{p.full_name} ({p.sex}, DOB: {p.date_of_birth})</option>)}
              </select>
            </div>
            <div className="input-group" style={{marginBottom:20}}>
              <label>Clinical Notes</label>
              <textarea className="input textarea" placeholder="Symptoms, medical history, reason for exam..." value={notes} onChange={e => setNotes(e.target.value)} />
            </div>
            <button type="submit" className="btn btn-primary btn-lg" style={{width:'100%'}} disabled={uploading || !file || !patientId}>
              {uploading ? 'Uploading & Analyzing...' : 'Upload & Analyze'}
            </button>
            {uploading && <p style={{textAlign:'center', marginTop:12, color:'var(--primary)', fontSize:'0.85rem'}}>AI analysis in progress...</p>}
          </div>
        </div>
      </form>
    </div>
  );
}
