'use client';
import { usePathname } from 'next/navigation';
import Link from 'next/link';
import { useAuth } from '@/lib/auth';
import styles from './Sidebar.module.css';
import {
  LayoutDashboard,
  Users,
  Upload,
  TrendingUp,
  KeyRound,
  ClipboardList,
  Bot,
  LogOut,
} from 'lucide-react';

const clinicalLinks = [
  { href: '/dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { href: '/patients', label: 'Patients', icon: Users },
  { href: '/cases/new', label: 'Upload X-ray', icon: Upload },
];

const adminLinks = [
  { href: '/admin', label: 'Overview', icon: TrendingUp },
  { href: '/admin/users', label: 'Users', icon: KeyRound },
  { href: '/admin/audit', label: 'Audit Trail', icon: ClipboardList },
  { href: '/admin/ai-performance', label: 'AI Performance', icon: Bot },
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
          {clinicalLinks.map(link => {
            const Icon = link.icon;
            return (
              <Link
                key={link.href}
                href={link.href}
                className={`${styles.link} ${pathname === link.href ? styles.active : ''}`}
              >
                <span className={styles.linkIcon}><Icon size={18} /></span>
                <span>{link.label}</span>
              </Link>
            );
          })}
        </div>

        {isAdmin && (
          <div className={styles.section}>
            <span className={styles.sectionLabel}>Administration</span>
            {adminLinks.map(link => {
              const Icon = link.icon;
              return (
                <Link
                  key={link.href}
                  href={link.href}
                  className={`${styles.link} ${pathname === link.href ? styles.active : ''}`}
                >
                  <span className={styles.linkIcon}><Icon size={18} /></span>
                  <span>{link.label}</span>
                </Link>
              );
            })}
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
          <LogOut size={18} />
        </button>
      </div>
    </aside>
  );
}
