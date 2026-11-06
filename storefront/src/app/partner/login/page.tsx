"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { identity } from "@/lib/api";
import { OtpLogin, passwordProblem, safePartnerNext, useAuth, validateEmail } from "@/features/auth";
import { ErrorBox } from "@/components/ui";

type Mode = "otp" | "password" | "register";

const INPUT = "w-full rounded-xl border border-stone-300 bg-white px-3 py-2.5 focus:border-green-600";
const BUTTON = "btn-primary w-full";

function nextUrl(): string {
  if (typeof window === "undefined") return "/partner";
  return safePartnerNext(new URLSearchParams(window.location.search).get("next"));
}

export default function PartnerLoginPage() {
  const router = useRouter();
  const { status, me, reload } = useAuth();
  const [mode, setMode] = useState<Mode>("otp");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [consent, setConsent] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<unknown>(null);

  useEffect(() => {
    if (
      status === "authed" &&
      me &&
      (me.accountDomain === "DELIVERY_PARTNER" ||
        me.roles.includes("PARTNER") ||
        me.roles.includes("ADMIN"))
    ) {
      router.replace(nextUrl());
    }
  }, [status, me, router]);

  const finish = () => {
    router.replace(nextUrl());
  };

  const submitEmail = async (e: React.FormEvent) => {
    e.preventDefault();
    const isRegister = mode === "register";
    if (isRegister && name.trim().length < 2) {
      return setError(new Error("Enter your full name to register as a Delivery Partner."));
    }
    if (!validateEmail(email)) {
      return setError(new Error("Enter a valid delivery partner email address."));
    }
    if (isRegister) {
      const problem = passwordProblem(password);
      if (problem) return setError(new Error(problem));
      if (!consent) {
        return setError(new Error("Please accept the Delivery Partner Terms to continue."));
      }
    } else if (!password) {
      return setError(new Error("Enter your password."));
    }

    setBusy(true);
    setError(null);
    try {
      if (isRegister) {
        await identity.register(name, email, password, "DELIVERY_PARTNER");
        await identity.loginWithPassword(email, password, "DELIVERY_PARTNER");
        toast.success("Welcome to Veggo Eats Fleet! Your delivery partner account is ready.");
      } else {
        await identity.loginWithPassword(email, password, "DELIVERY_PARTNER");
      }
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
          Delivery Partner Portal
        </span>
        <h1 className="mt-2 text-2xl font-extrabold tracking-tight text-ink">Veggo Eats Fleet</h1>
        <p className="mt-1 text-sm text-stone-600">
          Sign in or register as a delivery partner to accept trips, verify customer handoffs, and track your earnings.
        </p>
      </div>

      <div className="card p-5">
        <div
          role="tablist"
          aria-label="Fleet authentication method"
          className="mb-5 grid grid-cols-3 gap-1 rounded-xl bg-stone-100 p-1"
        >
          <button
            role="tab"
            type="button"
            aria-selected={mode === "otp"}
            onClick={() => {
              setMode("otp");
              setError(null);
            }}
            className={`rounded-lg px-2.5 py-2 text-xs font-semibold transition-colors sm:text-sm ${
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
            className={`rounded-lg px-2.5 py-2 text-xs font-semibold transition-colors sm:text-sm ${
              mode === "password" ? "bg-white text-green-800 shadow" : "text-stone-600 hover:text-stone-900"
            }`}
          >
            Email Sign In
          </button>
          <button
            role="tab"
            type="button"
            aria-selected={mode === "register"}
            onClick={() => {
              setMode("register");
              setError(null);
            }}
            className={`rounded-lg px-2.5 py-2 text-xs font-semibold transition-colors sm:text-sm ${
              mode === "register" ? "bg-white text-green-800 shadow" : "text-stone-600 hover:text-stone-900"
            }`}
          >
            Rider Sign Up
          </button>
        </div>

        {mode === "otp" ? (
          <OtpLogin
            askName
            accountDomain="DELIVERY_PARTNER"
            submitLabel="Sign in to Delivery Portal"
            onDone={finish}
          />
        ) : (
          <form onSubmit={submitEmail} className="space-y-4" noValidate>
            {mode === "register" && (
              <div>
                <label htmlFor="rider-name" className="mb-1 block text-sm font-medium">
                  Full name
                </label>
                <input
                  id="rider-name"
                  type="text"
                  autoComplete="name"
                  maxLength={80}
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="e.g. Priya Nair"
                  className={INPUT}
                />
              </div>
            )}
            <div>
              <label htmlFor="rider-email" className="mb-1 block text-sm font-medium">
                Rider email
              </label>
              <input
                id="rider-email"
                type="email"
                autoComplete="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className={INPUT}
              />
            </div>
            <div>
              <label htmlFor="rider-password" className="mb-1 block text-sm font-medium">
                Password
              </label>
              <input
                id="rider-password"
                type="password"
                autoComplete={mode === "register" ? "new-password" : "current-password"}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className={INPUT}
              />
              {mode === "register" && (
                <p className="mt-1 text-xs text-stone-600">
                  At least 8 characters, with a letter and a number. Creates a dedicated delivery partner account.
                </p>
              )}
            </div>
            {mode === "register" && (
              <label className="flex items-start gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={consent}
                  onChange={(e) => setConsent(e.target.checked)}
                  className="mt-1 h-4 w-4"
                />
                <span>
                  I agree to the Delivery Partner Terms and Privacy Policy.
                </span>
              </label>
            )}
            {error !== null && <ErrorBox error={error} />}
            <button type="submit" disabled={busy} className={BUTTON}>
              {busy
                ? "Please wait..."
                : mode === "register"
                  ? "Create Delivery Partner Account"
                  : "Sign in to Delivery Portal"}
            </button>
          </form>
        )}
      </div>
    </main>
  );
}
