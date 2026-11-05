import type { AdminFlag, AdminUser, Delivery, Partner, Restaurant, StaffOrder } from "@/lib/api";

export type AdminUserRoleFilter = "ALL" | "ADMIN" | "RESTAURANT" | "PARTNER" | "CUSTOMER";
export type ToggleableUserRole = "RESTAURANT" | "PARTNER" | "ADMIN";

export interface PlatformOpsSummary {
  liveOrdersCount: number;
  deliveredOrdersCount: number;
  refundedOrCancelledCount: number;
  grossMerchandiseValuePaise: number;
  openKitchensCount: number;
  totalKitchensCount: number;
  unlinkedKitchensCount: number;
  onlineRidersCount: number;
  totalRidersCount: number;
  unassignedDeliveriesCount: number;
  inTransitDeliveriesCount: number;
  parkedDeadLetters: number;
  enabledFlagsCount: number;
  totalFlagsCount: number;
}

export function computePlatformOpsSummary(input: {
  restaurants?: Restaurant[] | null;
  activeOrders?: StaffOrder[] | null;
  historyOrders?: StaffOrder[] | null;
  deliveries?: Delivery[] | null;
  partners?: Partner[] | null;
  parkedDeadLetters?: number | null;
  flags?: AdminFlag[] | null;
}): PlatformOpsSummary {
  const restaurants = input.restaurants ?? [];
  const activeOrders = input.activeOrders ?? [];
  const historyOrders = input.historyOrders ?? [];
  const deliveries = input.deliveries ?? [];
  const partners = input.partners ?? [];
  const flags = input.flags ?? [];

  const deliveredOrders = historyOrders.filter((o) => o.status === "DELIVERED");
  const refundedOrCancelled = historyOrders.filter((o) => o.status !== "DELIVERED");
  const grossMerchandiseValuePaise = [...activeOrders, ...deliveredOrders].reduce(
    (sum, o) => sum + (o.totalPaise || 0),
    0,
  );

  return {
    liveOrdersCount: activeOrders.length,
    deliveredOrdersCount: deliveredOrders.length,
    refundedOrCancelledCount: refundedOrCancelled.length,
    grossMerchandiseValuePaise,
    openKitchensCount: restaurants.filter((r) => r.open).length,
    totalKitchensCount: restaurants.length,
    unlinkedKitchensCount: restaurants.filter((r) => !r.ownerUserId).length,
    onlineRidersCount: partners.filter((p) => p.online).length,
    totalRidersCount: partners.length,
    unassignedDeliveriesCount: deliveries.filter((d) => d.status === "AVAILABLE").length,
    inTransitDeliveriesCount: deliveries.filter((d) => d.status === "ASSIGNED" || d.status === "PICKED_UP").length,
    parkedDeadLetters: input.parkedDeadLetters ?? 0,
    enabledFlagsCount: flags.filter((f) => f.enabled).length,
    totalFlagsCount: flags.length,
  };
}

export function filterAdminUsers(
  users: AdminUser[],
  roleFilter: AdminUserRoleFilter,
  query: string,
): AdminUser[] {
  const q = query.trim().toLowerCase();

  return users.filter((u) => {
    if (roleFilter !== "ALL" && !u.roles.includes(roleFilter)) {
      return false;
    }
    if (!q) return true;
    const hay = `${u.name ?? ""} ${u.email ?? ""} ${u.phone ?? ""} ${u.id} ${u.roles.join(" ")}`.toLowerCase();
    return hay.includes(q);
  });
}

export function canToggleUserRole(
  actorRoles: string[],
  targetUser: Pick<AdminUser, "roles" | "main">,
  role: ToggleableUserRole,
): { allowed: boolean; reason?: string } {
  const isAdmin = actorRoles.includes("ADMIN");
  const isSuperAdmin = actorRoles.includes("SUPER_ADMIN");
  if (!isAdmin) {
    return { allowed: false, reason: "Administrator access required" };
  }
  if (role === "ADMIN") {
    if (!isSuperAdmin) {
      return { allowed: false, reason: "Only the main Super Admin can grant or revoke ADMIN access" };
    }
    if (targetUser.main && targetUser.roles.includes("ADMIN")) {
      return { allowed: false, reason: "Primary Super Admin role cannot be removed" };
    }
  }
  return { allowed: true };
}
