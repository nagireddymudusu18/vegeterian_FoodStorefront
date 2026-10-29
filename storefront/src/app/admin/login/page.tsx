"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { identity } from "@/lib/api";
import { rolesFromAccessToken, safeAdminNext, useAuth, validateEmail } from "@/features/auth";
import { getTokens } from "@/lib/tokens";
import { ErrorBox } from "@/components/ui";

const INPUT = "w-full rounded-xl border border-stone-300 bg-white px-3 py-2.5 focus:border-green-600";
const BUTTON =
  "w-full rounded-xl bg-stone-900 px-4 py-3 font-semibold text-white shadow-sm transition hover:bg-stone-800 disabled:opacity-60";

export default function AdminLoginPage() {
  const router = useRouter();
  const { reload } = useAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [code, setCode] = useState("");
  const [challengeId, setChallengeId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<unknown>(null);

  // Already signed in as an admin: go straight to the console.
  useEffect(() => {
    if (rolesFromAccessToken(getTokens()?.accessToken).includes("ADMIN")) {
      router.replace(safeAdminNext(new URLSearchParams(window.location.search).get("next")));
    }
  }, [router]);

  const finish = async () => {
    await reload();
    router.replace(safeAdminNext(new URLSearchParams(window.location.search).get("next")));
  };

  const submitPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!validateEmail(email)) return setError(new Error("Enter a valid email address."));
    if (!password) return setError(new Error("Enter your password."));
    setBusy(true);
    setError(null);
    try {
      const r = await identity.adminLogin(email, password);
      if (r.challengeId) {
        setChallengeId(r.challengeId);
        setBusy(false);
        return;
      }
      await finish();
    } catch (err) {
      setError(err);
      setBusy(false);
    }
  };

  const submitCode = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!challengeId) return;
    if (!/^\d{6}$/.test(code.trim())) return setError(new Error("Enter the 6-digit code from your email."));
    setBusy(true);
    setError(null);
    try {
      await identity.adminVerifyCode(challengeId, code);
      await finish();
    } catch (err) {
      setError(err);
      setBusy(false);
    }
  };

  return (
    <main className="mx-auto flex min-h-screen max-w-md flex-col justify-center space-y-5 px-4 py-10">
      <div className="text-center">
        <h1 className="text-2xl font-bold">Veggo Eats Admin</h1>
        <p className="mt-1 text-sm text-stone-600">Administrators sign in with email and password only.</p>
      </div>

      <div className="rounded-2xl bg-white p-5 shadow-sm ring-1 ring-stone-200">
        {challengeId ? (
          <form onSubmit={submitCode} className="space-y-4" noValidate>
            <p className="text-sm text-stone-700">
              We emailed a 6-digit code to <span className="font-semibold">{email.trim()}</span>. It works once and expires in 10 minutes.
            </p>
            <div>
              <label htmlFor="admin-code" className="mb-1 block text-sm font-medium">
                Code
              </label>
              <input
                id="admin-code"
                inputMode="numeric"
                autoComplete="one-time-code"
                maxLength={6}
                value={code}
                onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))}
                className={`${INPUT} tracking-widest`}
              />
            </div>
            {error !== null && <ErrorBox error={error} />}
            <button type="submit" disabled={busy} className={BUTTON}>
              {busy ? "Please wait..." : "Verify and sign in"}
            </button>
            <button
              type="button"
              onClick={() => {
                setChallengeId(null);
                setCode("");
                setError(null);
              }}
              className="w-full text-center text-sm font-semibold text-green-800 underline"
            >
              Start again
            </button>
          </form>
        ) : (
          <form onSubmit={submitPassword} className="space-y-4" noValidate>
            <div>
              <label htmlFor="admin-email" className="mb-1 block text-sm font-medium">
                Email
              </label>
              <input id="admin-email" type="email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} className={INPUT} />
            </div>
            <div>
              <label htmlFor="admin-password" className="mb-1 block text-sm font-medium">
                Password
              </label>
              <input
                id="admin-password"
                type="password"
                autoComplete="current-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className={INPUT}
              />
            </div>
            {error !== null && <ErrorBox error={error} />}
            <button type="submit" disabled={busy} className={BUTTON}>
              {busy ? "Please wait..." : "Sign in"}
            </button>
            <p className="text-center text-sm">
              <Link href="/forgot-password" className="font-medium text-green-800 underline">
                Forgot password?
              </Link>
            </p>
          </form>
        )}
      </div>
      <p className="text-center text-sm text-stone-600">
        <Link href="/" className="font-medium text-green-800 underline">
          Back to the store
        </Link>
      </p>
    </main>
  );
}
