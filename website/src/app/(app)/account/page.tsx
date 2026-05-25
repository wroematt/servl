'use client';

import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Card, CardHeader, CardTitle } from '@/components/ui/Card';
import { Input } from '@/components/ui/Input';
import { api } from '@/lib/api';
import { useAuth } from '@/providers/AuthProvider';
import { IconCopy } from '@tabler/icons-react';
import { FormEvent, useState } from 'react';
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
      await api.patch('/users/me', { current_password: currentPw, password: newPw });
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
      const data = await api.post<{ url: string }>('/users/household/invite');
      setInviteLink(data.url);
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
          <div className="flex items-center gap-4">
            <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-full bg-primary-light text-xl font-semibold text-primary">
              {user.name.charAt(0).toUpperCase()}
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
          {profileMsg && (
            <p className={`text-xs ${profileMsg === 'Saved!' ? 'text-success' : 'text-danger'}`}>
              {profileMsg}
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
