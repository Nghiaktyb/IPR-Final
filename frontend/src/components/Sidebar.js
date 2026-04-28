'use client';
import { usePathname } from 'next/navigation';
import Link from 'next/link';
import { useAuth } from '@/lib/auth';
import styles from './Sidebar.module.css';

const clinicalLinks = [
  { href: '/dashboard', label: 'Dashboard', icon: '📊' },
  { href: '/patients', label: 'Patients', icon: '👥' },
  { href: '/cases/new', label: 'Upload X-ray', icon: '📤' },
];

const adminLinks = [
  { href: '/admin', label: 'Overview', icon: '📈' },
  { href: '/admin/users', label: 'Users', icon: '🔑' },
  { href: '/admin/audit', label: 'Audit Trail', icon: '📋' },
  { href: '/admin/ai-performance', label: 'AI Performance', icon: '🤖' },
];

export default function Sidebar() {
  const pathname = usePathname();
  const { user, logout } = useAuth();
  const isAdmin = user?.role === 'admin';

  return (
    <aside className={styles.sidebar}>
      <div className={styles.logo}>
        <div className={styles.logoIcon}>M</div>
        <div className={styles.logoText}>
          <span className={styles.logoTitle}>MedicX</span>
          <span className={styles.logoSub}>AI Diagnostics</span>
        </div>
      </div>

      <nav className={styles.nav}>
        <div className={styles.section}>
          <span className={styles.sectionLabel}>Clinical</span>
          {clinicalLinks.map(link => (
            <Link
              key={link.href}
              href={link.href}
              className={`${styles.link} ${pathname === link.href ? styles.active : ''}`}
            >
              <span className={styles.linkIcon}>{link.icon}</span>
              <span>{link.label}</span>
            </Link>
          ))}
        </div>

        {isAdmin && (
          <div className={styles.section}>
            <span className={styles.sectionLabel}>Administration</span>
            {adminLinks.map(link => (
              <Link
                key={link.href}
                href={link.href}
                className={`${styles.link} ${pathname === link.href ? styles.active : ''}`}
              >
                <span className={styles.linkIcon}>{link.icon}</span>
                <span>{link.label}</span>
              </Link>
            ))}
          </div>
        )}
      </nav>

      <div className={styles.userSection}>
        <div className={styles.userInfo}>
          <div className={styles.avatar}>{user?.full_name?.[0] || 'U'}</div>
          <div className={styles.userMeta}>
            <span className={styles.userName}>{user?.full_name || 'User'}</span>
            <span className={styles.userRole}>{user?.role || 'user'}</span>
          </div>
        </div>
        <button onClick={logout} className={styles.logoutBtn} title="Sign Out">
          ↪
        </button>
      </div>
    </aside>
  );
}
