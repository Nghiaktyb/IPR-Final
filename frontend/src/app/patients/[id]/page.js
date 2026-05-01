'use client';
import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import api from '@/lib/api';

export default function PatientProfilePage() {
  const { id } = useParams();
  const router = useRouter();
  
  const [patient, setPatient] = useState(null);
  const [cases, setCases] = useState([]);
  const [loading, setLoading] = useState(true);
  
  const [isEditing, setIsEditing] = useState(false);
  const [editForm, setEditForm] = useState({});
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!id) return;
    loadData();
  }, [id]);

  const loadData = async () => {
    setLoading(true);
    try {
      const p = await api.getPatient(id);
      setPatient(p);
      setEditForm({
        full_name: p.full_name,
        date_of_birth: p.date_of_birth,
        sex: p.sex,
        blood_type: p.blood_type || '',
        medical_history: p.medical_history || ''
      });
      
      const c = await api.getCases({ patient_id: id });
      setCases(c.cases || []);
    } catch (e) {
      console.error(e);
      alert('Failed to load patient profile');
    } finally {
      setLoading(false);
    }
  };

  const handleSave = async (e) => {
    e.preventDefault();
    setSaving(true);
    try {
      await api.updatePatient(id, editForm);
      setIsEditing(false);
      loadData();
    } catch (e) {
      alert(e.message);
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return <div className="loading-center"><div className="loading-spinner"></div></div>;
  }

  if (!patient) {
    return <div className="empty-state">Patient not found.</div>;
  }

  return (
    <div>
      <div style={{display:'flex', justifyContent:'space-between', alignItems:'flex-start', marginBottom:28}}>
        <div>
          <Link href="/patients" style={{color: 'var(--text-secondary)', textDecoration: 'none', fontSize: '0.9rem', marginBottom: 8, display: 'inline-block'}}>← Back to Directory</Link>
          <h1 style={{display:'flex', alignItems:'center', gap:12}}>
            {patient.full_name}
            <span className="badge badge-primary">{patient.sex}</span>
          </h1>
          <p style={{color:'var(--text-secondary)', marginTop:4}}>Patient ID: {patient.id.substring(0,8)}</p>
        </div>
        <Link href={`/cases/new?patient=${patient.id}`} className="btn btn-primary">+ New Study</Link>
      </div>

      <div style={{display:'grid', gridTemplateColumns:'300px 1fr', gap:24}}>
        {/* Left Sidebar: Demographics & History */}
        <div>
          <div className="card" style={{padding: 20, marginBottom: 20}}>
            <div style={{display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:16}}>
              <h3 style={{margin:0}}>Patient Demographics</h3>
              {!isEditing && <button className="btn btn-ghost btn-sm" onClick={() => setIsEditing(true)}>Edit</button>}
            </div>
            
            {isEditing ? (
              <form onSubmit={handleSave}>
                <div className="input-group" style={{marginBottom:12}}>
                  <label>Full Name</label>
                  <input className="input" value={editForm.full_name} onChange={e=>setEditForm({...editForm, full_name: e.target.value})} required />
                </div>
                <div className="input-group" style={{marginBottom:12}}>
                  <label>DOB</label>
                  <input type="date" className="input" value={editForm.date_of_birth} onChange={e=>setEditForm({...editForm, date_of_birth: e.target.value})} required />
                </div>
                <div className="input-group" style={{marginBottom:12}}>
                  <label>Sex</label>
                  <select className="input select" value={editForm.sex} onChange={e=>setEditForm({...editForm, sex: e.target.value})}>
                    <option value="male">Male</option>
                    <option value="female">Female</option>
                  </select>
                </div>
                <div className="input-group" style={{marginBottom:12}}>
                  <label>Blood Type</label>
                  <select className="input select" value={editForm.blood_type} onChange={e=>setEditForm({...editForm, blood_type: e.target.value})}>
                    <option value="">Unknown</option>
                    <option value="A+">A+</option>
                    <option value="A-">A-</option>
                    <option value="B+">B+</option>
                    <option value="B-">B-</option>
                    <option value="AB+">AB+</option>
                    <option value="AB-">AB-</option>
                    <option value="O+">O+</option>
                    <option value="O-">O-</option>
                  </select>
                </div>
                <div className="input-group" style={{marginBottom:16}}>
                  <label>Medical History / Allergies</label>
                  <textarea className="input textarea" style={{minHeight: 100}} value={editForm.medical_history} onChange={e=>setEditForm({...editForm, medical_history: e.target.value})} placeholder="Past surgeries, chronic conditions, allergies..." />
                </div>
                <div style={{display:'flex', gap:8}}>
                  <button type="submit" className="btn btn-primary btn-sm" disabled={saving}>Save</button>
                  <button type="button" className="btn btn-ghost btn-sm" onClick={() => setIsEditing(false)}>Cancel</button>
                </div>
              </form>
            ) : (
              <div>
                <div style={{display:'grid', gridTemplateColumns:'1fr 1fr', gap:'12px 0', fontSize:'0.95rem'}}>
                  <div style={{color:'var(--text-secondary)'}}>Date of Birth</div>
                  <div style={{fontWeight:500}}>{patient.date_of_birth}</div>
                  
                  <div style={{color:'var(--text-secondary)'}}>Blood Type</div>
                  <div style={{fontWeight:500}}>{patient.blood_type || 'Unknown'}</div>
                  
                  <div style={{color:'var(--text-secondary)'}}>Registered</div>
                  <div style={{fontWeight:500}}>{new Date(patient.created_at).toLocaleDateString()}</div>
                </div>
                
                <div style={{marginTop: 24, paddingTop: 16, borderTop: '1px solid var(--border-light)'}}>
                  <h4 style={{marginBottom: 8, color:'var(--text-secondary)'}}>Medical History</h4>
                  {patient.medical_history ? (
                    <p style={{fontSize:'0.9rem', lineHeight: 1.5, whiteSpace:'pre-wrap'}}>{patient.medical_history}</p>
                  ) : (
                    <p style={{fontSize:'0.9rem', color:'var(--text-secondary)', fontStyle:'italic'}}>No medical history recorded.</p>
                  )}
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Right Content: Diagnostic History */}
        <div>
          <h2 style={{marginBottom: 16}}>Diagnostic History</h2>
          
          {cases.length === 0 ? (
            <div className="card" style={{padding: 40, textAlign: 'center'}}>
              <div style={{fontSize: 40, marginBottom: 16, opacity: 0.5}}>🩻</div>
              <h3>No imaging studies found</h3>
              <p style={{color:'var(--text-secondary)', marginBottom: 24}}>Upload the first X-ray to start this patient's history.</p>
              <Link href={`/cases/new?patient=${patient.id}`} className="btn btn-primary">Upload X-ray</Link>
            </div>
          ) : (
            <div style={{display:'flex', flexDirection:'column', gap:16}}>
              {cases.map(c => (
                <div key={c.id} className="card" style={{display:'flex', overflow:'hidden', padding: 0}}>
                  {/* Thumbnail */}
                  <div style={{width: 160, backgroundColor:'#0f172a', position:'relative', display:'flex', alignItems:'center', justifyContent:'center'}}>
                    <img 
                      src={api.getCaseImageUrl(c.id)} 
                      alt="X-ray" 
                      style={{width: '100%', height: '100%', objectFit: 'cover', opacity: 0.8}} 
                      onError={(e) => e.target.style.display='none'}
                    />
                  </div>
                  
                  {/* Case Info */}
                  <div style={{padding: 20, flex: 1}}>
                    <div style={{display:'flex', justifyContent:'space-between', alignItems:'flex-start', marginBottom:12}}>
                      <div>
                        <h3 style={{marginBottom: 4}}>Chest X-Ray Study</h3>
                        <div style={{color:'var(--text-secondary)', fontSize:'0.9rem'}}>
                          {new Date(c.created_at).toLocaleString()}
                        </div>
                      </div>
                      <span className={`badge ${c.status === 'finalized' ? 'badge-primary' : 'badge-secondary'}`}>
                        {c.status.toUpperCase()}
                      </span>
                    </div>

                    {/* Vitals at time of visit */}
                    <div style={{display:'flex', flexWrap:'wrap', gap:16, marginBottom:16, padding:'10px 14px', backgroundColor:'var(--bg-secondary)', borderRadius:8, fontSize:'0.85rem'}}>
                      {c.reason_for_visit && <div style={{width:'100%', marginBottom:4}}><b>Reason:</b> {c.reason_for_visit}</div>}
                      {c.patient_weight && <div><b>Weight:</b> {c.patient_weight} kg</div>}
                      {c.patient_height && <div><b>Height:</b> {c.patient_height} cm</div>}
                      {c.blood_pressure && <div><b>BP:</b> {c.blood_pressure}</div>}
                      {c.heart_rate && <div><b>HR:</b> {c.heart_rate} bpm</div>}
                      {c.temperature && <div><b>Temp:</b> {c.temperature} °C</div>}
                      {(!c.patient_weight && !c.patient_height && !c.blood_pressure && !c.heart_rate && !c.temperature && !c.reason_for_visit) && (
                        <div style={{color:'var(--text-secondary)', fontStyle:'italic'}}>No clinical vitals recorded for this visit.</div>
                      )}
                    </div>
                    
                    <div style={{display:'flex', gap:12, alignItems:'center'}}>
                      <Link href={`/cases/${c.id}`} className="btn btn-primary btn-sm">Open Viewer</Link>
                      {c.status === 'finalized' && (
                        <button 
                          className="btn btn-ghost btn-sm"
                          onClick={() => window.open(`${api.base}/api/reports/case/${c.id}/download?token=${api.getToken()}`, '_blank')}
                        >
                          ↓ Download Report
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
