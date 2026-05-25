'use client';

import { useRouter } from 'next/navigation';
import { useEffect } from 'react';

// Onboarding is no longer needed — households are auto-created at registration.
// Any stale bookmarks or redirects land here and are forwarded to the dashboard.
export default function OnboardingPage() {
  const router = useRouter();
  useEffect(() => { router.replace('/dashboard'); }, [router]);
  return (
    <div className="flex h-screen items-center justify-center">
      <span className="h-6 w-6 animate-spin rounded-full border-2 border-primary border-t-transparent" />
    </div>
  );
}
