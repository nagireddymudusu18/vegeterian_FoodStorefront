"use client";

import Link from "next/link";
import { useEffect, useState, type FormEvent } from "react";
import { identity } from "@/lib/api";
import { useAuth } from "@/features/auth";
import { ErrorBox, Spinner } from "@/components/ui";

export default function VerifyEmailPage() {
  const { reload } = useAuth();
  const [token, setToken] = useState<string | null | undefined>(undefined);
  const [password, setPassword] = useState("");
  const [state, setState] = useState<"form" | "working" | "done">("form");
  const [error, setError] = useState<unknown>(null);

  useEffect(() => {
    setToken(new URLSearchParams(window.location.search).get("token"));
  }, []);

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (!token) return;
    setError(null);
    setState("working");
    try {
      await identity.verifyEmail(token, password);
      await reload();
      setState("done");
    } catch (err) {
      setError(err);
      setState("form");
    }
  }

  if (token === undefined) return <Spinner label="Loading" />;

  return (
    <div className="mx-auto max-w-md space-y-4 text-center">
      {state === "working" && <Spinner label="Verifying your email" />}
      {state === "done" && (
        <>
          <p className="text-4xl" aria-hidden>
            ✅
          </p>
          <h1 className="text-2xl font-bold">Email verified</h1>
          <p className="text-stone-700">Your account is ready and you are signed in.</p>
          <Link href="/" className="inline-block rounded-xl bg-green-700 px-5 py-3 font-semibold text-white hover:bg-green-800">
            Start ordering
          </Link>
        </>
      )}
      {state === "form" && !token && (
        <>
          <h1 className="text-2xl font-bold">We could not verify your email</h1>
          <p className="text-sm text-stone-700">
            This link is incomplete. Please use the link from your email, or{" "}
            <Link href="/login" className="font-semibold text-green-800 underline">
              sign in
            </Link>{" "}
            to request a new one.
          </p>
        </>
      )}
      {state === "form" && token && (
        <form onSubmit={submit} className="space-y-3 text-left">
          <h1 className="text-center text-2xl font-bold">Confirm your email</h1>
          <p className="text-sm text-stone-700">
            Enter the password you chose when you created the account. If you did not sign up, ignore the email
            and do not enter anything here.
          </p>
          <label className="block text-sm font-medium">
            Password
            <input
              type="password"
              autoComplete="current-password"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="mt-1 w-full rounded-xl border border-stone-300 px-3 py-2"
            />
          </label>
          {error !== null && <ErrorBox error={error} />}
          <button type="submit" className="w-full rounded-xl bg-green-700 px-5 py-3 font-semibold text-white hover:bg-green-800">
            Verify email
          </button>
          <p className="text-center text-xs text-stone-600">
            The link may also have expired or been used.{" "}
            <Link href="/login" className="font-semibold text-green-800 underline">
              Sign in
            </Link>{" "}
            to request a new one.
          </p>
        </form>
      )}
    </div>
  );
}
