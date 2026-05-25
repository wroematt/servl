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
} from '@tabler/icons-react';
import Image from 'next/image';
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

export function Sidebar() {
  const pathname = usePathname();
  const router = useRouter();
  const { user, logout } = useAuth();

  const handleLogout = async () => {
    await logout();
    router.push('/login');
  };

  const isActive = (href: string) =>
    pathname === href || pathname.startsWith(href + '/');

  return (
    <aside className="flex h-screen w-48 flex-col border-r border-border bg-surface">
      {/* Logo */}
      <div className="flex items-center justify-center border-b border-border px-4 py-4">
        <Image src="/logo.png" alt="Servl" width={48} height={48} className="rounded-lg" />
      </div>

      {/* Main nav */}
      <nav className="flex-1 space-y-0.5 px-2 py-3">
        {navItems.map(({ href, label, icon: Icon }) => (
          <Link
            key={href}
            href={href}
            className={cn(
              'flex items-center gap-2.5 rounded-lg px-3 py-2 text-sm transition-colors',
              isActive(href)
                ? 'bg-primary-light text-primary font-medium'
                : 'text-text-secondary hover:bg-bg hover:text-text',
            )}
          >
            <Icon size={16} />
            {label}
          </Link>
        ))}
      </nav>

      {/* Bottom section */}
      <div className="border-t border-border px-2 py-3 space-y-0.5">
        {bottomItems.map(({ href, label, icon: Icon }) => (
          <Link
            key={href}
            href={href}
            className={cn(
              'flex items-center gap-2.5 rounded-lg px-3 py-2 text-sm transition-colors',
              isActive(href)
                ? 'bg-primary-light text-primary font-medium'
                : 'text-text-secondary hover:bg-bg hover:text-text',
            )}
          >
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
  );
}
