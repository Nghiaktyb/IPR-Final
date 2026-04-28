'use client';
import { useAuth } from '@/lib/auth';
import { useRouter } from 'next/navigation';
import { useEffect } from 'react';
import Sidebar from '@/components/Sidebar';

export default function CasesLayout({ children }) {
  const { user, loading } = useAuth();
  const router = useRouter();
  useEffect(() => { if (!loading && !user) router.push('/auth/login'); }, [user, loading, router]);
  if (loading) return <div className="loading-center"><div className="loading-spinner"></div></div>;
  if (!user) return null;
  return (
    <div style={{display:'flex', minHeight:'100vh'}}>
      <Sidebar />
      <main style={{flex:1, marginLeft:'var(--sidebar-width)', padding:'var(--space-xl)', overflowY:'auto', minHeight:'100vh'}}>
        {children}
      </main>
    </div>
  );
}
