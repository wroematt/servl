'use client';

import { api } from '@/lib/api';
import { useAuth } from '@/providers/AuthProvider';
import Image from 'next/image';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { Suspense, useEffect, useState } from 'react';

function JoinRedirector() {
  const { user, loading, updateAuth } = useAuth();
  const searchParams = useSearchParams();
  const router = useRouter();
  const token = searchParams.get('token') ?? '';
  const [joining, setJoining] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (loading) return;

    if (token) {
      // Save token so it survives the register/login redirect
      sessionStorage.setItem('pendingJoinToken', token);
    }

    if (user) {
      if (!token) {
        router.replace('/dashboard');
        return;
      }
      // Logged-in user accepting an invite — join immediately
      setJoining(true);
      api.post<{ accessToken: string; refreshToken: string }>(
        '/users/household/join',
        { token },
      )
        .then(async (data) => {
          sessionStorage.removeItem('pendingJoinToken');
          await updateAuth(data.accessToken, data.refreshToken);
          router.replace('/dashboard');
        })
        .catch((err: unknown) => {
          setJoining(false);
          setError(err instanceof Error ? err.message : 'Invalid or expired invite link');
        });
    }
    // Not logged in: let the page render the sign-up / sign-in prompt below
  }, [loading, user, token, router, updateAuth]); // eslint-disable-line react-hooks/exhaustive-deps

  if (loading || joining) {
    return (
      <div className="flex h-screen items-center justify-center">
        <span className="h-6 w-6 animate-spin rounded-full border-2 border-primary border-t-transparent" />
      </div>
    );
  }

  // Logged-in user hit an error joining
  if (user && error) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-bg px-4">
        <div className="w-full max-w-sm rounded-2xl border border-border bg-surface p-6 shadow-sm text-center space-y-4">
          <p className="text-sm text-danger">{error}</p>
          <Link
            href="/dashboard"
            className="inline-block rounded-lg bg-primary px-4 py-2.5 text-sm font-medium text-white hover:bg-primary-hover transition-colors"
          >
            Go to dashboard
          </Link>
        </div>
      </div>
    );
  }

  // User is logged in but no token — already handled by redirect above
  if (user) return null;

  // Not logged in — show register / sign-in prompt
  return (
    <div className="flex min-h-screen items-center justify-center bg-bg px-4">
      <div className="w-full max-w-sm">
        <div className="mb-8 flex flex-col items-center gap-3">
          <Image src="/logo.png" alt="Servl" width={192} height={192} className="rounded-2xl" />
        </div>
        <div className="rounded-2xl border border-border bg-surface p-6 shadow-sm text-center space-y-4">
          <div>
            <h2 className="font-medium text-text">You&apos;ve been invited to a household</h2>
            <p className="mt-2 text-sm text-text-tertiary">
              Create an account or sign in to accept the invite.
              {token && ' Your invite link has been saved.'}
            </p>
          </div>
          {error && (
            <p className="rounded-lg bg-danger-light px-3 py-2 text-xs text-danger">{error}</p>
          )}
          <div className="flex flex-col gap-2">
            <Link
              href="/register"
              className="flex items-center justify-center rounded-lg bg-primary px-4 py-2.5 text-sm font-medium text-white hover:bg-primary-hover transition-colors"
            >
              Create account
            </Link>
            <Link
              href="/login"
              className="flex items-center justify-center rounded-lg border border-border-strong bg-bg px-4 py-2.5 text-sm font-medium text-text hover:bg-border transition-colors"
            >
              Sign in
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}

export default function JoinPage() {
  return (
    <Suspense fallback={
      <div className="flex h-screen items-center justify-center">
        <span className="h-6 w-6 animate-spin rounded-full border-2 border-primary border-t-transparent" />
      </div>
    }>
      <JoinRedirector />
    </Suspense>
  );
}
