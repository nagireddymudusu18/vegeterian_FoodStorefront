"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import {
  errorMessage,
  fleetApi,
  identity,
  notificationsApi,
  orders,
  refreshSession,
  type Order,
} from "@/lib/api";
import { formatPaise } from "@/lib/money";
import { useCart } from "@/features/cart";
import { useRequireAuth, passwordProblem, validateEmail, normalizePhone } from "@/features/auth";
import {
  ALLERGEN_CATALOG,
  CONSENT_CATALOG,
  DIET_OPTIONS,
  openLocationPickerModal,
  usePrefs,
  type AddressTag,
  type ConsentPurpose,
} from "@/features/catalog";
import { useFlag } from "@/features/flags";
import { StatusPill } from "@/features/orders";
import { ConfirmDialog, ErrorBox, Spinner } from "@/components/ui";

function AddPassword({ onDone }: { onDone: () => void | Promise<unknown> }) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<unknown>(null);
  const [sent, setSent] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    const problem = !validateEmail(email) ? "Enter a valid email address." : passwordProblem(password);
    if (problem) return setError(new Error(problem));
    setBusy(true);
    setError(null);
    try {
      await identity.addCredentials(email, password);
      setSent(true);
      await onDone();
    } catch (err) {
      setError(err);
      setBusy(false);
    }
  };

  if (sent) {
    return (
      <p role="status" className="rounded-xl border border-green-200 bg-green-50 p-4 text-sm text-green-900">
        Check your email: we sent a link to confirm the address. You can sign in with it once it is confirmed.
      </p>
    );
  }

  return (
    <form onSubmit={submit} className="rounded-xl border border-stone-200 bg-stone-50/80 p-4 space-y-3" noValidate>
      <div>
        <h3 className="text-sm font-bold text-stone-900">Add email &amp; password</h3>
        <p className="text-xs text-stone-600">Optional. Lets you sign in without an OTP next time and receive GST receipts.</p>
      </div>
      <input
        type="email"
        aria-label="Email"
        autoComplete="email"
        placeholder="Email address"
        value={email}
        onChange={(e) => setEmail(e.target.value)}
        className="w-full rounded-xl border border-stone-300 bg-white px-3 py-2 text-sm"
      />
      <input
        type="password"
        aria-label="New password"
        autoComplete="new-password"
        placeholder="Password (8+ characters, letter and number)"
        value={password}
        onChange={(e) => setPassword(e.target.value)}
        className="w-full rounded-xl border border-stone-300 bg-white px-3 py-2 text-sm"
      />
      {error !== null && <ErrorBox error={error} />}
      <button
        type="submit"
        disabled={busy}
        className="w-full rounded-xl bg-green-700 px-4 py-2.5 text-sm font-semibold text-white hover:bg-green-800 disabled:opacity-60"
      >
        {busy ? "Saving..." : "Save credentials"}
      </button>
    </form>
  );
}

function AddPhone({ onDone }: { onDone: () => void | Promise<unknown> }) {
  const [phoneInput, setPhoneInput] = useState("");
  const [phone, setPhone] = useState("");
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<unknown>(null);

  const request = async (e: React.FormEvent) => {
    e.preventDefault();
    const p = normalizePhone(phoneInput);
    if (!p) return setError(new Error("Enter a valid 10-digit Indian mobile number."));
    setBusy(true);
    setError(null);
    try {
      await identity.requestPhoneOtp(p);
      setPhone(p);
    } catch (err) {
      setError(err);
    } finally {
      setBusy(false);
    }
  };

  const verify = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!/^\d{4,8}$/.test(code)) return setError(new Error("Enter the numeric code we sent you."));
    setBusy(true);
    setError(null);
    try {
      await identity.verifyPhone(phone, code);
      toast.success("Mobile number verified");
      await onDone();
    } catch (err) {
      setError(err);
      setBusy(false);
    }
  };

  return (
    <form onSubmit={phone ? verify : request} className="rounded-xl border border-stone-200 bg-stone-50/80 p-4 space-y-3" noValidate>
      <div>
        <h3 className="text-sm font-bold text-stone-900">Add a mobile number</h3>
        <p className="text-xs text-stone-600">Optional. Lets you sign in with an OTP and get live delivery SMS updates.</p>
      </div>
      {phone ? (
        <input
          type="text"
          inputMode="numeric"
          aria-label="One-time code"
          autoComplete="one-time-code"
          placeholder={`Code sent to ${phone}`}
          maxLength={8}
          value={code}
          onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))}
          className="w-full rounded-xl border border-stone-300 bg-white px-3 py-2 text-sm"
        />
      ) : (
        <input
          type="tel"
          inputMode="numeric"
          aria-label="Mobile number"
          autoComplete="tel-national"
          placeholder="10-digit mobile number"
          value={phoneInput}
          onChange={(e) => setPhoneInput(e.target.value)}
          className="w-full rounded-xl border border-stone-300 bg-white px-3 py-2 text-sm"
        />
      )}
      {error !== null && <ErrorBox error={error} />}
      <button
        type="submit"
        disabled={busy}
        className="w-full rounded-xl bg-green-700 px-4 py-2.5 text-sm font-semibold text-white hover:bg-green-800 disabled:opacity-60"
      >
        {busy ? "Please wait..." : phone ? "Verify mobile" : "Send OTP"}
      </button>
    </form>
  );
}

