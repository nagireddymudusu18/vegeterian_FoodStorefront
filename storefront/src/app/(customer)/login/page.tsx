"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import Link from "next/link";
import { ApiError, identity } from "@/lib/api";
import { OtpLogin, passwordProblem, safeInternalPath, useAuth, validateEmail } from "@/features/auth";
import { ButtonSpinner, ErrorBox, PasswordStrengthMeter } from "@/components/ui";
import { useFlag } from "@/features/flags";

type Mode = "otp" | "password" | "register";

const TABS: { id: Mode; label: string }[] = [
  { id: "otp", label: "Phone OTP" },
  { id: "password", label: "Email" },
  { id: "register", label: "Create account" },
];

const INPUT_BASE =
  "w-full rounded-xl border bg-white px-3 py-2.5 text-sm transition-colors focus:border-green-600 focus:outline-none";
const BUTTON = "btn-primary w-full";

function safeNext(): string {
  return safeInternalPath(new URLSearchParams(window.location.search).get("next"));
}

function EmailForm({ register, onDone }: { register: boolean; onDone: () => void }) {
  const { reload } = useAuth();
  const [name, setName] = useState("");
  const [nameTouched, setNameTouched] = useState(false);
  const [email, setEmail] = useState("");
  const [emailTouched, setEmailTouched] = useState(false);
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [consent, setConsent] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<unknown>(null);
  const [sentTo, setSentTo] = useState<string | null>(null);
  const [unverified, setUnverified] = useState(false);
  const [resent, setResent] = useState(false);

  const emailValid = validateEmail(email);
  const showEmailError = emailTouched && email.trim().length > 0 && !emailValid;
  const showNameError = register && nameTouched && name.trim().length > 0 && name.trim().length < 2;

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
    setNameTouched(true);
    setEmailTouched(true);
    if (register && name.trim().length < 2) return setError(new Error("Enter your name (at least 2 characters)."));
    if (!emailValid) return setError(new Error("Enter a valid email address."));
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
        await identity.register(name.trim(), email.trim(), password);
        setSentTo(email.trim());
        setBusy(false);
        return;
      }
      await identity.loginWithPassword(email.trim(), password);
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
          <div className="mb-1 flex items-center justify-between">
            <label htmlFor="reg-name" className="text-sm font-medium text-stone-900">
              Your name
            </label>
            {name.trim().length >= 2 && (
              <span className="text-xs font-semibold text-green-800" aria-hidden="true">
                ✓ Valid
              </span>
            )}
          </div>
          <input
            id="reg-name"
            type="text"
            autoComplete="name"
            maxLength={80}
            placeholder="e.g. Priya Nair"
            value={name}
            onBlur={() => setNameTouched(true)}
            onChange={(e) => {
              setName(e.target.value);
              if (error) setError(null);
            }}
            aria-invalid={showNameError}
            className={`${INPUT_BASE} ${
              showNameError
                ? "border-red-400 bg-red-50/30"
                : name.trim().length >= 2
                  ? "border-green-600"
                  : "border-stone-300"
            }`}
          />
          {showNameError && (
            <p className="mt-1 text-xs font-medium text-red-700">Enter at least 2 characters.</p>
          )}
        </div>
      )}
      <div>
        <div className="mb-1 flex items-center justify-between">
          <label htmlFor="email" className="text-sm font-medium text-stone-900">
            Email
          </label>
          {emailValid && (
            <span className="text-xs font-semibold text-green-800" aria-hidden="true">
              ✓ Valid email
            </span>
          )}
        </div>
        <input
          id="email"
          type="email"
          autoComplete="email"
          placeholder="you@example.com"
          value={email}
          onBlur={() => setEmailTouched(true)}
          onChange={(e) => {
            setEmail(e.target.value);
            if (error) setError(null);
          }}
          aria-invalid={showEmailError}
          className={`${INPUT_BASE} ${
            showEmailError
              ? "border-red-400 bg-red-50/30"
              : emailValid
                ? "border-green-600"
                : "border-stone-300"
          }`}
        />
        {showEmailError && (
          <p className="mt-1 text-xs font-medium text-red-700">
            Enter a valid email address (e.g. name@domain.com).
          </p>
        )}
      </div>
      <div>
        <div className="mb-1 flex items-center justify-between">
          <label htmlFor="password" className="text-sm font-medium text-stone-900">
            Password
          </label>
          <button
            type="button"
            onClick={() => setShowPassword((v) => !v)}
            className="text-xs font-semibold text-green-800 hover:underline"
          >
            {showPassword ? "Hide password" : "Show password"}
          </button>
        </div>
        <input
          id="password"
          type={showPassword ? "text" : "password"}
          autoComplete={register ? "new-password" : "current-password"}
          value={password}
          onChange={(e) => {
            setPassword(e.target.value);
            if (error) setError(null);
          }}
          className={`${INPUT_BASE} border-stone-300`}
        />
        {register && <PasswordStrengthMeter password={password} />}
      </div>
      {register && (
        <label className="flex cursor-pointer items-start gap-2.5 rounded-xl border border-stone-200/80 bg-stone-50/60 p-3 text-xs text-stone-700 transition hover:bg-stone-100/70">
          <input
            type="checkbox"
            checked={consent}
            onChange={(e) => {
              setConsent(e.target.checked);
              if (error) setError(null);
            }}
            className="mt-0.5 h-4 w-4 rounded accent-green-700"
          />
          <span>
            I agree to the Terms of Service and consent to the processing of my details as described in the Privacy Policy.
          </span>
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
        {busy && <ButtonSpinner />}
        {busy ? (register ? "Creating account..." : "Signing in...") : register ? "Create account" : "Sign in"}
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
        <h1 className="page-title">Welcome to Veggo Eats</h1>
        <p className="mt-1 text-sm text-stone-600">Sign in or create an account to order. No password needed with OTP.</p>
      </div>

      <div className="rounded-2xl bg-white p-5 shadow-sm ring-1 ring-stone-200">
        <div
          role="tablist"
          aria-label="Sign in method"
          style={{ gridTemplateColumns: `repeat(${tabs.length}, minmax(0, 1fr))` }}
          className="mb-5 grid gap-1 rounded-xl bg-stone-100 p-1"
        >
          {tabs.map((t) => (
            <button
              key={t.id}
              role="tab"
              type="button"
              aria-selected={mode === t.id}
              onClick={() => setChosen(t.id)}
              className={`rounded-lg px-2 py-2 text-sm font-semibold transition-all ${
                mode === t.id ? "bg-white text-green-800 shadow-xs" : "text-stone-600 hover:text-stone-900"
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
