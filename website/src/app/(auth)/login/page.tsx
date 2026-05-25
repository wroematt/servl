'use client';

import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { api } from '@/lib/api';
import { useAuth } from '@/providers/AuthProvider';
import { IconBrandGoogle } from '@tabler/icons-react';
import Image from 'next/image';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { FormEvent, useState } from 'react';

export default function LoginPage() {
  const { login, updateAuth } = useAuth();
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      await login(email, password);
      // If the user arrived via an invite link, join that household now
      const inviteToken = sessionStorage.getItem('pendingJoinToken');
      if (inviteToken) {
        try {
          const data = await api.post<{ accessToken: string; refreshToken: string }>(
            '/users/household/join',
            { token: inviteToken },
          );
          sessionStorage.removeItem('pendingJoinToken');
          await updateAuth(data.accessToken, data.refreshToken);
        } catch {
          // Non-fatal — user stays in their existing household; bad/expired token is silently dropped
          sessionStorage.removeItem('pendingJoinToken');
        }
      }
      router.replace('/dashboard');
    } catch (err: unknown) {
      setError(
        err instanceof Error ? err.message : 'Invalid email or password',
      );
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-bg px-4">
      <div className="w-full max-w-sm">
        {/* Logo */}
        <div className="mb-8 flex flex-col items-center gap-3">
          <Image src="/logo.png" alt="Servl" width={192} height={192} className="rounded-2xl" />
          <div className="text-center">
            <h1 className="text-lg font-semibold text-text">Welcome back</h1>
            <p className="text-sm text-text-tertiary">Sign in to your account</p>
          </div>
        </div>

        <form
          onSubmit={handleSubmit}
          className="rounded-2xl border border-border bg-surface p-6 shadow-sm space-y-4"
        >
          <Input
            label="Email"
            type="email"
            placeholder="you@example.com"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
            autoComplete="email"
          />
          <Input
            label="Password"
            type="password"
            placeholder="••••••••"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
            autoComplete="current-password"
          />

          {error && (
            <p className="rounded-lg bg-danger-light px-3 py-2 text-xs text-danger">
              {error}
            </p>
          )}

          <Button type="submit" className="w-full" loading={loading}>
            Sign in
          </Button>

          <div className="relative flex items-center gap-2">
            <div className="flex-1 border-t border-border" />
            <span className="text-xs text-text-tertiary">or</span>
            <div className="flex-1 border-t border-border" />
          </div>

          {/* Google — disabled, coming soon */}
          <div className="relative group">
            <Button
              type="button"
              variant="secondary"
              className="w-full cursor-not-allowed opacity-60"
              disabled
            >
              <IconBrandGoogle size={16} />
              Continue with Google
            </Button>
            <span className="absolute -top-7 left-1/2 -translate-x-1/2 whitespace-nowrap rounded-md bg-text px-2 py-1 text-xs text-white opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none">
              Coming soon
            </span>
          </div>

          <p className="text-center text-xs text-text-tertiary">
            No account?{' '}
            <Link href="/register" className="text-primary hover:underline">
              Create one
            </Link>
            {' · '}
            <Link href="/forgot-password" className="text-primary hover:underline">
              Forgot password
            </Link>
          </p>
        </form>
      </div>
    </div>
  );
}
