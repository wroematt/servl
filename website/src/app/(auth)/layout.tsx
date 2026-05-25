'use client';

import { useAuth } from '@/providers/AuthProvider';
import { useRouter } from 'next/navigation';
import { useEffect } from 'react';

/**
 * Redirect already-authenticated users away from auth pages.
 * Without this, after a successful login the (app) layout briefly sees
 * user=null during navigation and bounces back to /login.
 */
export default function AuthLayout({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (!loading && user) router.replace('/dashboard');
  }, [user, loading, router]);

  return <>{children}</>;
}
