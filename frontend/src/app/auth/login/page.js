'use client';
import { useState } from 'react';
import { useAuth } from '@/lib/auth';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import styles from '../auth.module.css';

export default function LoginPage() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const { login } = useAuth();
  const router = useRouter();

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      await login(email, password);
      router.push('/dashboard');
    } catch (err) {
      setError(err.message || 'Invalid credentials');
    } finally {
      setLoading(false);
    }
  };

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
        <h2 className={styles.authTitle}>Welcome Back</h2>
        <p className={styles.authSubtitle}>Sign in to your diagnostic suite</p>

        {error && <div className={styles.error}>{error}</div>}

        <form onSubmit={handleSubmit} className={styles.form}>
          <div className="input-group">
            <label htmlFor="email">Email</label>
            <input id="email" type="email" className="input" placeholder="doctor@hospital.com" value={email} onChange={e => setEmail(e.target.value)} required />
          </div>
          <div className="input-group">
            <label htmlFor="password">Password</label>
            <input id="password" type="password" className="input" placeholder="Enter password" value={password} onChange={e => setPassword(e.target.value)} required />
          </div>
          <button type="submit" className="btn btn-primary btn-lg" style={{width:'100%'}} disabled={loading}>
            {loading ? 'Signing in...' : 'Sign In'}
          </button>
        </form>
        <p className={styles.authFooter}>
          No account? <Link href="/auth/register">Create one</Link>
        </p>
      </div>
    </div>
  );
}
