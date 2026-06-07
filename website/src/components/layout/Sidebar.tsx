'use client';

import { cn } from '@/lib/utils';
import { useAuth } from '@/providers/AuthProvider';
import {
  IconChartBar,
  IconCalendar,
  IconCpu,
  IconLayoutDashboard,
  IconLogout,
  IconPaw,
  IconSettings,
  IconX,
} from '@tabler/icons-react';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';

const navItems = [
  { href: '/dashboard', label: 'Dashboard', icon: IconLayoutDashboard },
  { href: '/pets', label: 'Pets', icon: IconPaw },
  { href: '/stats', label: 'Statistics', icon: IconChartBar },
  { href: '/schedule', label: 'Schedule', icon: IconCalendar },
  { href: '/devices', label: 'Devices', icon: IconCpu },
];

const bottomItems = [
  { href: '/account', label: 'Account', icon: IconSettings },
];

interface SidebarProps {
  /** Whether the off-canvas nav is open on mobile/tablet (ignored at `lg` and above, where it's always visible). */
  open: boolean;
  /** Called to dismiss the off-canvas nav — on backdrop click, the close button, or after navigating. */
  onClose: () => void;
}

export function Sidebar({ open, onClose }: SidebarProps) {
  const pathname = usePathname();
  const router = useRouter();
  const { user, logout } = useAuth();

  const handleLogout = async () => {
    await logout();
    router.push('/login');
  };

  const isActive = (href: string) =>
    pathname === href || pathname.startsWith(href + '/');

  const linkClass = (href: string) =>
    cn(
      'flex items-center gap-2.5 rounded-lg px-3 py-2 text-sm transition-colors',
      isActive(href)
        ? 'bg-primary-light text-primary font-medium'
        : 'text-text-secondary hover:bg-bg hover:text-text',
    );

  return (
    <>
      {/* Backdrop — mobile/tablet only, shown while the off-canvas nav is open */}
      {open && (
        <div
          className="fixed inset-0 z-40 bg-black/40 lg:hidden"
          onClick={onClose}
          aria-hidden="true"
        />
      )}

      {/* Sidebar — off-canvas drawer below `lg`, static column at `lg` and above */}
      <aside
        className={cn(
          'fixed inset-y-0 left-0 z-50 flex h-screen w-64 flex-col border-r border-border bg-surface',
          'transition-transform duration-200 ease-in-out',
          'lg:static lg:z-auto lg:w-56 lg:translate-x-0',
          open ? 'translate-x-0' : '-translate-x-full',
        )}
      >
        {/* Logo */}
        <div className="relative flex items-center justify-center border-b border-border px-4 py-4">
          <img src="/servl-logo-banner.svg" alt="Servl" className="w-full max-w-[160px]" />
          <button
            onClick={onClose}
            title="Close menu"
            className="absolute right-3 top-1/2 -translate-y-1/2 text-text-tertiary hover:text-text lg:hidden"
          >
            <IconX size={20} />
          </button>
        </div>

        {/* Main nav */}
        <nav className="flex-1 space-y-0.5 px-2 py-3">
          {navItems.map(({ href, label, icon: Icon }) => (
            <Link key={href} href={href} onClick={onClose} className={linkClass(href)}>
              <Icon size={16} />
              {label}
            </Link>
          ))}
        </nav>

        {/* Bottom section */}
        <div className="border-t border-border px-2 py-3 space-y-0.5">
          {bottomItems.map(({ href, label, icon: Icon }) => (
            <Link key={href} href={href} onClick={onClose} className={linkClass(href)}>
              <Icon size={16} />
              {label}
            </Link>
          ))}

          {/* User + logout */}
          {user && (
            <div className="mt-2 flex items-center gap-2 rounded-lg px-3 py-2">
              <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-primary-light text-xs font-medium text-primary">
                {user.name.charAt(0).toUpperCase()}
              </div>
              <div className="min-w-0 flex-1">
                <p className="truncate text-xs font-medium text-text">{user.name}</p>
              </div>
              <button
                onClick={handleLogout}
                title="Sign out"
                className="text-text-tertiary hover:text-danger transition-colors"
              >
                <IconLogout size={14} />
              </button>
            </div>
          )}
        </div>
      </aside>
    </>
  );
}
