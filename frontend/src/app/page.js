'use client';
import { useAuth } from '@/lib/auth';
import { useRouter } from 'next/navigation';
import { useEffect } from 'react';
import Link from 'next/link';
import styles from './page.module.css';

export default function Home() {
  const { user } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (user) router.push('/dashboard');
  }, [user, router]);

  return (
    <div className={styles.landing}>
      <div className={styles.bg}>
        <div className={styles.bgOrb1}></div>
        <div className={styles.bgOrb2}></div>
        <div className={styles.bgOrb3}></div>
      </div>

      <header className={styles.header}>
        <div className={styles.logoMark}>M</div>
        <span className={styles.logoName}>MedicX</span>
        <nav className={styles.headerNav}>
          <Link href="/auth/login" className="btn btn-ghost">Sign In</Link>
          <Link href="/auth/register" className="btn btn-primary">Get Started</Link>
        </nav>
      </header>

      <main className={styles.hero}>
        <div className={styles.heroContent}>
          <div className={styles.heroBadge}>AI-Powered Radiology</div>
          <h1 className={styles.heroTitle}>
            Smarter X-ray<br/>
            <span className={styles.gradient}>Diagnostics</span>
          </h1>
          <p className={styles.heroDesc}>
            MedicX analyzes chest X-ray images using deep learning to detect
            Atelectasis, Effusion, Pneumonia, Nodule, and Mass with Grad-CAM
            explainability heatmaps.
          </p>
          <div className={styles.heroCTA}>
            <Link href="/auth/register" className="btn btn-primary btn-lg">
              Start Diagnosing
            </Link>
            <Link href="/auth/login" className="btn btn-secondary btn-lg">
              Sign In
            </Link>
          </div>

          <div className={styles.statsRow}>
            <div className={styles.statItem}>
              <span className={styles.statNum}>5</span>
              <span className={styles.statTxt}>Diseases Detected</span>
            </div>
            <div className={styles.divider}></div>
            <div className={styles.statItem}>
              <span className={styles.statNum}>71.9%</span>
              <span className={styles.statTxt}>Mean AUC-ROC</span>
            </div>
            <div className={styles.divider}></div>
            <div className={styles.statItem}>
              <span className={styles.statNum}>11.3M</span>
              <span className={styles.statTxt}>Model Parameters</span>
            </div>
          </div>
        </div>

        <div className={styles.heroVisual}>
          <div className={styles.xrayCard}>
            <div className={styles.xrayHeader}>
              <span className={styles.dot} style={{background:'#ff5f57'}}></span>
              <span className={styles.dot} style={{background:'#ffbd2e'}}></span>
              <span className={styles.dot} style={{background:'#28c840'}}></span>
              <span className={styles.xrayTitle}>Diagnostic Viewer</span>
            </div>
            <div className={styles.xrayBody}>
              <div className={styles.xrayPlaceholder}>
                <div className={styles.scanLine}></div>
                <span>Chest X-ray Analysis</span>
              </div>
              <div className={styles.findingsList}>
                {['Atelectasis', 'Effusion', 'Pneumonia', 'Nodule', 'Mass'].map((d, i) => {
                  const vals = [42, 51, 53, 46, 52];
                  const flagged = vals[i] >= 50;
                  return (
                    <div key={d} className={styles.findingRow}>
                      <span className={styles.findingName}>{d}</span>
                      <div className={styles.findingBar}>
                        <div className={styles.findingFill} style={{
                          width: `${vals[i]}%`,
                          background: flagged ? '#d93025' : '#1a73e8'
                        }}></div>
                      </div>
                      <span className={styles.findingPct}>{vals[i]}%</span>
                      {flagged && <span className={styles.flagBadge}>FLAGGED</span>}
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}
