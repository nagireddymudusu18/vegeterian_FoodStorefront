"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import {
  adminTeam,
  adminUsers,
  errorMessage,
  identity,
  type AdminUser,
  type CustomerDietaryCohort,
  type CustomerLoyaltyTier,
  type GroupAssignmentMode,
  type OrgCustomerGroupRules,
  type TeamInvite,
  type TeamMember,
} from "@/lib/api";
import {
  canToggleUserRole,
  filterAdminUsers,
  type AdminAccountDomainFilter,
  type AdminLoyaltyTierFilter,
  type AdminUserRoleFilter,
  type ToggleableUserRole,
} from "@/features/admin";
import {
  ACCOUNT_DOMAIN_META,
  DEFAULT_ORG_CUSTOMER_GROUP_RULES,
  DIETARY_COHORT_META,
  LOYALTY_TIER_META,
} from "@/features/customer-groups";
import { useAuth, validateEmail } from "@/features/auth";
import { formatPaise } from "@/lib/money";
import { ConfirmDialog, ErrorBox, Spinner } from "@/components/ui";

const DOMAIN_TABS: { id: AdminAccountDomainFilter; label: string }[] = [
  { id: "ALL", label: "All Domains" },
  { id: "CUSTOMER", label: "Customer Domain" },
  { id: "RESTAURANT_OWNER", label: "Restaurant Owner Domain" },
  { id: "DELIVERY_PARTNER", label: "Delivery Partner Domain" },
  { id: "ADMIN", label: "Org Admin Domain" },
];

const TIER_TABS: { id: AdminLoyaltyTierFilter; label: string }[] = [
  { id: "ALL", label: "All Customer Groups" },
  { id: "VIP", label: "VIP · Veggo Pass" },
  { id: "REGULAR", label: "Regular Members" },
  { id: "NEW", label: "New Customers" },
];

