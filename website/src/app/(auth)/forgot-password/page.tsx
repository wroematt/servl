'use client';

import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { api } from '@/lib/api';
import { IconArrowLeft, IconMailCheck } from '@tabler/icons-react';
import Image from 'next/image';
import Link from 'next/link';
import { FormEvent, useState } from 'react';

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState('');
  const [sent, setSent] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      await api.post('/auth/forgot-password', { email });
      setSent(true);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Something went wrong');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-bg px-4">
      <div className="w-full max-w-sm">
        <div className="mb-8 flex flex-col items-center gap-3">
          <Image src="/logo.png" alt="Servl" width={192} height={192} className="rounded-2xl" />
        </div>

        <div className="rounded-2xl border border-border bg-surface p-6 shadow-sm">
          {sent ? (
            <div className="flex flex-col items-center gap-4 py-4 text-center">
              <div className="flex h-12 w-12 items-center justify-center rounded-full bg-success-light">
                <IconMailCheck size={24} className="text-success" />
              </div>
              <div>
                <h2 className="font-medium text-text">Check your inbox</h2>
                <p className="mt-1 text-sm text-text-tertiary">
                  If an account exists for <strong>{email}</strong>, we&apos;ve sent a reset link.
                </p>
              </div>
              <Link href="/login" className="text-sm text-primary hover:underline">
                Back to sign in
              </Link>
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <h2 className="font-medium text-text">Reset your password</h2>
                <p className="mt-1 text-sm text-text-tertiary">
                  Enter your email and we&apos;ll send a reset link.
                </p>
              </div>
              <Input
                label="Email"
                type="email"
                placeholder="you@example.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
              />
              {error && (
                <p className="rounded-lg bg-danger-light px-3 py-2 text-xs text-danger">{error}</p>
              )}
              <Button type="submit" className="w-full" loading={loading}>
                Send reset link
              </Button>
              <Link
                href="/login"
                className="flex items-center justify-center gap-1 text-xs text-text-tertiary hover:text-text"
              >
                <IconArrowLeft size={12} /> Back to sign in
              </Link>
            </form>
          )}
        </div>
      </div>
    </div>
  );
}
