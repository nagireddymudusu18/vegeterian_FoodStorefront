"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import {
  adminTeam,
  adminUsers,
  errorMessage,
  identity,
  type AdminUser,
  type TeamInvite,
  type TeamMember,
} from "@/lib/api";
import {
  canToggleUserRole,
  filterAdminUsers,
  type AdminUserRoleFilter,
  type ToggleableUserRole,
} from "@/features/admin";
import { useAuth, validateEmail } from "@/features/auth";
import { ConfirmDialog, ErrorBox, Spinner } from "@/components/ui";

const ROLE_TABS: { id: AdminUserRoleFilter; label: string }[] = [
  { id: "ALL", label: "All accounts" },
  { id: "RESTAURANT", label: "Restaurant Partners" },
  { id: "PARTNER", label: "Delivery Partners" },
  { id: "ADMIN", label: "Admins" },
  { id: "CUSTOMER", label: "Customers" },
];

export default function TeamPage() {
  const { me } = useAuth();
  const isSuper = identity.isSuperAdmin(me);
  const actorRoles = me?.roles ?? [];

  const [users, setUsers] = useState<AdminUser[] | null>(null);
  const [team, setTeam] = useState<{ members: TeamMember[]; invites: TeamInvite[] } | null>(null);
  const [error, setError] = useState<unknown>(null);
  const [roleFilter, setRoleFilter] = useState<AdminUserRoleFilter>("ALL");
  const [search, setSearch] = useState("");
  const [togglingKey, setTogglingKey] = useState<string | null>(null);

  const [email, setEmail] = useState("");
  const [sentTo, setSentTo] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [removing, setRemoving] = useState<TeamMember | null>(null);

  const load = useCallback(async () => {
    try {
      const [userList, teamData] = await Promise.all([
        adminUsers.list(),
        isSuper ? adminTeam.get() : Promise.resolve(null),
      ]);
      setUsers(userList);
      if (teamData) setTeam(teamData);
    } catch (e) {
      setError(e);
    }
  }, [isSuper]);

  useEffect(() => {
    void load();
  }, [load]);

  const filteredUsers = useMemo(
    () => filterAdminUsers(users ?? [], roleFilter, search),
    [users, roleFilter, search],
  );

  async function handleToggleRole(user: AdminUser, role: ToggleableUserRole) {
    const check = canToggleUserRole(actorRoles, user, role);
    if (!check.allowed) {
      toast.error(check.reason ?? "Action not permitted");
      return;
    }
    const nextEnabled = !user.roles.includes(role);
    const key = `${user.id}:${role}`;
    setTogglingKey(key);
    setError(null);
    try {
      const updated = await adminUsers.setRole(user.id, role, nextEnabled);
      setUsers((prev) => (prev ? prev.map((u) => (u.id === updated.id ? updated : u)) : prev));
      toast.success(
        `${nextEnabled ? "Granted" : "Revoked"} ${role} role ${nextEnabled ? "to" : "from"} ${
          user.name || user.email || "user"
        }`,
      );
      if (role === "ADMIN" && isSuper) {
        const refreshedTeam = await adminTeam.get();
        setTeam(refreshedTeam);
      }
    } catch (err) {
      setError(err);
      toast.error(errorMessage(err));
    } finally {
      setTogglingKey(null);
    }
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
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-extrabold tracking-tight text-stone-900">Users, Roles &amp; Admin Team</h1>
        <p className="text-sm text-stone-600">
          Manage role-based access control (RBAC) across Customer, Restaurant Partner, Delivery Partner, and Org Admin portals.
        </p>
      </div>

      {error !== null && <ErrorBox error={error} />}

      <section aria-labelledby="rbac-dir-h" className="space-y-4">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h2 id="rbac-dir-h" className="text-lg font-extrabold text-stone-900">
              Platform User &amp; Role Directory ({users?.length ?? 0})
            </h2>
            <p className="text-xs text-stone-600">
              Toggle <strong>RESTAURANT</strong> (kitchen console) and <strong>PARTNER</strong> (rider dispatch console) access for any verified user.
            </p>
          </div>
          <div className="min-w-56 flex-1 sm:max-w-xs">
            <input
              type="search"
              aria-label="Search accounts by name, email, or phone"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search name, email, phone..."
              className="w-full rounded-xl border border-stone-300 bg-white px-3 py-2 text-xs text-stone-900 placeholder:text-stone-400 focus:border-[#1B5E3A]"
            />
          </div>
        </div>

        <div
          role="tablist"
          aria-label="Filter users by portal role"
          className="flex flex-wrap items-center gap-1 rounded-xl bg-stone-200/75 p-1"
        >
          {ROLE_TABS.map((t) => {
            const active = roleFilter === t.id;
            return (
              <button
                key={t.id}
                type="button"
                role="tab"
                aria-selected={active}
                onClick={() => setRoleFilter(t.id)}
                className={`rounded-lg px-3 py-1.5 text-xs font-bold transition-colors whitespace-nowrap shrink-0 ${
                  active ? "bg-white text-stone-900 shadow-xs" : "text-stone-700 hover:text-stone-900"
                }`}
              >
                {t.label}
              </button>
            );
          })}
        </div>

        {!users ? (
          error ? null : <Spinner label="Loading user directory" />
        ) : filteredUsers.length === 0 ? (
          <p className="card p-4 text-sm text-stone-600">No user accounts match the current filter.</p>
        ) : (
          <div className="card overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="border-b border-stone-200 text-xs font-bold uppercase tracking-wider text-stone-500">
                <tr>
                  <th className="p-3">Account</th>
                  <th className="p-3">Contact</th>
                  <th className="p-3">Assigned Roles</th>
                  <th className="p-3 text-right">Toggle Portal Access</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-stone-100">
                {filteredUsers.map((u) => {
                  const hasRest = u.roles.includes("RESTAURANT");
                  const hasPartner = u.roles.includes("PARTNER");
                  const hasAdmin = u.roles.includes("ADMIN");

                  return (
                    <tr key={u.id} className="hover:bg-stone-50/80">
                      <td className="p-3">
                        <p className="font-bold text-stone-900">
                          {u.name || "Unnamed User"}
                          {u.main && (
                            <span className="ml-2 text-xs font-semibold text-[#1B5E3A]">· Main Super Admin</span>
                          )}
                        </p>
                        <p className="font-mono text-[11px] text-stone-500">{u.id}</p>
                      </td>
                      <td className="p-3 text-xs text-stone-700">
                        <div>{u.email || "—"}</div>
                        <div className="font-mono text-stone-500">{u.phone || "No phone"}</div>
                      </td>
                      <td className="p-3 text-xs font-semibold text-stone-700">
                        {u.roles.join(" · ")}
                      </td>
                      <td className="p-3 text-right">
                        <div className="inline-flex flex-wrap justify-end gap-1.5">
                          <button
                            type="button"
                            disabled={togglingKey === `${u.id}:RESTAURANT`}
                            onClick={() => void handleToggleRole(u, "RESTAURANT")}
                            className={`rounded-lg px-2.5 py-1 text-xs font-bold transition-colors whitespace-nowrap shrink-0 ${
                              hasRest
                                ? "bg-[#1B5E3A] text-white hover:bg-green-800"
                                : "border border-stone-300 bg-white text-stone-700 hover:bg-stone-100"
                            }`}
                          >
                            {hasRest ? "Kitchen: On" : "+ Kitchen"}
                          </button>
                          <button
                            type="button"
                            disabled={togglingKey === `${u.id}:PARTNER`}
                            onClick={() => void handleToggleRole(u, "PARTNER")}
                            className={`rounded-lg px-2.5 py-1 text-xs font-bold transition-colors whitespace-nowrap shrink-0 ${
                              hasPartner
                                ? "bg-[#1B5E3A] text-white hover:bg-green-800"
                                : "border border-stone-300 bg-white text-stone-700 hover:bg-stone-100"
                            }`}
                          >
                            {hasPartner ? "Rider: On" : "+ Rider"}
                          </button>
                          {isSuper && !u.main && (
                            <button
                              type="button"
                              disabled={togglingKey === `${u.id}:ADMIN`}
                              onClick={() => void handleToggleRole(u, "ADMIN")}
                              className={`rounded-lg px-2.5 py-1 text-xs font-bold transition-colors whitespace-nowrap shrink-0 ${
                                hasAdmin
                                  ? "bg-stone-900 text-white hover:bg-stone-800"
                                  : "border border-stone-300 bg-white text-stone-700 hover:bg-stone-100"
                              }`}
                            >
                              {hasAdmin ? "Admin: On" : "+ Admin"}
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {isSuper && (
        <section aria-labelledby="admin-team-h" className="space-y-4 border-t border-stone-200 pt-6">
          <div>
            <h2 id="admin-team-h" className="text-lg font-extrabold text-stone-900">
              Admin Team Invitations
            </h2>
            <p className="text-xs text-stone-600">
              Only the main Super Admin can invite or remove administrators. Invitees must verify an account with the invited email address.
            </p>
          </div>

          <form onSubmit={invite} className="card flex flex-wrap items-end gap-3 p-4" noValidate>
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
            <button
              type="submit"
              disabled={busy}
              className="rounded-xl bg-stone-900 px-4 py-2.5 font-semibold text-white hover:bg-stone-800 disabled:opacity-60"
            >
              Send invite
            </button>
            {sentTo && (
              <p role="status" className="w-full text-sm text-green-800">
                Invite sent to {sentTo}. The link works for 7 days.
              </p>
            )}
          </form>

          {team && (
            <div className="grid gap-4 lg:grid-cols-2">
              <div className="space-y-2">
                <h3 className="text-sm font-bold text-stone-800">Administrators</h3>
                <ul className="card divide-y divide-stone-200">
                  {team.members.map((m) => (
                    <li key={m.userId} className="flex items-center gap-3 p-4">
                      <div className="min-w-0 flex-1">
                        <p className="font-semibold">
                          {m.name || "Unnamed"}
                          {m.main && (
                            <span className="ml-2 text-xs font-semibold text-green-900">· Main admin</span>
                          )}
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
              </div>

              <div className="space-y-2">
                <h3 className="text-sm font-bold text-stone-800">Pending invites</h3>
                {team.invites.length === 0 ? (
                  <p className="card p-4 text-sm text-stone-600">No pending invites.</p>
                ) : (
                  <ul className="card divide-y divide-stone-200">
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
              </div>
            </div>
          )}
        </section>
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
