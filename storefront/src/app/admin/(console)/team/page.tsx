"use client";

import { useCallback, useEffect, useState } from "react";
import { adminTeam, identity, type TeamInvite, type TeamMember } from "@/lib/api";
import { useAuth, validateEmail } from "@/features/auth";
import { ConfirmDialog, ErrorBox, Spinner } from "@/components/ui";

export default function TeamPage() {
  const { me } = useAuth();
  const [team, setTeam] = useState<{ members: TeamMember[]; invites: TeamInvite[] } | null>(null);
  const [error, setError] = useState<unknown>(null);
  const [email, setEmail] = useState("");
  const [sentTo, setSentTo] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [removing, setRemoving] = useState<TeamMember | null>(null);

  const load = useCallback(async () => {
    try {
      setTeam(await adminTeam.get());
    } catch (e) {
      setError(e);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  if (!identity.isSuperAdmin(me)) {
    return (
      <div className="space-y-2">
        <h1 className="text-2xl font-bold">Team</h1>
        <p className="text-stone-700">Only the main admin can manage the admin team.</p>
      </div>
    );
  }

  async function invite(e: React.FormEvent) {
    e.preventDefault();
    if (!validateEmail(email)) return setError(new Error("Enter a valid email address."));
    setBusy(true);
    setError(null);
    setSentTo(null);
    try {
      await adminTeam.invite(email);
      setSentTo(email.trim());
      setEmail("");
      await load();
    } catch (err) {
      setError(err);
    } finally {
      setBusy(false);
    }
  }

  async function run(action: () => Promise<void>) {
    setBusy(true);
    setError(null);
    try {
      await action();
      await load();
    } catch (err) {
      setError(err);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Admin team</h1>
        <p className="text-sm text-stone-600">
          Only you, the main admin, can add or remove administrators. Invitees must first create and verify an account with the invited
          email address. Removing someone ends their sessions; tokens already issued stop working within about 15 minutes.
        </p>
      </div>

      {error !== null && <ErrorBox error={error} />}

      <form onSubmit={invite} className="flex flex-wrap items-end gap-3 rounded-2xl bg-white p-4 shadow-sm ring-1 ring-stone-200" noValidate>
        <div className="min-w-0 flex-1">
          <label htmlFor="invite-email" className="mb-1 block text-sm font-medium">
            Invite an administrator by email
          </label>
          <input
            id="invite-email"
            type="email"
            autoComplete="off"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="w-full rounded-xl border border-stone-300 bg-white px-3 py-2.5 focus:border-green-600"
          />
        </div>
        <button type="submit" disabled={busy} className="rounded-xl bg-stone-900 px-4 py-2.5 font-semibold text-white hover:bg-stone-800 disabled:opacity-60">
          Send invite
        </button>
        {sentTo && (
          <p role="status" className="w-full text-sm text-green-800">
            Invite sent to {sentTo}. The link works for 7 days.
          </p>
        )}
      </form>

      {!team ? (
        error ? null : <Spinner label="Loading team" />
      ) : (
        <>
          <section aria-labelledby="members-h" className="space-y-2">
            <h2 id="members-h" className="text-lg font-semibold">
              Administrators
            </h2>
            <ul className="divide-y divide-stone-200 rounded-2xl bg-white shadow-sm ring-1 ring-stone-200">
              {team.members.map((m) => (
                <li key={m.userId} className="flex items-center gap-3 p-4">
                  <div className="min-w-0 flex-1">
                    <p className="font-semibold">
                      {m.name || "Unnamed"}
                      {m.main && <span className="ml-2 rounded-full bg-green-100 px-2 py-0.5 text-xs font-semibold text-green-900">Main admin</span>}
                    </p>
                    <p className="text-sm text-stone-600">{m.email}</p>
                  </div>
                  {!m.main && (
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() => setRemoving(m)}
                      className="rounded-lg border border-red-300 px-3 py-1.5 text-sm font-medium text-red-800 hover:bg-red-50 disabled:opacity-60"
                    >
                      Remove
                    </button>
                  )}
                </li>
              ))}
            </ul>
          </section>

          <section aria-labelledby="invites-h" className="space-y-2">
            <h2 id="invites-h" className="text-lg font-semibold">
              Pending invites
            </h2>
            {team.invites.length === 0 ? (
              <p className="text-sm text-stone-600">No pending invites.</p>
            ) : (
              <ul className="divide-y divide-stone-200 rounded-2xl bg-white shadow-sm ring-1 ring-stone-200">
                {team.invites.map((i) => (
                  <li key={i.id} className="flex items-center gap-3 p-4">
                    <div className="min-w-0 flex-1">
                      <p className="font-medium">{i.email}</p>
                      <p className="text-xs text-stone-500">Expires {new Date(i.expiresAt).toLocaleString()}</p>
                    </div>
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() => run(() => adminTeam.revokeInvite(i.id))}
                      className="rounded-lg border border-stone-300 px-3 py-1.5 text-sm font-medium hover:bg-stone-100 disabled:opacity-60"
                    >
                      Revoke
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </>
      )}

      <ConfirmDialog
        open={removing !== null}
        title="Remove administrator?"
        confirmLabel="Remove"
        destructive
        busy={busy}
        onCancel={() => setRemoving(null)}
        onConfirm={() => {
          const target = removing;
          if (!target) return;
          void run(() => adminTeam.removeMember(target.userId)).then(() => setRemoving(null));
        }}
      >
        {removing?.name || removing?.email} will lose admin access and be signed out.
      </ConfirmDialog>
    </div>
  );
}
