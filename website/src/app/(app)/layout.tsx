'use client';

import { Sidebar } from '@/components/layout/Sidebar';
import { useAuth } from '@/providers/AuthProvider';
import { IconMenu2 } from '@tabler/icons-react';
import { usePathname, useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';

export default function AppLayout({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuth();
  const router = useRouter();
  const pathname = usePathname();
  const [navOpen, setNavOpen] = useState(false);

  useEffect(() => {
    if (loading) return;
    if (!user) router.replace('/login');
  }, [user, loading, router]);

  // Close the off-canvas nav whenever the route changes (e.g. browser back/forward)
  // so it doesn't stay open over the new page on mobile.
  useEffect(() => {
    setNavOpen(false);
  }, [pathname]);

  if (loading) {
    return (
      <div className="flex h-screen items-center justify-center bg-bg">
        <span className="h-6 w-6 animate-spin rounded-full border-2 border-primary border-t-transparent" />
      </div>
    );
  }

  if (!user) return null;

  return (
    <div className="flex h-screen overflow-hidden bg-bg">
      <Sidebar open={navOpen} onClose={() => setNavOpen(false)} />

      <div className="flex min-w-0 flex-1 flex-col overflow-hidden">
        {/* Mobile/tablet top bar — hidden at `lg` and above where the sidebar is always visible */}
        <header className="flex items-center gap-3 border-b border-border bg-surface px-4 py-3 lg:hidden">
          <button
            onClick={() => setNavOpen(true)}
            title="Open menu"
            className="text-text-secondary hover:text-text"
          >
            <IconMenu2 size={22} />
          </button>
          <img src="/servl-logo-banner.svg" alt="Servl" className="h-7 w-auto" />
        </header>

        <main className="flex-1 overflow-y-auto p-6">{children}</main>
      </div>
    </div>
  );
}
