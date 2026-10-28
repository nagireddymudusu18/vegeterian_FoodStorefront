"use client";

import Link from "next/link";
import { useState } from "react";
import { identity } from "@/lib/api";
import { validateEmail } from "@/features/auth";
import { ErrorBox } from "@/components/ui";

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState("");
  const [sent, setSent] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<unknown>(null);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!validateEmail(email)) return setError(new Error("Enter a valid email address."));
    setBusy(true);
    setError(null);
    try {
      await identity.forgotPassword(email);
      setSent(true);
    } catch (err) {
      setError(err);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="mx-auto max-w-md space-y-5">
      <h1 className="text-center text-2xl font-bold">Forgot your password?</h1>
      <div className="rounded-2xl bg-white p-5 shadow-sm ring-1 ring-stone-200">
        {sent ? (
          <p role="status" className="text-stone-700">
            If an account exists for <span className="font-semibold">{email.trim()}</span>, we have sent a link to reset the
            password. It is valid for 30 minutes.
          </p>
        ) : (
          <form onSubmit={submit} className="space-y-4" noValidate>
            <p className="text-sm text-stone-600">Enter your email and we will send you a reset link.</p>
            <div>
              <label htmlFor="fp-email" className="mb-1 block text-sm font-medium">
                Email
              </label>
              <input
                id="fp-email"
                type="email"
                autoComplete="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="w-full rounded-xl border border-stone-300 bg-white px-3 py-2.5 focus:border-green-600"
              />
            </div>
            {error !== null && <ErrorBox error={error} />}
            <button
              type="submit"
              disabled={busy}
              className="w-full rounded-xl bg-gradient-to-r from-green-600 to-emerald-600 px-4 py-3 font-semibold text-white shadow-sm disabled:opacity-60"
            >
              {busy ? "Sending..." : "Send reset link"}
            </button>
          </form>
        )}
      </div>
      <p className="text-center text-sm">
        <Link href="/login" className="font-medium text-green-800 underline">
          Back to sign in
        </Link>
      </p>
    </div>
  );
}
