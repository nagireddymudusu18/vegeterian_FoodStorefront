"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { errorMessage, identity } from "@/lib/api";
import { useCart } from "@/features/cart";
import { useRequireAuth, passwordProblem, validateEmail, normalizePhone } from "@/features/auth";
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
    <form onSubmit={submit} className="space-y-3 rounded-xl border border-stone-200 bg-white p-4" noValidate>
      <h2 className="font-bold">Add email and password</h2>
      <p className="text-sm text-stone-600">Optional. Lets you sign in without an OTP next time.</p>
      <input
        type="email"
        aria-label="Email"
        autoComplete="email"
        placeholder="Email"
        value={email}
        onChange={(e) => setEmail(e.target.value)}
        className="w-full rounded-xl border border-stone-300 px-3 py-2.5"
      />
      <input
        type="password"
        aria-label="New password"
        autoComplete="new-password"
        placeholder="Password (8+ characters, letter and number)"
        value={password}
        onChange={(e) => setPassword(e.target.value)}
        className="w-full rounded-xl border border-stone-300 px-3 py-2.5"
      />
      {error !== null && <ErrorBox error={error} />}
      <button type="submit" disabled={busy} className="w-full rounded-xl bg-green-700 px-4 py-2.5 font-semibold text-white hover:bg-green-800 disabled:opacity-60">
        {busy ? "Saving..." : "Save"}
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
      await onDone();
    } catch (err) {
      setError(err);
      setBusy(false);
    }
  };

  return (
    <form onSubmit={phone ? verify : request} className="space-y-3 rounded-xl border border-stone-200 bg-white p-4" noValidate>
      <h2 className="font-bold">Add a mobile number</h2>
      <p className="text-sm text-stone-600">Optional. Lets you sign in with an OTP and get delivery updates.</p>
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
          className="w-full rounded-xl border border-stone-300 px-3 py-2.5"
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
          className="w-full rounded-xl border border-stone-300 px-3 py-2.5"
        />
      )}
      {error !== null && <ErrorBox error={error} />}
      <button type="submit" disabled={busy} className="w-full rounded-xl bg-green-700 px-4 py-2.5 font-semibold text-white hover:bg-green-800 disabled:opacity-60">
        {busy ? "Please wait..." : phone ? "Verify" : "Send OTP"}
      </button>
    </form>
  );
}

export default function ProfilePage() {
  const router = useRouter();
  const [leaving, setLeaving] = useState(false);
  const { status, me, logout, reload } = useRequireAuth(leaving);
  const { clear } = useCart();
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (status !== "authed") return <Spinner label="Loading profile" />;

  const signOut = () => {
    setLeaving(true);
    logout();
    router.replace("/");
  };

  const deleteAccount = async () => {
    setBusy(true);
    setError(null);
    try {
      await identity.deleteMe();
      setLeaving(true);
      logout();
      clear();
      router.replace("/");
    } catch (e) {
      setConfirming(false);
      setError(errorMessage(e));
      setBusy(false);
    }
  };

  return (
    <div className="mx-auto max-w-md space-y-6">
      <h1 className="text-2xl font-bold">Your profile</h1>
      <section className="space-y-1 rounded-xl border border-stone-200 bg-white p-4">
        {me?.name && (
          <>
            <p className="text-sm text-stone-600">Name</p>
            <p className="text-lg font-semibold">{me.name}</p>
          </>
        )}
        {me?.phone && (
          <>
            <p className="pt-2 text-sm text-stone-600">Mobile number</p>
            <p className="text-lg font-semibold">{me.phone}</p>
          </>
        )}
        {me?.email && (
          <>
            <p className="pt-2 text-sm text-stone-600">Email</p>
            <p className="text-lg font-semibold">
              {me.email}
              {me.emailVerified === false && (
                <span className="ml-2 rounded-full bg-amber-100 px-2 py-0.5 align-middle text-xs font-semibold text-amber-900">
                  Not verified
                </span>
              )}
            </p>
          </>
        )}
      </section>

      {me && !me.hasPassword && <AddPassword onDone={reload} />}
      {me && !me.phone && <AddPhone onDone={reload} />}

      <button
        type="button"
        onClick={signOut}
        className="w-full rounded-xl border border-stone-300 px-4 py-3 font-medium hover:bg-stone-100"
      >
        Log out
      </button>

      <section className="rounded-xl border-2 border-red-200 bg-red-50 p-4" aria-labelledby="danger-h">
        <h2 id="danger-h" className="font-bold text-red-900">
          Delete account
        </h2>
        <p className="mt-1 text-sm text-red-900">
          Permanently delete your account and personal data. This cannot be undone.
        </p>
        {error && (
          <p role="alert" className="mt-2 text-sm font-medium text-red-900">
            {error}
          </p>
        )}
        <button
          type="button"
          onClick={() => setConfirming(true)}
          className="mt-3 w-full rounded-xl bg-red-700 px-4 py-3 font-semibold text-white hover:bg-red-800"
        >
          Delete my account
        </button>
      </section>

      <ConfirmDialog
        open={confirming}
        title="Delete your account?"
        confirmLabel="Delete permanently"
        destructive
        busy={busy}
        onConfirm={deleteAccount}
        onCancel={() => setConfirming(false)}
      >
        This will permanently delete your account and associated personal data, and you will be signed out. This action cannot
        be undone.
      </ConfirmDialog>
    </div>
  );
}