export default function TeamPage() {
  const { me } = useAuth();
  const isSuper = identity.isSuperAdmin(me);
  const actorRoles = me?.roles ?? [];

  const [users, setUsers] = useState<AdminUser[] | null>(null);
  const [orgRules, setOrgRules] = useState<OrgCustomerGroupRules>(DEFAULT_ORG_CUSTOMER_GROUP_RULES);
  const [savingRules, setSavingRules] = useState(false);
  const [team, setTeam] = useState<{ members: TeamMember[]; invites: TeamInvite[] } | null>(null);
  const [error, setError] = useState<unknown>(null);
  const [roleFilter] = useState<AdminUserRoleFilter>("ALL");
  const [domainFilter, setDomainFilter] = useState<AdminAccountDomainFilter>("ALL");
  const [tierFilter, setTierFilter] = useState<AdminLoyaltyTierFilter>("ALL");
  const [search, setSearch] = useState("");
  const [togglingKey, setTogglingKey] = useState<string | null>(null);

  const [email, setEmail] = useState("");
  const [sentTo, setSentTo] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [removing, setRemoving] = useState<TeamMember | null>(null);

  const load = useCallback(async () => {
    try {
      const [userList, rulesData, teamData] = await Promise.all([
        adminUsers.list(),
        adminUsers.getOrgRules().catch(() => DEFAULT_ORG_CUSTOMER_GROUP_RULES),
        isSuper ? adminTeam.get() : Promise.resolve(null),
      ]);
      setUsers(userList);
      setOrgRules(rulesData);
      if (teamData) setTeam(teamData);
    } catch (e) {
      setError(e);
    }
  }, [isSuper]);

  useEffect(() => {
    void load();
  }, [load]);

  const filteredUsers = useMemo(
    () => filterAdminUsers(users ?? [], roleFilter, search, domainFilter, tierFilter),
    [users, roleFilter, search, domainFilter, tierFilter],
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

  async function handleUpdateCustomerGroup(
    user: AdminUser,
    patch: {
      loyaltyTier?: CustomerLoyaltyTier;
      dietaryCohort?: CustomerDietaryCohort;
      assignmentMode?: GroupAssignmentMode;
    },
  ) {
    const key = `${user.id}:cg`;
    setTogglingKey(key);
    setError(null);
    try {
      const updated = await adminUsers.setCustomerGroup(user.id, patch);
      setUsers((prev) => (prev ? prev.map((u) => (u.id === updated.id ? updated : u)) : prev));
      toast.success(`Updated customer group for ${user.name || user.email || user.phone || "customer"}`);
    } catch (err) {
      setError(err);
      toast.error(errorMessage(err));
    } finally {
      setTogglingKey(null);
    }
  }

  async function handleSaveOrgRules(e: React.FormEvent) {
    e.preventDefault();
    setSavingRules(true);
    setError(null);
    try {
      const saved = await adminUsers.updateOrgRules(orgRules);
      setOrgRules(saved);
      const refreshedUsers = await adminUsers.list();
      setUsers(refreshedUsers);
      toast.success("Org customer group rules updated and applied to auto-managed accounts");
    } catch (err) {
      setError(err);
      toast.error(errorMessage(err));
    } finally {
      setSavingRules(false);
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
        <h1 className="text-2xl font-extrabold tracking-tight text-stone-900">
          Users, Roles &amp; Loyalty Rules
        </h1>
        <p className="text-sm text-stone-600">
          Manage accounts across <strong>Customer</strong>, <strong>Restaurant Partner</strong>,{" "}
          <strong>Delivery Partner</strong>, and <strong>Org Admin</strong> portals, configure Veggo Pass loyalty thresholds,
          and control team access.
        </p>
      </div>

      {error !== null && <ErrorBox error={error} />}

      {/* Org Customer Group Rules Configuration */}
      <section aria-labelledby="org-rules-h" className="card space-y-4 p-5">
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div>
            <p className="text-xs font-extrabold uppercase tracking-wider text-[#1B5E3A]">
              Veggo Pass &amp; Loyalty Policy
            </p>
            <h2 id="org-rules-h" className="text-lg font-extrabold text-stone-900">
              Customer Loyalty Rules &amp; Auto-Tier Engine
            </h2>
            <p className="text-xs text-stone-600">
              Accounts set to <strong>Auto-Upgrade</strong> promote automatically when they cross the completed order or
              lifetime spend thresholds below.
            </p>
          </div>
          <span className="rounded-lg bg-stone-100 px-2.5 py-1 text-xs font-semibold text-stone-700">
            Updated {new Date(orgRules.updatedAt).toLocaleDateString()}
          </span>
        </div>

        <form onSubmit={handleSaveOrgRules} className="space-y-4">
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
            <div>
              <label htmlFor="rule-new-disc" className="block text-xs font-bold text-stone-700">
                New Customer Discount (%)
              </label>
              <input
                id="rule-new-disc"
                type="number"
                min={0}
                max={50}
                value={orgRules.newCustomerDiscountPercent}
                onChange={(e) =>
                  setOrgRules((prev) => ({ ...prev, newCustomerDiscountPercent: Number(e.target.value) }))
                }
                className="mt-1 w-full rounded-xl border border-stone-300 bg-white px-3 py-2 text-sm font-semibold text-stone-900"
              />
            </div>

            <div>
              <label htmlFor="rule-reg-orders" className="block text-xs font-bold text-stone-700">
                Regular Tier Min Orders
              </label>
              <input
                id="rule-reg-orders"
                type="number"
                min={1}
                max={50}
                value={orgRules.regularMinOrders}
                onChange={(e) => setOrgRules((prev) => ({ ...prev, regularMinOrders: Number(e.target.value) }))}
                className="mt-1 w-full rounded-xl border border-stone-300 bg-white px-3 py-2 text-sm font-semibold text-stone-900"
              />
            </div>

            <div>
              <label htmlFor="rule-vip-orders" className="block text-xs font-bold text-stone-700">
                VIP Tier Min Orders
              </label>
              <input
                id="rule-vip-orders"
                type="number"
                min={1}
                max={200}
                value={orgRules.vipMinOrders}
                onChange={(e) => setOrgRules((prev) => ({ ...prev, vipMinOrders: Number(e.target.value) }))}
                className="mt-1 w-full rounded-xl border border-stone-300 bg-white px-3 py-2 text-sm font-semibold text-stone-900"
              />
            </div>

            <div>
              <label htmlFor="rule-vip-spend" className="block text-xs font-bold text-stone-700">
                VIP Min Spend (₹)
              </label>
              <input
                id="rule-vip-spend"
                type="number"
                min={100}
                step={100}
                value={Math.round(orgRules.vipMinSpendPaise / 100)}
                onChange={(e) =>
                  setOrgRules((prev) => ({ ...prev, vipMinSpendPaise: Math.max(0, Number(e.target.value)) * 100 }))
                }
                className="mt-1 w-full rounded-xl border border-stone-300 bg-white px-3 py-2 text-sm font-semibold text-stone-900"
              />
            </div>

            <div>
              <label htmlFor="rule-vip-disc" className="block text-xs font-bold text-stone-700">
                VIP Loyalty Discount (%)
              </label>
              <input
                id="rule-vip-disc"
                type="number"
                min={0}
                max={50}
                value={orgRules.vipDiscountPercent}
                onChange={(e) => setOrgRules((prev) => ({ ...prev, vipDiscountPercent: Number(e.target.value) }))}
                className="mt-1 w-full rounded-xl border border-stone-300 bg-white px-3 py-2 text-sm font-semibold text-stone-900"
              />
            </div>
          </div>

          <div className="flex flex-wrap items-center justify-between gap-4 border-t border-stone-200 pt-3">
            <div className="flex flex-wrap items-center gap-4 text-xs font-semibold text-stone-800">
              <label className="inline-flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={orgRules.vipFreeDelivery}
                  onChange={(e) => setOrgRules((prev) => ({ ...prev, vipFreeDelivery: e.target.checked }))}
                  className="h-4 w-4 rounded border-stone-300 text-[#1B5E3A]"
                />
                VIP Free Delivery (₹0 delivery fee)
              </label>
              <label className="inline-flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={orgRules.enforceCohortDietLock}
                  onChange={(e) => setOrgRules((prev) => ({ ...prev, enforceCohortDietLock: e.target.checked }))}
                  className="h-4 w-4 rounded border-stone-300 text-[#1B5E3A]"
                />
                Enforce Dietary Cohort guardrails at checkout
              </label>
              <label className="inline-flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={orgRules.strictJainTier1Only}
                  onChange={(e) => setOrgRules((prev) => ({ ...prev, strictJainTier1Only: e.target.checked }))}
                  className="h-4 w-4 rounded border-stone-300 text-[#1B5E3A]"
                />
                Strict Jain cohort restricted to Tier-1 Pure Veg kitchens
              </label>
            </div>

            <button
              type="submit"
              disabled={savingRules}
              className="rounded-xl bg-[#1B5E3A] px-4 py-2 text-xs font-bold text-white hover:bg-[#14472C] disabled:opacity-60"
            >
              {savingRules ? "Saving rules..." : "Save Org Rules"}
            </button>
          </div>
        </form>
      </section>

      <section aria-labelledby="rbac-dir-h" className="space-y-4">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h2 id="rbac-dir-h" className="text-lg font-extrabold text-stone-900">
              Platform User &amp; Domain Directory ({filteredUsers.length} / {users?.length ?? 0})
            </h2>
            <p className="text-xs text-stone-600">
              Each account is bound to an <strong>Account Domain</strong>. Assign Customer Loyalty Tiers, Dietary
              Cohorts, and portal roles below.
            </p>
          </div>
          <div className="min-w-56 flex-1 sm:max-w-xs">
            <input
              type="search"
              aria-label="Search accounts by name, email, phone, domain, or group"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search name, email, phone, VIP, Jain..."
              className="w-full rounded-xl border border-stone-300 bg-white px-3 py-2 text-xs text-stone-900 placeholder:text-stone-400 focus:border-[#1B5E3A]"
            />
          </div>
        </div>

        <div className="flex flex-wrap items-center justify-between gap-2">
          <div
            role="tablist"
            aria-label="Filter users by account domain"
            className="flex flex-wrap items-center gap-1 rounded-xl bg-stone-200/75 p-1"
          >
            {DOMAIN_TABS.map((t) => {
              const active = domainFilter === t.id;
              return (
                <button
                  key={t.id}
                  type="button"
                  role="tab"
                  aria-selected={active}
                  onClick={() => setDomainFilter(t.id)}
                  className={`rounded-lg px-3 py-1.5 text-xs font-bold transition-colors whitespace-nowrap shrink-0 ${
                    active ? "bg-white text-stone-900 shadow-xs" : "text-stone-700 hover:text-stone-900"
                  }`}
                >
                  {t.label}
                </button>
              );
            })}
          </div>

          <div
            role="tablist"
            aria-label="Filter customers by loyalty group"
            className="flex flex-wrap items-center gap-1 rounded-xl bg-stone-200/75 p-1"
          >
            {TIER_TABS.map((t) => {
              const active = tierFilter === t.id;
              return (
                <button
                  key={t.id}
                  type="button"
                  role="tab"
                  aria-selected={active}
                  onClick={() => setTierFilter(t.id)}
                  className={`rounded-lg px-2.5 py-1.5 text-xs font-bold transition-colors whitespace-nowrap shrink-0 ${
                    active ? "bg-white text-[#1B5E3A] shadow-xs" : "text-stone-700 hover:text-stone-900"
                  }`}
                >
                  {t.label}
                </button>
              );
            })}
          </div>
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
                  <th className="p-3">Account &amp; Domain</th>
                  <th className="p-3">Contact</th>
                  <th className="p-3">Customer Group &amp; Cohort (Admin / Org Rule)</th>
                  <th className="p-3 text-right">Portal Roles</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-stone-100">
                {filteredUsers.map((u) => {
                  const hasRest = u.roles.includes("RESTAURANT");
                  const hasPartner = u.roles.includes("PARTNER");
                  const hasAdmin = u.roles.includes("ADMIN");
                  const domain = u.accountDomain ?? "CUSTOMER";
                  const domainMeta = ACCOUNT_DOMAIN_META[domain];
                  const cg = u.customerGroup;
                  const cgBusy = togglingKey === `${u.id}:cg`;

                  return (
                    <tr key={u.id} className="align-top hover:bg-stone-50/80">
                      <td className="p-3">
                        <div className="flex flex-wrap items-center gap-1.5">
                          <p className="font-bold text-stone-900">{u.name || "Unnamed User"}</p>
                          <span
                            className={`rounded-md px-2 py-0.5 text-[11px] font-bold ${
                              domain === "CUSTOMER"
                                ? "bg-emerald-50 text-emerald-900"
                                : domain === "RESTAURANT_OWNER"
                                  ? "bg-amber-100 text-amber-950"
                                  : domain === "DELIVERY_PARTNER"
                                    ? "bg-sky-100 text-sky-950"
                                    : "bg-stone-900 text-white"
                            }`}
                          >
                            {domainMeta.shortLabel}
                          </span>
                          {u.main && (
                            <span className="text-xs font-semibold text-[#1B5E3A]">· Main Super Admin</span>
                          )}
                        </div>
                        <p className="mt-0.5 font-mono text-[11px] text-stone-500">
                          {u.id} · Portal: {domainMeta.portalPath}
                        </p>
                      </td>
                      <td className="p-3 text-xs text-stone-700">
                        <div>{u.email || "—"}</div>
                        <div className="font-mono text-stone-500">{u.phone || "No phone"}</div>
                      </td>
                      <td className="p-3 text-xs">
                        {domain === "CUSTOMER" && cg ? (
                          <div className="space-y-1.5">
                            <div className="flex flex-wrap items-center gap-1.5">
                              <select
                                aria-label={`Loyalty tier for ${u.name || u.id}`}
                                disabled={cgBusy}
                                value={cg.loyaltyTier}
                                onChange={(e) =>
                                  void handleUpdateCustomerGroup(u, {
                                    loyaltyTier: e.target.value as CustomerLoyaltyTier,
                                    assignmentMode: "ADMIN_PINNED",
                                  })
                                }
                                className="rounded-lg border border-stone-300 bg-white px-2 py-1 text-xs font-bold text-stone-900"
                              >
                                <option value="NEW">{LOYALTY_TIER_META.NEW.label}</option>
                                <option value="REGULAR">{LOYALTY_TIER_META.REGULAR.label}</option>
                                <option value="VIP">{LOYALTY_TIER_META.VIP.label}</option>
                              </select>

                              <select
                                aria-label={`Dietary cohort for ${u.name || u.id}`}
                                disabled={cgBusy}
                                value={cg.dietaryCohort}
                                onChange={(e) =>
                                  void handleUpdateCustomerGroup(u, {
                                    dietaryCohort: e.target.value as CustomerDietaryCohort,
                                  })
                                }
                                className="rounded-lg border border-stone-300 bg-white px-2 py-1 text-xs font-semibold text-stone-800"
                              >
                                <option value="PURE_VEG">{DIETARY_COHORT_META.PURE_VEG.label}</option>
                                <option value="VEGAN">{DIETARY_COHORT_META.VEGAN.label}</option>
                                <option value="STRICT_JAIN">{DIETARY_COHORT_META.STRICT_JAIN.label}</option>
                              </select>

                              <select
                                aria-label={`Assignment mode for ${u.name || u.id}`}
                                disabled={cgBusy}
                                value={cg.assignmentMode}
                                onChange={(e) =>
                                  void handleUpdateCustomerGroup(u, {
                                    assignmentMode: e.target.value as GroupAssignmentMode,
                                  })
                                }
                                className="rounded-lg border border-stone-200 bg-stone-50 px-2 py-1 text-[11px] font-semibold text-stone-700"
                              >
                                <option value="AUTO_ORG_RULE">Auto (Org Rule)</option>
                                <option value="ADMIN_PINNED">Admin Pinned</option>
                              </select>
                            </div>
                            <p className="text-[11px] text-stone-500">
                              {cg.completedOrdersCount} completed orders · {formatPaise(cg.lifetimeSpendPaise)} spend
                            </p>
                          </div>
                        ) : (
                          <span className="text-stone-400">
                            Isolated {domainMeta.label} account (Customer groups apply only to CUSTOMER domain)
                          </span>
                        )}
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
