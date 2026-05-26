'use client';

import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Card, CardHeader, CardTitle } from '@/components/ui/Card';
import { Input } from '@/components/ui/Input';
import { api } from '@/lib/api';
import { resolvePhotoUrl } from '@/lib/utils';
import { useAuth } from '@/providers/AuthProvider';
import { IconCamera, IconCopy } from '@tabler/icons-react';
import Image from 'next/image';
import { FormEvent, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';

interface Member {
  id: string;
  name: string;
  email: string;
  role: 'owner' | 'member';
}

export default function AccountPage() {
  const { user, refresh, logout } = useAuth();
  const router = useRouter();

  // Profile
  const [name, setName] = useState(user?.name ?? '');
  const [profileSaving, setProfileSaving] = useState(false);
  const [profileMsg, setProfileMsg] = useState('');

  const handleProfileSave = async (e: FormEvent) => {
    e.preventDefault();
    setProfileSaving(true);
    setProfileMsg('');
    try {
      await api.patch('/users/me', { name });
      await refresh();
      setProfileMsg('Saved!');
    } catch (err: unknown) {
      setProfileMsg(err instanceof Error ? err.message : 'Failed to save');
    } finally {
      setProfileSaving(false);
    }
  };

  // Photo upload
  const photoInputRef = useRef<HTMLInputElement>(null);
  const [photoUploading, setPhotoUploading] = useState(false);
  const [photoMsg, setPhotoMsg] = useState('');

  const handlePhotoChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setPhotoUploading(true);
    setPhotoMsg('');
    try {
      const form = new FormData();
      form.append('photo', file);
      await api.postForm('/users/me/photo', form);
      await refresh();
      setPhotoMsg('Photo updated!');
    } catch (err: unknown) {
      setPhotoMsg(err instanceof Error ? err.message : 'Failed to upload photo');
    } finally {
      setPhotoUploading(false);
      if (photoInputRef.current) photoInputRef.current.value = '';
    }
  };

  // Password
  const [currentPw, setCurrentPw] = useState('');
  const [newPw, setNewPw] = useState('');
  const [pwSaving, setPwSaving] = useState(false);
  const [pwMsg, setPwMsg] = useState('');

  const handlePasswordChange = async (e: FormEvent) => {
    e.preventDefault();
    if (newPw.length < 8) { setPwMsg('New password must be at least 8 characters'); return; }
    setPwSaving(true);
    setPwMsg('');
    try {
      await api.patch('/users/me', { current_password: currentPw, new_password: newPw });
      setCurrentPw(''); setNewPw('');
      setPwMsg('Password updated!');
    } catch (err: unknown) {
      setPwMsg(err instanceof Error ? err.message : 'Failed to change password');
    } finally {
      setPwSaving(false);
    }
  };

  // Household members
  const [members, setMembers] = useState<Member[]>([]);
  const [membersLoaded, setMembersLoaded] = useState(false);
  const loadMembers = async () => {
    if (membersLoaded) return;
    try {
      const data = await api.get<Member[]>('/users/household');
      setMembers(data);
      setMembersLoaded(true);
    } catch { /* ignore */ }
  };

  // Invite
  const [inviteLink, setInviteLink] = useState('');
  const [inviteLoading, setInviteLoading] = useState(false);
  const [inviteCopied, setInviteCopied] = useState(false);

  const generateInvite = async () => {
    setInviteLoading(true);
    try {
      const data = await api.post<{ inviteUrl: string }>('/users/household/invite');
      setInviteLink(data.inviteUrl);
    } catch { /* ignore */ }
    finally { setInviteLoading(false); }
  };

  const copyInvite = async () => {
    await navigator.clipboard.writeText(inviteLink);
    setInviteCopied(true);
    setTimeout(() => setInviteCopied(false), 2000);
  };

  const handleLogout = async () => {
    await logout();
    router.push('/login');
  };

  if (!user) return null;

  const avatarUrl = resolvePhotoUrl(user.photo_url);

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <div>
        <h1 className="text-xl font-semibold text-text">Account</h1>
        <p className="mt-1 text-sm text-text-secondary">
          Manage your profile and household.
        </p>
      </div>

      {/* Profile */}
      <Card>
        <CardHeader>
          <CardTitle>Profile</CardTitle>
        </CardHeader>
        <form onSubmit={handleProfileSave} className="space-y-4">
          {/* Avatar + photo upload */}
          <div className="flex items-center gap-4">
            <div className="relative shrink-0">
              <div className="flex h-16 w-16 items-center justify-center overflow-hidden rounded-full bg-primary-light text-xl font-semibold text-primary">
                {avatarUrl ? (
                  <Image
                    src={avatarUrl}
                    alt={user.name}
                    width={64}
                    height={64}
                    className="h-full w-full object-cover"
                  />
                ) : (
                  user.name.charAt(0).toUpperCase()
                )}
              </div>
              {/* Upload overlay */}
              <button
                type="button"
                onClick={() => photoInputRef.current?.click()}
                disabled={photoUploading}
                title="Change photo"
                className="absolute -bottom-1 -right-1 flex h-6 w-6 items-center justify-center rounded-full border-2 border-surface bg-primary text-white hover:bg-primary-hover transition-colors disabled:opacity-50"
              >
                {photoUploading ? (
                  <span className="h-3 w-3 animate-spin rounded-full border border-white border-t-transparent" />
                ) : (
                  <IconCamera size={12} />
                )}
              </button>
              <input
                ref={photoInputRef}
                type="file"
                accept="image/jpeg,image/png,image/webp"
                className="hidden"
                onChange={handlePhotoChange}
              />
            </div>
            <div className="flex-1">
              <Input
                label="Name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                required
              />
            </div>
          </div>
          <Input label="Email" value={user.email} disabled />
          {(profileMsg || photoMsg) && (
            <p className={`text-xs ${(profileMsg === 'Saved!' || photoMsg === 'Photo updated!') ? 'text-success' : 'text-danger'}`}>
              {photoMsg || profileMsg}
            </p>
          )}
          <Button type="submit" loading={profileSaving}>
            Save changes
          </Button>
        </form>
      </Card>

      {/* Password */}
      <Card>
        <CardHeader>
          <CardTitle>Change password</CardTitle>
        </CardHeader>
        <form onSubmit={handlePasswordChange} className="space-y-4">
          <Input
            label="Current password"
            type="password"
            value={currentPw}
            onChange={(e) => setCurrentPw(e.target.value)}
            required
            autoComplete="current-password"
          />
          <Input
            label="New password"
            type="password"
            value={newPw}
            onChange={(e) => setNewPw(e.target.value)}
            required
            minLength={8}
            autoComplete="new-password"
          />
          {pwMsg && (
            <p className={`text-xs ${pwMsg.includes('updated') ? 'text-success' : 'text-danger'}`}>
              {pwMsg}
            </p>
          )}
          <Button type="submit" loading={pwSaving}>
            Update password
          </Button>
        </form>
      </Card>

      {/* Household */}
      <Card>
        <CardHeader>
          <CardTitle>Household</CardTitle>
          {user.role === 'owner' && (
            <Button size="sm" variant="secondary" onClick={generateInvite} loading={inviteLoading}>
              Generate invite
            </Button>
          )}
        </CardHeader>

        {inviteLink && (
          <div className="mb-4 flex items-center gap-2 rounded-lg bg-primary-light p-3">
            <p className="flex-1 truncate font-mono text-xs text-primary">{inviteLink}</p>
            <button onClick={copyInvite} className="shrink-0 text-primary hover:text-primary-hover">
              <IconCopy size={14} />
            </button>
            {inviteCopied && <span className="text-xs text-success">Copied!</span>}
          </div>
        )}

        <div className="space-y-2" onClick={loadMembers}>
          {membersLoaded ? (
            members.map((m) => (
              <div key={m.id} className="flex items-center gap-3 rounded-lg px-3 py-2 hover:bg-bg">
                <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-bg border border-border text-xs font-medium text-text-secondary">
                  {m.name.charAt(0).toUpperCase()}
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium text-text">{m.name}</p>
                  <p className="text-xs text-text-tertiary">{m.email}</p>
                </div>
                <Badge variant={m.role === 'owner' ? 'default' : 'muted'}>
                  {m.role}
                </Badge>
              </div>
            ))
          ) : (
            <button
              type="button"
              className="text-xs text-primary hover:underline"
            >
              Load members
            </button>
          )}
        </div>
      </Card>

      {/* Sign out */}
      <Card>
        <CardHeader>
          <CardTitle className="text-danger">Sign out</CardTitle>
        </CardHeader>
        <Button variant="secondary" onClick={handleLogout}>
          Sign out
        </Button>
      </Card>
    </div>
  );
}