const ROLE_LINKS: Record<string, { label: string; href: string }> = {
  RESTAURANT: { label: "Restaurant Console", href: "/restaurant" },
  PARTNER: { label: "Delivery Partner App", href: "/partner" },
  ADMIN: { label: "Admin Console", href: "/admin" },
};

export default function ProfilePage() {
  const router = useRouter();
  const [leaving, setLeaving] = useState(false);
  const { status, me, logout, reload } = useRequireAuth(leaving);
  const { clear } = useCart();
  const deliveryModuleOn = useFlag("delivery_module");
  const {
    location,
    setLocation,
    diet,
    setDiet,
    allergenWatchlist,
    toggleAllergen,
    clearAllergens,
    savedAddresses,
    saveAddress,
    removeAddress,
    consents,
    setConsentPref,
  } = usePrefs();

  // Section 1: Display name editing & email/password actions
  const [editingName, setEditingName] = useState(false);
  const [nameDraft, setNameDraft] = useState("");
  const [savingName, setSavingName] = useState(false);
  const [nameError, setNameError] = useState<string | null>(null);

  const [emailActionInput, setEmailActionInput] = useState("");
  const [showEmailActionForm, setShowEmailActionForm] = useState<"verify" | "reset" | null>(null);
  const [emailActionBusy, setEmailActionBusy] = useState(false);

  // Section 3: Saved addresses form
  const [addingAddress, setAddingAddress] = useState(false);
  const [addrTag, setAddrTag] = useState<AddressTag>("HOME");
  const [addrLabel, setAddrLabel] = useState("Home");
  const [addrBuilding, setAddrBuilding] = useState("");
  const [addrLandmark, setAddrLandmark] = useState("");

  // Section 4: Recent orders & notifications
  const [recentOrders, setRecentOrders] = useState<Order[] | null>(null);
  const [unreadNotifs, setUnreadNotifs] = useState<number>(0);

  // Section 5: Consents & Partner enrolment & Delete account
  const [savingConsent, setSavingConsent] = useState<ConsentPurpose | null>(null);
  const [enrollingPartner, setEnrollingPartner] = useState(false);
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  const authed = status === "authed";

  useEffect(() => {
    if (!authed) return;
    const ctrl = new AbortController();
    orders
      .list(ctrl.signal)
      .then((list) => {
        const sorted = [...list].sort((a, b) => String(b.createdAt ?? "").localeCompare(String(a.createdAt ?? "")));
        setRecentOrders(sorted.slice(0, 3));
      })
      .catch(() => setRecentOrders([]));

    notificationsApi
      .unread(ctrl.signal)
      .then((r) => setUnreadNotifs(r.unread ?? 0))
      .catch(() => {});
    return () => ctrl.abort();
  }, [authed]);

  if (!authed || !me) return <Spinner label="Loading profile" />;

  const initials = (me.name || me.email || "VE")
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? "")
    .join("") || "VE";

  const memberSince = me.createdAt
    ? new Date(me.createdAt).toLocaleDateString("en-IN", { month: "short", year: "numeric" })
    : null;

  const startEditName = () => {
    setNameDraft(me.name ?? "");
    setNameError(null);
    setEditingName(true);
  };

  const handleSaveName = async (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = nameDraft.trim();
    if (!trimmed || trimmed.length > 80) {
      setNameError("Enter a display name between 1 and 80 characters.");
      return;
    }
    setSavingName(true);
    setNameError(null);
    try {
      await identity.updateName(trimmed);
      await reload();
      setEditingName(false);
      toast.success("Display name updated");
    } catch (err) {
      setNameError(errorMessage(err));
    } finally {
      setSavingName(false);
    }
  };

  const handleEmailAction = async (e: React.FormEvent) => {
    e.preventDefault();
    const clean = emailActionInput.trim();
    if (!validateEmail(clean)) {
      toast.error("Enter the full email address registered on your account.");
      return;
    }
    setEmailActionBusy(true);
    try {
      if (showEmailActionForm === "verify") {
        await identity.resendVerification(clean);
        toast.success("Verification link sent — check your inbox.");
      } else {
        await identity.forgotPassword(clean);
        toast.success("Password reset link sent to your email.");
      }
      setShowEmailActionForm(null);
      setEmailActionInput("");
    } catch (err) {
      toast.error(errorMessage(err));
    } finally {
      setEmailActionBusy(false);
    }
  };

  const handleSaveAddress = (e: React.FormEvent) => {
    e.preventDefault();
    if (!addrBuilding.trim()) {
      toast.error("Enter flat, floor, or building details.");
      return;
    }
    const label =
      addrTag === "HOME"
        ? "Home"
        : addrTag === "WORK"
          ? "Work"
          : addrLabel.trim() || "Saved spot";
    saveAddress({
      tag: addrTag,
      label,
      building: addrBuilding.trim(),
      landmark: addrLandmark.trim() || undefined,
      areaLabel: location.label,
      lat: location.lat,
      lng: location.lng,
    });
    setAddrBuilding("");
    setAddrLandmark("");
    setAddingAddress(false);
    toast.success(`${label} address saved`);
  };

  const handleToggleConsent = async (purpose: ConsentPurpose, version: string) => {
    const nextGranted = !consents[purpose];
    setConsentPref(purpose, nextGranted);
    setSavingConsent(purpose);
    try {
      await identity.recordConsent(purpose, version, nextGranted);
      toast.success("Preference saved");
    } catch (err) {
      // Revert local state on error
      setConsentPref(purpose, !nextGranted);
      toast.error(errorMessage(err));
    } finally {
      setSavingConsent(null);
    }
  };

  const handleBecomePartner = async () => {
    setEnrollingPartner(true);
    try {
      await fleetApi.becomePartner();
      await refreshSession();
      await reload();
      toast.success("You are now enrolled as a delivery partner!");
    } catch (err) {
      toast.error(errorMessage(err));
    } finally {
      setEnrollingPartner(false);
    }
  };

  const signOut = () => {
    setLeaving(true);
    logout();
    router.replace("/");
  };

  const deleteAccount = async () => {
    setDeleting(true);
    setDeleteError(null);
    try {
      await identity.deleteMe();
      setLeaving(true);
      logout();
      clear();
      router.replace("/");
    } catch (e) {
      setConfirmingDelete(false);
      setDeleteError(errorMessage(e));
      setDeleting(false);
    }
  };

  const isPartner = me.roles.includes("PARTNER");

  return (
    <div className="mx-auto max-w-5xl space-y-6 pb-8">
      {/* Top Account Hero Banner */}
      <header className="card overflow-hidden border border-[#E5DEC9] bg-gradient-to-br from-[#FBF6EA] via-white to-[#F3E6C4]/50 p-5 sm:p-6">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-4 min-w-0">
            <div
              className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl bg-[#1B5E3A] text-lg font-extrabold tracking-tight text-white shadow-sm"
              aria-hidden="true"
            >
              {initials}
            </div>
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <h1 className="page-title truncate">{me.name || "Your profile"}</h1>
                <span className="rounded-full bg-[#1B5E3A]/10 px-2.5 py-0.5 text-xs font-bold text-[#1B5E3A]">
                  {me.status ?? "ACTIVE"}
                </span>
                {memberSince && (
                  <span className="text-xs font-medium text-stone-500">Member since {memberSince}</span>
                )}
              </div>
              <p className="mt-0.5 text-sm text-stone-600">
                Manage your identity, Pure Veg &amp; allergen guardrails, delivery spots, and privacy controls.
              </p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {me.roles
              .filter((r) => ROLE_LINKS[r])
              .map((r) => (
                <Link
                  key={r}
                  href={ROLE_LINKS[r].href}
                  className="inline-flex items-center gap-1.5 rounded-xl border border-[#1B5E3A]/25 bg-[#1B5E3A]/5 px-3 py-1.5 text-xs font-bold text-[#1B5E3A] hover:bg-[#1B5E3A]/10"
                >
                  <span>{ROLE_LINKS[r].label}</span>
                  <span aria-hidden="true">&rarr;</span>
                </Link>
              ))}
            <button
              type="button"
              onClick={signOut}
              className="rounded-xl border border-stone-300 bg-white px-3.5 py-1.5 text-xs font-semibold text-stone-700 hover:bg-stone-100"
            >
              Log out
            </button>
          </div>
        </div>
      </header>

      <div className="grid gap-6 lg:grid-cols-12">
        {/* Left Column: Section 1 (Identity) + Section 3 (Saved Addresses) + Section 4 (Recent Orders) */}
        <div className="space-y-6 lg:col-span-7 min-w-0">
          {/* SECTION 1: Identity, Security & Verification */}
          <section className="card space-y-4 p-5" aria-labelledby="sec-identity">
            <div className="flex items-center justify-between gap-2 border-b border-stone-100 pb-3">
              <div>
                <h2 id="sec-identity" className="text-base font-bold text-stone-900">
                  Identity &amp; Sign-in Security
                </h2>
                <p className="text-xs text-stone-600">
                  Encrypted personal details used for delivery handoff and GST tax receipts.
                </p>
              </div>
              {!editingName && (
                <button
                  type="button"
                  onClick={startEditName}
                  className="rounded-lg border border-stone-300 px-3 py-1.5 text-xs font-semibold text-stone-800 hover:bg-stone-100"
                >
                  {me.name ? "Edit name" : "Add name"}
                </button>
              )}
            </div>

            {editingName ? (
              <form onSubmit={handleSaveName} className="rounded-xl border border-stone-200 bg-stone-50 p-3.5 space-y-2.5">
                <label htmlFor="profile-display-name" className="block text-xs font-bold uppercase tracking-wider text-stone-600">
                  Display name
                </label>
                <div className="flex flex-col gap-2 sm:flex-row">
                  <input
                    id="profile-display-name"
                    type="text"
                    maxLength={80}
                    value={nameDraft}
                    onChange={(e) => setNameDraft(e.target.value)}
                    placeholder="Your name for orders & receipts"
                    className="min-w-0 flex-1 rounded-xl border border-stone-300 bg-white px-3 py-2 text-sm"
                  />
                  <div className="flex gap-2">
                    <button
                      type="submit"
                      disabled={savingName}
                      className="rounded-xl bg-[#1B5E3A] px-4 py-2 text-xs font-bold text-white hover:bg-green-800 disabled:opacity-60"
                    >
                      {savingName ? "Saving..." : "Save name"}
                    </button>
                    <button
                      type="button"
                      onClick={() => setEditingName(false)}
                      className="rounded-xl border border-stone-300 bg-white px-3 py-2 text-xs font-semibold text-stone-700 hover:bg-stone-100"
                    >
                      Cancel
                    </button>
                  </div>
                </div>
                {nameError && (
                  <p role="alert" className="text-xs font-semibold text-red-700">
                    {nameError}
                  </p>
                )}
              </form>
            ) : (
              <div className="grid gap-3 sm:grid-cols-2">
                <div className="rounded-xl border border-stone-200/80 bg-[#FBF6EA]/50 p-3.5">
                  <p className="text-xs font-medium text-stone-500">Name</p>
                  <p className="mt-0.5 text-base font-bold text-stone-900">
                    {me.name || <span className="text-sm font-normal text-stone-500">Not set yet</span>}
                  </p>
                </div>

                <div className="rounded-xl border border-stone-200/80 bg-[#FBF6EA]/50 p-3.5">
                  <div className="flex items-center justify-between gap-2">
                    <p className="text-xs font-medium text-stone-500">Mobile number</p>
                    {me.phone && (
                      <span className="inline-flex items-center gap-1 rounded-full bg-green-100 px-2 py-0.5 text-[11px] font-bold text-green-900">
                        OTP Verified
                      </span>
                    )}
                  </div>
                  <p className="mt-0.5 text-base font-bold text-stone-900">
                    {me.phone || <span className="text-sm font-normal text-stone-500">No mobile linked</span>}
                  </p>
                </div>
              </div>
            )}

            {me.email && (
              <div className="rounded-xl border border-stone-200/80 bg-[#FBF6EA]/50 p-3.5">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <p className="text-xs font-medium text-stone-500">Email</p>
                    <p className="mt-0.5 text-base font-bold text-stone-900">
                      {me.email}
                      {me.emailVerified === false ? (
                        <span className="ml-2 rounded-full bg-amber-100 px-2 py-0.5 align-middle text-xs font-semibold text-amber-900">
                          Not verified
                        </span>
                      ) : (
                        <span className="ml-2 rounded-full bg-green-100 px-2 py-0.5 align-middle text-xs font-semibold text-green-900">
                          Verified
                        </span>
                      )}
                    </p>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {me.emailVerified === false && (
                      <button
                        type="button"
                        onClick={() =>
                          setShowEmailActionForm((cur) => (cur === "verify" ? null : "verify"))
                        }
                        className="rounded-lg border border-amber-400 bg-amber-50 px-2.5 py-1.5 text-xs font-bold text-amber-950 hover:bg-amber-100"
                      >
                        Resend verification email
                      </button>
                    )}
                    {me.hasPassword && (
                      <button
                        type="button"
                        onClick={() =>
                          setShowEmailActionForm((cur) => (cur === "reset" ? null : "reset"))
                        }
                        className="rounded-lg border border-stone-300 bg-white px-2.5 py-1.5 text-xs font-semibold text-stone-700 hover:bg-stone-100"
                      >
                        Reset password
                      </button>
                    )}
                  </div>
                </div>

                {showEmailActionForm && (
                  <form onSubmit={handleEmailAction} className="mt-3 flex flex-col gap-2 border-t border-stone-200 pt-3 sm:flex-row">
                    <input
                      type="email"
                      required
                      value={emailActionInput}
                      onChange={(e) => setEmailActionInput(e.target.value)}
                      placeholder="Confirm your full email address"
                      aria-label="Confirm your full email address"
                      className="min-w-0 flex-1 rounded-xl border border-stone-300 bg-white px-3 py-2 text-xs"
                    />
                    <button
                      type="submit"
                      disabled={emailActionBusy}
                      className="rounded-xl bg-[#1B5E3A] px-3.5 py-2 text-xs font-bold text-white hover:bg-green-800 disabled:opacity-60"
                    >
                      {emailActionBusy
                        ? "Sending..."
                        : showEmailActionForm === "verify"
                          ? "Send verification link"
                          : "Send password reset"}
                    </button>
                  </form>
                )}
              </div>
            )}

            {!me.hasPassword && <AddPassword onDone={reload} />}
            {!me.phone && <AddPhone onDone={reload} />}
          </section>

          {/* SECTION 3: Saved Delivery Addresses & Spots Manager */}
          <section className="card space-y-4 p-5" aria-labelledby="sec-addresses">
            <div className="flex flex-wrap items-center justify-between gap-2 border-b border-stone-100 pb-3">
              <div>
                <h2 id="sec-addresses" className="text-base font-bold text-stone-900">
                  Saved Delivery Addresses &amp; Spots
                </h2>
                <p className="text-xs text-stone-600">
                  Switch your active Bengaluru delivery pin or save building &amp; landmark notes.
                </p>
              </div>
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={() => openLocationPickerModal()}
                  className="rounded-xl border border-[#1B5E3A]/30 bg-[#1B5E3A]/5 px-3 py-1.5 text-xs font-bold text-[#1B5E3A] hover:bg-[#1B5E3A]/10"
                >
                  Open interactive map
                </button>
                <button
                  type="button"
                  onClick={() => setAddingAddress((v) => !v)}
                  className="rounded-xl bg-[#1B5E3A] px-3 py-1.5 text-xs font-bold text-white hover:bg-green-800"
                >
                  {addingAddress ? "Close form" : "+ Save address"}
                </button>
              </div>
            </div>

            {/* Active location bar */}
            <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-[#E8A317]/40 bg-[#F3E6C4]/50 px-3.5 py-2.5">
              <div className="min-w-0">
                <p className="text-[11px] font-bold uppercase tracking-wider text-stone-600">
                  Active delivery spot
                </p>
                <p className="truncate text-sm font-bold text-stone-900">{location.label}</p>
              </div>
              <span className="rounded-lg bg-white/80 px-2.5 py-1 font-mono text-xs font-medium text-stone-700">
                {location.lat.toFixed(4)}, {location.lng.toFixed(4)}
              </span>
            </div>

            {addingAddress && (
              <form
                onSubmit={handleSaveAddress}
                className="rounded-xl border border-stone-200 bg-stone-50 p-4 space-y-3"
              >
                <div className="flex items-center justify-between">
                  <h3 className="text-xs font-bold uppercase tracking-wider text-stone-700">
                    Save address for {location.label}
                  </h3>
                  <button
                    type="button"
                    onClick={() => openLocationPickerModal()}
                    className="text-xs font-semibold text-[#1B5E3A] underline"
                  >
                    Change map pin
                  </button>
                </div>

                <div className="flex flex-wrap gap-2" role="group" aria-label="Address tag">
                  {(["HOME", "WORK", "OTHER"] as AddressTag[]).map((tag) => (
                    <button
                      key={tag}
                      type="button"
                      onClick={() => {
                        setAddrTag(tag);
                        if (tag === "HOME") setAddrLabel("Home");
                        else if (tag === "WORK") setAddrLabel("Work");
                        else setAddrLabel("Parents' Place");
                      }}
                      className={`rounded-lg px-3 py-1.5 text-xs font-bold transition ${
                        addrTag === tag
                          ? "bg-[#1B5E3A] text-white"
                          : "border border-stone-300 bg-white text-stone-700 hover:bg-stone-100"
                      }`}
                    >
                      {tag === "HOME" ? "Home" : tag === "WORK" ? "Work" : "Other"}
                    </button>
                  ))}
                </div>

                {addrTag === "OTHER" && (
                  <input
                    type="text"
                    value={addrLabel}
                    onChange={(e) => setAddrLabel(e.target.value)}
                    placeholder="Custom label (e.g., Parents' House, Gym)"
                    aria-label="Custom address label"
                    className="w-full rounded-xl border border-stone-300 bg-white px-3 py-2 text-sm"
                  />
                )}

                <input
                  type="text"
                  required
                  value={addrBuilding}
                  onChange={(e) => setAddrBuilding(e.target.value)}
                  placeholder="Flat / Door No., Floor, Building Name"
                  aria-label="Flat, floor, and building name"
                  className="w-full rounded-xl border border-stone-300 bg-white px-3 py-2 text-sm"
                />

                <input
                  type="text"
                  value={addrLandmark}
                  onChange={(e) => setAddrLandmark(e.target.value)}
                  placeholder="Nearby landmark or gate instructions (optional)"
                  aria-label="Nearby landmark"
                  className="w-full rounded-xl border border-stone-300 bg-white px-3 py-2 text-sm"
                />

                <div className="flex justify-end gap-2">
                  <button
                    type="button"
                    onClick={() => setAddingAddress(false)}
                    className="rounded-xl border border-stone-300 bg-white px-3.5 py-2 text-xs font-semibold text-stone-700 hover:bg-stone-100"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    className="rounded-xl bg-[#1B5E3A] px-4 py-2 text-xs font-bold text-white hover:bg-green-800"
                  >
                    Save address
                  </button>
                </div>
              </form>
            )}

            {savedAddresses.length === 0 ? (
              <p className="rounded-xl border border-dashed border-stone-300 p-4 text-center text-xs text-stone-600">
                No saved addresses yet. Save your Home or Work details for 1-tap delivery spot switching.
              </p>
            ) : (
              <ul className="space-y-2.5">
                {savedAddresses.map((addr) => {
                  const isActive =
                    Math.abs(addr.lat - location.lat) < 0.0005 &&
                    Math.abs(addr.lng - location.lng) < 0.0005;
                  return (
                    <li
                      key={addr.id}
                      className={`flex flex-col justify-between gap-3 rounded-xl border p-3.5 sm:flex-row sm:items-center ${
                        isActive
                          ? "border-[#1B5E3A] bg-green-50/50"
                          : "border-stone-200 bg-white"
                      }`}
                    >
                      <div className="min-w-0 space-y-0.5">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="rounded-md bg-stone-900 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-white">
                            {addr.label}
                          </span>
                          <span className="truncate text-xs font-semibold text-stone-600">
                            {addr.areaLabel}
                          </span>
                          {isActive && (
                            <span className="rounded-full bg-[#1B5E3A]/15 px-2 py-0.5 text-[10px] font-bold text-[#1B5E3A]">
                              Active
                            </span>
                          )}
                        </div>
                        <p className="text-sm font-bold text-stone-900">{addr.building}</p>
                        {addr.landmark && (
                          <p className="text-xs text-stone-600">Landmark: {addr.landmark}</p>
                        )}
                      </div>
                      <div className="flex shrink-0 items-center gap-2">
                        {!isActive && (
                          <button
                            type="button"
                            onClick={() => {
                              setLocation({
                                lat: addr.lat,
                                lng: addr.lng,
                                label: `${addr.label} · ${addr.areaLabel}`,
                              });
                              toast.success(`Delivering to ${addr.label}`);
                            }}
                            className="rounded-lg border border-[#1B5E3A] px-2.5 py-1.5 text-xs font-bold text-[#1B5E3A] hover:bg-green-50"
                          >
                            Deliver here
                          </button>
                        )}
                        <button
                          type="button"
                          onClick={() => {
                            removeAddress(addr.id);
                            toast.success("Address removed");
                          }}
                          aria-label={`Remove ${addr.label} address`}
                          className="rounded-lg border border-stone-300 px-2.5 py-1.5 text-xs font-medium text-stone-600 hover:bg-stone-100"
                        >
                          Remove
                        </button>
                      </div>
                    </li>
                  );
                })}
              </ul>
            )}
          </section>

          {/* SECTION 4: Recent Orders & Activity Snapshot */}
          <section className="card space-y-4 p-5" aria-labelledby="sec-orders">
            <div className="flex flex-wrap items-center justify-between gap-2 border-b border-stone-100 pb-3">
              <div>
                <h2 id="sec-orders" className="text-base font-bold text-stone-900">
                  Recent Orders &amp; Activity
                </h2>
                <p className="text-xs text-stone-600">
                  Quick snapshot of your latest orders and inbox alerts.
                </p>
              </div>
              <div className="flex items-center gap-2">
                <Link
                  href="/notifications"
                  className="inline-flex items-center gap-1.5 rounded-xl border border-stone-300 bg-white px-3 py-1.5 text-xs font-semibold text-stone-800 hover:bg-stone-100"
                >
                  <span>Notifications</span>
                  {unreadNotifs > 0 && (
                    <span className="rounded-full bg-[#1B5E3A] px-1.5 py-0.2 text-[10px] font-bold text-white">
                      {unreadNotifs}
                    </span>
                  )}
                </Link>
                <Link
                  href="/orders"
                  className="rounded-xl bg-stone-900 px-3 py-1.5 text-xs font-bold text-white hover:bg-stone-800"
                >
                  All orders &rarr;
                </Link>
              </div>
            </div>

            {recentOrders === null ? (
              <p className="py-3 text-xs text-stone-500">Loading recent orders...</p>
            ) : recentOrders.length === 0 ? (
              <div className="rounded-xl border border-dashed border-stone-300 p-4 text-center">
                <p className="text-xs text-stone-600">You have not placed any orders yet.</p>
                <Link href="/" className="mt-2 inline-block text-xs font-bold text-[#1B5E3A] underline">
                  Browse Pure Veg &amp; Jain kitchens
                </Link>
              </div>
            ) : (
              <ul className="space-y-2.5">
                {recentOrders.map((o) => (
                  <li key={o.id}>
                    <Link
                      href={`/orders/${encodeURIComponent(o.id)}`}
                      className="flex items-center justify-between gap-3 rounded-xl border border-stone-200 bg-stone-50/70 p-3.5 transition hover:border-[#1B5E3A]/40 hover:bg-white"
                    >
                      <div className="min-w-0">
                        <p className="truncate text-sm font-bold text-stone-900">
                          {o.restaurantName ?? "Veggo Order"}{" "}
                          <span className="font-mono text-xs font-normal text-stone-500">
                            #{o.orderNumber ?? o.id.slice(0, 8)}
                          </span>
                        </p>
                        {o.createdAt && (
                          <p className="text-xs text-stone-500">
                            {new Date(o.createdAt).toLocaleString("en-IN")}
                          </p>
                        )}
                      </div>
                      <div className="flex shrink-0 items-center gap-2.5">
                        <StatusPill status={o.status} />
                        <span className="text-sm font-bold text-stone-900">
                          {formatPaise(o.totalPaise)}
                        </span>
                      </div>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </div>

        {/* Right Column: Section 2 (Dietary & Allergens) + Section 5 (Consents, Partner Enrolment & Danger Zone) */}
        <div className="space-y-6 lg:col-span-5 min-w-0">
          {/* SECTION 2: Dietary Guardrail & Personal Allergen Watchlist */}
          <section className="card space-y-4 p-5" aria-labelledby="sec-diet">
            <div className="border-b border-stone-100 pb-3">
              <h2 id="sec-diet" className="text-base font-bold text-stone-900">
                Dietary Guardrail &amp; Allergen Watchlist
              </h2>
              <p className="text-xs text-stone-600">
                Synced with the storefront catalog and restaurant menus to flag ingredients you avoid.
              </p>
            </div>

            <div>
              <p className="text-xs font-bold uppercase tracking-wider text-stone-600">
                Default Catalog Diet Mode
              </p>
              <div className="mt-2 grid grid-cols-2 gap-2" role="group" aria-label="Default diet preference">
                {DIET_OPTIONS.map((opt) => {
                  const active = diet === opt.value;
                  return (
                    <button
                      key={opt.value}
                      type="button"
                      aria-pressed={active}
                      onClick={() => {
                        setDiet(opt.value);
                        toast.success(`Default diet set to ${opt.label}`);
                      }}
                      className={`rounded-xl border px-3 py-2.5 text-left text-xs font-bold transition ${
                        active
                          ? "border-[#1B5E3A] bg-[#1B5E3A] text-white shadow-sm"
                          : "border-stone-300 bg-white text-stone-800 hover:bg-stone-50"
                      }`}
                    >
                      <span className="block">{opt.label}</span>
                      <span
                        className={`mt-0.5 block text-[11px] font-normal ${
                          active ? "text-green-100" : "text-stone-500"
                        }`}
                      >
                        {opt.value === "PURE_VEG"
                          ? "100% vegetarian only"
                          : opt.value === "VEGAN"
                            ? "Plant-based, no dairy/ghee"
                            : opt.value === "JAIN"
                              ? "No root vegetables"
                              : "Show all kitchens"}
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>

            <div className="border-t border-stone-100 pt-3">
              <div className="flex items-center justify-between gap-2">
                <div>
                  <p className="text-xs font-bold uppercase tracking-wider text-stone-600">
                    Personal Allergen Watchlist ({allergenWatchlist.length})
                  </p>
                  <p className="text-xs text-stone-500">
                    Dishes containing selected items will show an amber alert on menus.
                  </p>
                </div>
                {allergenWatchlist.length > 0 && (
                  <button
                    type="button"
                    onClick={() => {
                      clearAllergens();
                      toast.success("Allergen watchlist cleared");
                    }}
                    className="text-xs font-semibold text-stone-600 underline hover:text-stone-900"
                  >
                    Clear all
                  </button>
                )}
              </div>

              <div className="mt-2.5 space-y-2">
                {ALLERGEN_CATALOG.map((item) => {
                  const selected = allergenWatchlist.includes(item.key);
                  return (
                    <button
                      key={item.key}
                      type="button"
                      aria-pressed={selected}
                      onClick={() => toggleAllergen(item.key)}
                      className={`flex w-full items-center justify-between gap-3 rounded-xl border px-3.5 py-2.5 text-left transition ${
                        selected
                          ? "border-amber-400 bg-amber-50/90 text-amber-950"
                          : "border-stone-200 bg-white text-stone-800 hover:bg-stone-50"
                      }`}
                    >
                      <div className="min-w-0">
                        <p className="text-xs font-bold">{item.label}</p>
                        <p className="truncate text-[11px] text-stone-600">{item.hint}</p>
                      </div>
                      <span
                        className={`shrink-0 rounded-full px-2.5 py-0.5 text-[11px] font-bold ${
                          selected
                            ? "bg-amber-800 text-white"
                            : "bg-stone-100 text-stone-600"
                        }`}
                      >
                        {selected ? "Watching" : "Off"}
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>
          </section>

          {/* SECTION 5A: Communication & DPDP Privacy Consents */}
          <section className="card space-y-4 p-5" aria-labelledby="sec-consents">
            <div className="border-b border-stone-100 pb-3">
              <h2 id="sec-consents" className="text-base font-bold text-stone-900">
                Communication &amp; DPDP Consents
              </h2>
              <p className="text-xs text-stone-600">
                Recorded with timestamped consent audit logs under the Digital Personal Data Protection Act.
              </p>
            </div>

            <div className="space-y-2.5">
              {CONSENT_CATALOG.map((c) => {
                const enabled = consents[c.purpose];
                const isSaving = savingConsent === c.purpose;
                return (
                  <div
                    key={c.purpose}
                    className="flex items-start justify-between gap-3 rounded-xl border border-stone-200 bg-stone-50/60 p-3.5"
                  >
                    <div className="min-w-0">
                      <p className="text-xs font-bold text-stone-900">{c.title}</p>
                      <p className="mt-0.5 text-xs text-stone-600">{c.description}</p>
                    </div>
                    <button
                      type="button"
                      role="switch"
                      aria-checked={enabled}
                      aria-label={c.title}
                      disabled={isSaving}
                      onClick={() => handleToggleConsent(c.purpose, c.version)}
                      className={`shrink-0 rounded-full px-3 py-1 text-xs font-bold transition disabled:opacity-50 ${
                        enabled
                          ? "bg-[#1B5E3A] text-white"
                          : "border border-stone-300 bg-white text-stone-700 hover:bg-stone-100"
                      }`}
                    >
                      {isSaving ? "..." : enabled ? "Enabled" : "Off"}
                    </button>
                  </div>
                );
              })}
            </div>
          </section>

          {/* SECTION 5B: Delivery Partner Self-Enrolment */}
          {deliveryModuleOn && !isPartner && (
            <section className="card space-y-2.5 border border-[#1B5E3A]/25 bg-[#FBF6EA] p-5" aria-labelledby="sec-partner">
              <h2 id="sec-partner" className="text-sm font-bold text-stone-900">
                Deliver with Veggo Eats
              </h2>
              <p className="text-xs text-stone-600">
                Have a two-wheeler or EV in Bengaluru? Enroll your account as a verified delivery partner to accept nearby Pure Veg orders.
              </p>
              <button
                type="button"
                disabled={enrollingPartner || !me.phone}
                onClick={handleBecomePartner}
                className="w-full rounded-xl bg-[#1B5E3A] px-4 py-2.5 text-xs font-bold text-white hover:bg-green-800 disabled:opacity-60"
              >
                {enrollingPartner
                  ? "Enrolling..."
                  : me.phone
                    ? "Activate Delivery Partner role"
                    : "Verify a mobile number first to enroll"}
              </button>
            </section>
          )}

          {/* SECTION 5C: Danger Zone (DPDP Right to Erasure) */}
          <section className="rounded-2xl border-2 border-red-200 bg-red-50 p-5" aria-labelledby="danger-h">
            <h2 id="danger-h" className="text-sm font-bold text-red-900">
              Delete account (DPDP Right to Erasure)
            </h2>
            <p className="mt-1 text-xs text-red-900">
              Permanently delete your account, scrub encrypted personal data, and revoke all active sessions. This cannot be undone.
            </p>
            {deleteError && (
              <p role="alert" className="mt-2 text-xs font-semibold text-red-900">
                {deleteError}
              </p>
            )}
            <button
              type="button"
              onClick={() => setConfirmingDelete(true)}
              className="mt-3 w-full rounded-xl bg-red-700 px-4 py-2.5 text-xs font-bold text-white hover:bg-red-800"
            >
              Delete my account
            </button>
          </section>
        </div>
      </div>

      <ConfirmDialog
        open={confirmingDelete}
        title="Delete your account?"
        confirmLabel="Delete permanently"
        destructive
        busy={deleting}
        onConfirm={deleteAccount}
        onCancel={() => setConfirmingDelete(false)}
      >
        This will permanently delete your account and associated personal data, and you will be signed out. This action cannot
        be undone.
      </ConfirmDialog>
    </div>
  );
}
