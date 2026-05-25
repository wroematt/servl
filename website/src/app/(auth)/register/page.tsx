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

export default function RegisterPage() {
  const { login } = useAuth();
  const router = useRouter();
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError('');
    if (password.length < 8) {
      setError('Password must be at least 8 characters');
      return;
    }
    setLoading(true);
    try {
      // Pick up a pending household invite token saved by the /join page
      const inviteToken = sessionStorage.getItem('pendingJoinToken') ?? undefined;
      await api.post('/auth/register', { name, email, password, ...(inviteToken && { inviteToken }) });
      sessionStorage.removeItem('pendingJoinToken');
      await login(email, password);
      router.replace('/dashboard');
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Registration failed');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-bg px-4">
      <div className="w-full max-w-sm">
        <div className="mb-8 flex flex-col items-center gap-3">
          <Image src="/logo.png" alt="Servl" width={48} height={48} className="rounded-xl" />
          <div className="text-center">
            <h1 className="text-lg font-semibold text-text">Create your account</h1>
            <p className="text-sm text-text-tertiary">Start managing your pet feeder</p>
          </div>
        </div>

        <form
          onSubmit={handleSubmit}
          className="rounded-2xl border border-border bg-surface p-6 shadow-sm space-y-4"
        >
          <Input
            label="Your name"
            type="text"
            placeholder="Jamie"
            value={name}
            onChange={(e) => setName(e.target.value)}
            required
            autoComplete="name"
          />
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
            placeholder="At least 8 characters"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
            minLength={8}
            autoComplete="new-password"
          />

          {error && (
            <p className="rounded-lg bg-danger-light px-3 py-2 text-xs text-danger">
              {error}
            </p>
          )}

          <Button type="submit" className="w-full" loading={loading}>
            Create account
          </Button>

          <div className="relative flex items-center gap-2">
            <div className="flex-1 border-t border-border" />
            <span className="text-xs text-text-tertiary">or</span>
            <div className="flex-1 border-t border-border" />
          </div>

          <div className="relative group">
            <Button type="button" variant="secondary" className="w-full cursor-not-allowed opacity-60" disabled>
              <IconBrandGoogle size={16} />
              Continue with Google
            </Button>
            <span className="absolute -top-7 left-1/2 -translate-x-1/2 whitespace-nowrap rounded-md bg-text px-2 py-1 text-xs text-white opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none">
              Coming soon
            </span>
          </div>

          <p className="text-center text-xs text-text-tertiary">
            Already have an account?{' '}
            <Link href="/login" className="text-primary hover:underline">
              Sign in
            </Link>
          </p>
        </form>
      </div>
    </div>
  );
}
