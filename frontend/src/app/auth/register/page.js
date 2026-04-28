'use client';
import { useState } from 'react';
import { useAuth } from '@/lib/auth';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import styles from '../auth.module.css';

export default function RegisterPage() {
  const [form, setForm] = useState({ email: '', password: '', full_name: '', role: 'technician' });
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const { register } = useAuth();
  const router = useRouter();

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      await register(form);
      router.push('/dashboard');
    } catch (err) {
      setError(err.message || 'Registration failed');
    } finally {
      setLoading(false);
    }
  };

  const update = (k, v) => setForm(f => ({ ...f, [k]: v }));

  return (
    <div className={styles.authPage}>
      <div className={styles.authBg}>
        <div className={styles.orb1}></div>
        <div className={styles.orb2}></div>
      </div>
      <div className={styles.authCard}>
        <div className={styles.authLogo}>
          <div className={styles.logoIcon}>M</div>
          <h1>MedicX</h1>
        </div>
        <h2 className={styles.authTitle}>Create Account</h2>
        <p className={styles.authSubtitle}>Join the diagnostic platform</p>

        {error && <div className={styles.error}>{error}</div>}

        <form onSubmit={handleSubmit} className={styles.form}>
          <div className="input-group">
            <label htmlFor="full_name">Full Name</label>
            <input id="full_name" className="input" placeholder="Dr. John Smith" value={form.full_name} onChange={e => update('full_name', e.target.value)} required />
          </div>
          <div className="input-group">
            <label htmlFor="reg_email">Email</label>
            <input id="reg_email" type="email" className="input" placeholder="doctor@hospital.com" value={form.email} onChange={e => update('email', e.target.value)} required />
          </div>
          <div className="input-group">
            <label htmlFor="reg_password">Password</label>
            <input id="reg_password" type="password" className="input" placeholder="Min 6 characters" value={form.password} onChange={e => update('password', e.target.value)} required minLength={6} />
          </div>
          <div className="input-group">
            <label htmlFor="role">Role</label>
            <select id="role" className="input select" value={form.role} onChange={e => update('role', e.target.value)}>
              <option value="technician">Technician</option>
              <option value="radiologist">Radiologist</option>
              <option value="admin">Administrator</option>
            </select>
          </div>
          <button type="submit" className="btn btn-primary btn-lg" style={{width:'100%'}} disabled={loading}>
            {loading ? 'Creating...' : 'Create Account'}
          </button>
        </form>
        <p className={styles.authFooter}>
          Already have an account? <Link href="/auth/login">Sign in</Link>
        </p>
      </div>
    </div>
  );
}
