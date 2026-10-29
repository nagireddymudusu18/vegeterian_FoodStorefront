"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import Link from "next/link";
import { ApiError, identity } from "@/lib/api";
import { OtpLogin, passwordProblem, safeInternalPath, useAuth, validateEmail } from "@/features/auth";
import { ErrorBox } from "@/components/ui";
import { useFlag } from "@/features/flags";

type Mode = "otp" | "password" | "register";

const TABS: { id: Mode; label: string }[] = [
  { id: "otp", label: "Phone OTP" },
  { id: "password", label: "Email" },
  { id: "register", label: "Create account" },
];

const INPUT = "w-full rounded-xl border border-stone-300 bg-white px-3 py-2.5 focus:border-green-600";
const BUTTON =
  "w-full rounded-xl bg-gradient-to-r from-green-600 to-emerald-600 px-4 py-3 font-semibold text-white shadow-sm transition hover:from-green-700 hover:to-emerald-700 disabled:opacity-60";

function safeNext(): string {
  return safeInternalPath(new URLSearchParams(window.location.search).get("next"));
}

function EmailForm({ register, onDone }: { register: boolean; onDone: () => void }) {
  const { reload } = useAuth();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [consent, setConsent] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<unknown>(null);
  const [sentTo, setSentTo] = useState<string | null>(null);
  const [unverified, setUnverified] = useState(false);
  const [resent, setResent] = useState(false);

  const resend = async () => {
    setResent(false);
    try {
      await identity.resendVerification(email);
      setResent(true);
    } catch (err) {
      setError(err);
    }
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (register && name.trim().length < 2) return setError(new Error("Enter your name."));
    if (!validateEmail(email)) return setError(new Error("Enter a valid email address."));
    if (register) {
      const problem = passwordProblem(password);
      if (problem) return setError(new Error(problem));
      if (!consent) return setError(new Error("Please accept the Terms and Privacy Policy to continue."));
    } else if (!password) {
      return setError(new Error("Enter your password."));
    }
    setBusy(true);
    setError(null);
    setUnverified(false);
    try {
      if (register) {
        await identity.register(name, email, password);
        setSentTo(email.trim());
        setBusy(false);
        return;
      }
      await identity.loginWithPassword(email, password);
      await reload();
      onDone();
    } catch (err) {
      if (err instanceof ApiError && err.status === 403) setUnverified(true);
      setError(err);
      setBusy(false);
    }
  };

  if (sentTo) {
    return (
      <div className="space-y-3 text-center" role="status">
        <p className="text-4xl" aria-hidden>
          ✉️
        </p>
        <h2 className="text-lg font-bold">Check your email</h2>
        <p className="text-sm text-stone-700">
          We sent a verification link to <span className="font-semibold">{sentTo}</span>. Open it to finish creating your account.
        </p>
        <button type="button" onClick={resend} className="text-sm font-semibold text-green-800 underline">
          Send the link again
        </button>
        {resent && <p className="text-sm text-green-800">If that address needs verifying, a new link is on its way.</p>}
      </div>
    );
  }

  return (
    <form onSubmit={submit} className="space-y-4" noValidate>
      {register && (
        <div>
          <label htmlFor="reg-name" className="mb-1 block text-sm font-medium">
            Your name
          </label>
          <input id="reg-name" type="text" autoComplete="name" maxLength={80} value={name} onChange={(e) => setName(e.target.value)} className={INPUT} />
        </div>
      )}
      <div>
        <label htmlFor="email" className="mb-1 block text-sm font-medium">
          Email
        </label>
        <input id="email" type="email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} className={INPUT} />
      </div>
      <div>
        <label htmlFor="password" className="mb-1 block text-sm font-medium">
          Password
        </label>
        <input
          id="password"
          type="password"
          autoComplete={register ? "new-password" : "current-password"}
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          className={INPUT}
        />
        {register && <p className="mt-1 text-xs text-stone-600">At least 8 characters, with a letter and a number.</p>}
      </div>
      {register && (
        <label className="flex items-start gap-2 text-sm">
          <input type="checkbox" checked={consent} onChange={(e) => setConsent(e.target.checked)} className="mt-1 h-4 w-4" />
          <span>I agree to the Terms of Service and consent to the processing of my details as described in the Privacy Policy.</span>
        </label>
      )}
      {error !== null && <ErrorBox error={error} />}
      {unverified && (
        <button type="button" onClick={resend} className="text-sm font-semibold text-green-800 underline">
          Resend the verification email
        </button>
      )}
      {resent && <p className="text-sm text-green-800">If that address needs verifying, a new link is on its way.</p>}
      <button type="submit" disabled={busy} className={BUTTON}>
        {busy ? "Please wait..." : register ? "Create account" : "Sign in"}
      </button>
      {!register && (
        <p className="text-center text-sm">
          <Link href="/forgot-password" className="font-medium text-green-800 underline">
            Forgot password?
          </Link>
        </p>
      )}
    </form>
  );
}

export default function LoginPage() {
  const router = useRouter();
  const { status } = useAuth();
  const [chosen, setChosen] = useState<Mode>("otp");
  const otpOn = useFlag("otp_login");
  const registerOn = useFlag("email_registration");
  const tabs = TABS.filter((t) => (t.id === "otp" ? otpOn : t.id === "register" ? registerOn : true));
  const mode = tabs.some((t) => t.id === chosen) ? chosen : tabs[0].id;

  useEffect(() => {
    if (status === "authed") router.replace(safeNext());
  }, [status, router]);

  const done = () => router.replace(safeNext());

  return (
    <div className="mx-auto max-w-md space-y-5">
      <div className="text-center">
        <h1 className="text-2xl font-bold">Welcome to Veggo Eats</h1>
        <p className="mt-1 text-sm text-stone-600">Sign in or create an account to order. No password needed with OTP.</p>
      </div>

      <div className="rounded-2xl bg-white p-5 shadow-sm ring-1 ring-stone-200">
        <div role="tablist" aria-label="Sign in method" style={{ gridTemplateColumns: `repeat(${tabs.length}, minmax(0, 1fr))` }}
          className="mb-5 grid gap-1 rounded-xl bg-stone-100 p-1"
        >
          {tabs.map((t) => (
            <button
              key={t.id}
              role="tab"
              type="button"
              aria-selected={mode === t.id}
              onClick={() => setChosen(t.id)}
              className={`rounded-lg px-2 py-2 text-sm font-semibold transition-colors ${
                mode === t.id ? "bg-white text-green-800 shadow" : "text-stone-600 hover:text-stone-900"
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>
        {mode === "otp" && <OtpLogin askName submitLabel="Verify and sign in" onDone={done} />}
        {mode === "password" && <EmailForm key="login" register={false} onDone={done} />}
        {mode === "register" && <EmailForm key="register" register onDone={done} />}
      </div>
    </div>
  );
}
