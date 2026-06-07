'use client';

import { ApiError, api } from '@/lib/api';
import { useAuth } from '@/providers/AuthProvider';
import Script from 'next/script';
import { useRef, useState } from 'react';

interface GoogleCredentialResponse {
  credential: string;
}

declare global {
  interface Window {
    google?: {
      accounts: {
        id: {
          initialize: (config: {
            client_id: string;
            callback: (response: GoogleCredentialResponse) => void;
          }) => void;
          renderButton: (parent: HTMLElement, options: Record<string, unknown>) => void;
        };
      };
    };
  }
}

const CLIENT_ID = process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID;

interface GoogleSignInButtonProps {
  /** Called with a human-readable message when the sign-in/sign-up flow fails. */
  onError: (message: string) => void;
  /** Called once tokens are stored and the profile has loaded — typically navigates onward. */
  onSuccess: () => void;
}

/**
 * Renders Google's official "Continue with Google" button via Google Identity
 * Services (GIS). On success, exchanges the returned ID token for Servl's own
 * access/refresh tokens through POST /auth/google — verified server-side
 * against the same Web Client ID (see services/user-service/src/routes/auth.ts).
 * Works for both sign-in and sign-up: the backend auto-links to an existing
 * account by email, or creates a new household + owner user if none exists.
 */
export function GoogleSignInButton({ onError, onSuccess }: GoogleSignInButtonProps) {
  const { updateAuth } = useAuth();
  const containerRef = useRef<HTMLDivElement>(null);
  const [verifying, setVerifying] = useState(false);

  const handleCredential = async (response: GoogleCredentialResponse) => {
    setVerifying(true);
    try {
      const data = await api.post<{ accessToken: string; refreshToken: string }>('/auth/google', {
        idToken: response.credential,
      });
      await updateAuth(data.accessToken, data.refreshToken);
      onSuccess();
    } catch (err: unknown) {
      onError(err instanceof ApiError ? err.message : 'Google sign-in failed. Please try again.');
    } finally {
      setVerifying(false);
    }
  };

  const renderButton = () => {
    if (!CLIENT_ID || !window.google || !containerRef.current) return;
    window.google.accounts.id.initialize({ client_id: CLIENT_ID, callback: handleCredential });
    // Clear first — Script's onReady can fire again on remount (e.g. React StrictMode in dev)
    containerRef.current.innerHTML = '';
    window.google.accounts.id.renderButton(containerRef.current, {
      type: 'standard',
      theme: 'outline',
      size: 'large',
      shape: 'rectangular',
      text: 'continue_with',
      logo_alignment: 'center',
      width: 300,
    });
  };

  // No client ID configured (e.g. local dev without it set) — hide the button entirely
  // rather than show a broken "Coming soon" placeholder.
  if (!CLIENT_ID) return null;

  return (
    <div className="flex flex-col items-center gap-1.5">
      <Script src="https://accounts.google.com/gsi/client" strategy="afterInteractive" onReady={renderButton} />
      <div ref={containerRef} className="flex justify-center" />
      {verifying && <p className="text-xs text-text-tertiary">Signing in…</p>}
    </div>
  );
}
