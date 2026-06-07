'use client';

import { GoogleSignInButton } from '@/components/auth/GoogleSignInButton';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { api } from '@/lib/api';
import { VERSION } from '@/lib/version';
import { useAuth } from '@/providers/AuthProvider';

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
    <div className="relative flex min-h-screen flex-col items-center justify-center bg-bg px-4">
      <div className="w-full max-w-sm">
        {/* Logo */}
        <div className="mb-8 flex flex-col items-center gap-3">
          <img src="/servl-logo.svg" alt="Servl" width={192} />
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

          <GoogleSignInButton
            onError={setError}
            onSuccess={() => router.replace('/dashboard')}
          />

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
      <p className="absolute bottom-4 text-center text-xs text-text-tertiary">v{VERSION}</p>
    </div>
  );
}
