"use client";

import Link from "next/link";
import { useState } from "react";
import { identity } from "@/lib/api";
import { passwordProblem } from "@/features/auth";
import { ErrorBox } from "@/components/ui";

export default function ResetPasswordPage() {
  const [password, setPassword] = useState("");
  const [done, setDone] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<unknown>(null);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    const token = new URLSearchParams(window.location.search).get("token");
    if (!token) return setError(new Error("This link is incomplete. Please use the link from your email."));
    const problem = passwordProblem(password);
    if (problem) return setError(new Error(problem));
    setBusy(true);
    setError(null);
    try {
      await identity.resetPassword(token, password);
      setDone(true);
    } catch (err) {
      setError(err);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="mx-auto max-w-md space-y-5">
      <h1 className="text-center text-2xl font-bold">Choose a new password</h1>
      <div className="rounded-2xl bg-white p-5 shadow-sm ring-1 ring-stone-200">
        {done ? (
          <div role="status" className="space-y-3 text-center">
            <p className="text-stone-700">Your password has been changed. You have been signed out everywhere.</p>
            <Link href="/login" className="inline-block rounded-xl bg-green-700 px-5 py-3 font-semibold text-white hover:bg-green-800">
              Sign in
            </Link>
          </div>
        ) : (
          <form onSubmit={submit} className="space-y-4" noValidate>
            <div>
              <label htmlFor="rp-password" className="mb-1 block text-sm font-medium">
                New password
              </label>
              <input
                id="rp-password"
                type="password"
                autoComplete="new-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full rounded-xl border border-stone-300 bg-white px-3 py-2.5 focus:border-green-600"
              />
              <p className="mt-1 text-xs text-stone-600">At least 8 characters, with a letter and a number.</p>
            </div>
            {error !== null && <ErrorBox error={error} />}
            <button
              type="submit"
              disabled={busy}
              className="w-full rounded-xl bg-gradient-to-r from-green-600 to-emerald-600 px-4 py-3 font-semibold text-white shadow-sm disabled:opacity-60"
            >
              {busy ? "Saving..." : "Change password"}
            </button>
          </form>
        )}
      </div>
    </div>
  );
}
