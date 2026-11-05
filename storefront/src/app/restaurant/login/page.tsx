"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { identity } from "@/lib/api";
import { OtpLogin, safeRestaurantNext, useAuth, validateEmail } from "@/features/auth";
import { ErrorBox } from "@/components/ui";

type Mode = "otp" | "password";

const INPUT = "w-full rounded-xl border border-stone-300 bg-white px-3 py-2.5 focus:border-green-600";
const BUTTON = "btn-primary w-full";

function nextUrl(): string {
  if (typeof window === "undefined") return "/restaurant";
  return safeRestaurantNext(new URLSearchParams(window.location.search).get("next"));
}

export default function RestaurantLoginPage() {
  const router = useRouter();
  const { status, me, reload } = useAuth();
  const [mode, setMode] = useState<Mode>("otp");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<unknown>(null);

  useEffect(() => {
    if (status === "authed" && me && (me.roles.includes("RESTAURANT") || me.roles.includes("ADMIN"))) {
      router.replace(nextUrl());
    }
  }, [status, me, router]);

  const finish = () => {
    router.replace(nextUrl());
  };

  const submitPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!validateEmail(email)) return setError(new Error("Enter a valid kitchen partner email address."));
    if (!password) return setError(new Error("Enter your password."));
    setBusy(true);
    setError(null);
    try {
      await identity.loginWithPassword(email, password);
      await reload();
      finish();
    } catch (err) {
      setError(err);
      setBusy(false);
    }
  };

  return (
    <main className="mx-auto flex min-h-screen max-w-md flex-col justify-center space-y-5 px-4 py-10">
      <div className="text-center">
        <span className="inline-block rounded-md border border-green-800/20 bg-haldi px-2.5 py-1 text-xs font-bold uppercase tracking-wider text-green-900">
          Restaurant Partner Portal
        </span>
        <h1 className="mt-2 text-2xl font-extrabold tracking-tight text-ink">Veggo Eats Kitchen</h1>
        <p className="mt-1 text-sm text-stone-600">
          Sign in to manage live kitchen tickets, preparation status, and dish availability &amp; pricing.
        </p>
      </div>

      <div className="card p-5">
        <div
          role="tablist"
          aria-label="Kitchen sign in method"
          className="mb-5 grid grid-cols-2 gap-1 rounded-xl bg-stone-100 p-1"
        >
          <button
            role="tab"
            type="button"
            aria-selected={mode === "otp"}
            onClick={() => {
              setMode("otp");
              setError(null);
            }}
            className={`rounded-lg px-3 py-2 text-sm font-semibold transition-colors ${
              mode === "otp" ? "bg-white text-green-800 shadow" : "text-stone-600 hover:text-stone-900"
            }`}
          >
            Phone OTP
          </button>
          <button
            role="tab"
            type="button"
            aria-selected={mode === "password"}
            onClick={() => {
              setMode("password");
              setError(null);
            }}
            className={`rounded-lg px-3 py-2 text-sm font-semibold transition-colors ${
              mode === "password" ? "bg-white text-green-800 shadow" : "text-stone-600 hover:text-stone-900"
            }`}
          >
            Email &amp; Password
          </button>
        </div>

        {mode === "otp" ? (
          <OtpLogin submitLabel="Sign in to Kitchen Portal" onDone={finish} />
        ) : (
          <form onSubmit={submitPassword} className="space-y-4" noValidate>
            <div>
              <label htmlFor="kitchen-email" className="mb-1 block text-sm font-medium">
                Partner email
              </label>
              <input
                id="kitchen-email"
                type="email"
                autoComplete="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className={INPUT}
              />
            </div>
            <div>
              <label htmlFor="kitchen-password" className="mb-1 block text-sm font-medium">
                Password
              </label>
              <input
                id="kitchen-password"
                type="password"
                autoComplete="current-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className={INPUT}
              />
            </div>
            {error !== null && <ErrorBox error={error} />}
            <button type="submit" disabled={busy} className={BUTTON}>
              {busy ? "Signing in..." : "Sign in to Kitchen Portal"}
            </button>
          </form>
        )}
      </div>

      <p className="text-center text-sm text-stone-600">
        Looking to order food?{" "}
        <Link href="/" className="font-semibold text-green-800 underline">
          Go to Customer Storefront
        </Link>
      </p>
    </main>
  );
}
