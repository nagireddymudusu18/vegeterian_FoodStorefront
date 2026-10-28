"use client";

import { useState } from "react";
import { errorMessage, identity } from "@/lib/api";
import { ErrorBox } from "@/components/ui";
import { useAuth } from "./auth-context";
import { normalizePhone } from "./phone";

const INPUT = "w-full rounded-xl border border-stone-300 bg-white px-3 py-2.5 focus:border-green-600";
const BUTTON =
  "w-full rounded-xl bg-gradient-to-r from-green-600 to-emerald-600 px-4 py-3 font-semibold text-white shadow-sm transition hover:from-green-700 hover:to-emerald-700 disabled:opacity-60";

/**
 * Phone OTP sign-in. New numbers are registered on first use, so this doubles as guest checkout:
 * with `askName` it also collects a name, stored on the account.
 */
export function OtpLogin({
  askName = false,
  submitLabel = "Verify and continue",
  onDone,
}: {
  askName?: boolean;
  submitLabel?: string;
  onDone: () => void;
}) {
  const { reload } = useAuth();
  const [step, setStep] = useState<"details" | "code">("details");
  const [name, setName] = useState("");
  const [phoneInput, setPhoneInput] = useState("");
  const [phone, setPhone] = useState("");
  const [code, setCode] = useState("");
  const [consent, setConsent] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<unknown>(null);

  const requestOtp = async (e: React.FormEvent) => {
    e.preventDefault();
    const p = normalizePhone(phoneInput);
    if (askName && name.trim().length < 2) {
      setError(new Error("Enter your name."));
      return;
    }
    if (!p) {
      setError(new Error("Enter a valid 10-digit Indian mobile number."));
      return;
    }
    if (!consent) {
      setError(new Error("Please accept the Terms and Privacy Policy to continue."));
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await identity.requestOtp(p);
      setPhone(p);
      setStep("code");
    } catch (err) {
      setError(err);
    } finally {
      setBusy(false);
    }
  };

  const verify = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!/^\d{4,8}$/.test(code)) {
      setError(new Error("Enter the numeric code we sent you."));
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await identity.verifyOtp(phone, code, askName ? name : undefined);
      await reload();
      onDone();
    } catch (err) {
      setError(new Error(errorMessage(err)));
      setBusy(false);
    }
  };

  if (step === "code") {
    return (
      <form onSubmit={verify} className="space-y-4" noValidate>
        <p className="text-sm text-stone-700">
          We sent a code to <span className="font-semibold">{phone}</span>.
        </p>
        <div>
          <label htmlFor="otp-code" className="mb-1 block text-sm font-medium">
            One-time code
          </label>
          <input
            id="otp-code"
            type="text"
            inputMode="numeric"
            autoComplete="one-time-code"
            maxLength={8}
            value={code}
            onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))}
            className={`${INPUT} text-center text-xl tracking-widest`}
          />
        </div>
        {error !== null && <ErrorBox error={error} />}
        <button type="submit" disabled={busy} className={BUTTON}>
          {busy ? "Verifying..." : submitLabel}
        </button>
        <button
          type="button"
          onClick={() => {
            setStep("details");
            setCode("");
            setError(null);
          }}
          className="w-full text-sm text-stone-600 underline"
        >
          Use a different number
        </button>
      </form>
    );
  }

  return (
    <form onSubmit={requestOtp} className="space-y-4" noValidate>
      {askName && (
        <div>
          <label htmlFor="otp-name" className="mb-1 block text-sm font-medium">
            Your name
          </label>
          <input
            id="otp-name"
            type="text"
            autoComplete="name"
            maxLength={80}
            value={name}
            onChange={(e) => setName(e.target.value)}
            className={INPUT}
          />
        </div>
      )}
      <div>
        <label htmlFor="otp-phone" className="mb-1 block text-sm font-medium">
          Mobile number
        </label>
        <div className="flex">
          <span className="inline-flex items-center rounded-l-xl border border-r-0 border-stone-300 bg-stone-100 px-3 text-sm">
            +91
          </span>
          <input
            id="otp-phone"
            type="tel"
            inputMode="numeric"
            autoComplete="tel-national"
            value={phoneInput}
            onChange={(e) => setPhoneInput(e.target.value)}
            placeholder="98765 43210"
            className="w-full rounded-r-xl border border-stone-300 bg-white px-3 py-2.5 focus:border-green-600"
          />
        </div>
      </div>
      <label className="flex items-start gap-2 text-sm">
        <input type="checkbox" checked={consent} onChange={(e) => setConsent(e.target.checked)} className="mt-1 h-4 w-4" />
        <span>
          I agree to the Terms of Service and consent to the processing of my details as described in the Privacy Policy.
        </span>
      </label>
      {error !== null && <ErrorBox error={error} />}
      <button type="submit" disabled={busy} className={BUTTON}>
        {busy ? "Sending..." : "Send OTP"}
      </button>
    </form>
  );
}
