"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { identity } from "@/lib/api";
import { validateEmail } from "@/features/auth";
import { ErrorBox } from "@/components/ui";

const INPUT = "w-full rounded-xl border border-stone-300 bg-white px-3 py-2.5 focus:border-green-600";
const BUTTON =
  "w-full rounded-xl bg-stone-900 px-4 py-3 font-semibold text-white shadow-sm transition hover:bg-stone-800 disabled:opacity-60";

/** Landing page for the invite link: the invitee confirms with the email and password of their account. */
export default function AcceptAdminInvitePage() {
  const [token, setToken] = useState<string | null | undefined>(undefined);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<unknown>(null);
  const [done, setDone] = useState(false);

  useEffect(() => {
    setToken(new URLSearchParams(window.location.search).get("token"));
  }, []);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!token) return;
    if (!validateEmail(email)) return setError(new Error("Enter the email address this invite was sent to."));
    if (!password) return setError(new Error("Enter your password."));
    setBusy(true);
    setError(null);
    try {
      await identity.acceptAdminInvite(token, email, password);
      setDone(true);
    } catch (err) {
      setError(err);
    } finally {
      setBusy(false);
    }
  };

  return (
    <main className="mx-auto flex min-h-screen max-w-md flex-col justify-center space-y-5 px-4 py-10">
      <div className="text-center">
        <h1 className="text-2xl font-bold">Accept admin invite</h1>
        <p className="mt-1 text-sm text-stone-600">Veggo Eats Admin</p>
      </div>
      <div className="rounded-2xl bg-white p-5 shadow-sm ring-1 ring-stone-200">
        {token === null ? (
          <p className="text-sm text-stone-700">This invite link is incomplete. Open the link from your invitation email.</p>
        ) : done ? (
          <div className="space-y-3 text-center" role="status">
            <p className="text-lg font-semibold">You are now an administrator.</p>
            <Link href="/admin/login" className="inline-block rounded-xl bg-stone-900 px-4 py-2.5 font-semibold text-white">
              Go to the admin sign-in
            </Link>
          </div>
        ) : (
          <form onSubmit={submit} className="space-y-4" noValidate>
            <p className="text-sm text-stone-700">
              Sign in with the account registered under the invited email address. Create and verify that account first on the{" "}
              <Link href="/login" className="font-semibold text-green-800 underline">
                sign-up page
              </Link>{" "}
              if you have not already.
            </p>
            <div>
              <label htmlFor="accept-email" className="mb-1 block text-sm font-medium">
                Email
              </label>
              <input id="accept-email" type="email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} className={INPUT} />
            </div>
            <div>
              <label htmlFor="accept-password" className="mb-1 block text-sm font-medium">
                Password
              </label>
              <input
                id="accept-password"
                type="password"
                autoComplete="current-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className={INPUT}
              />
            </div>
            {error !== null && <ErrorBox error={error} />}
            <button type="submit" disabled={busy || token === undefined} className={BUTTON}>
              {busy ? "Please wait..." : "Accept invite"}
            </button>
          </form>
        )}
      </div>
    </main>
  );
}
