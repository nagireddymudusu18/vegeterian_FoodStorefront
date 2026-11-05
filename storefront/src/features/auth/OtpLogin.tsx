"use client";

import { useState } from "react";
import { toast } from "sonner";
import { errorMessage, identity, type AccountDomain } from "@/lib/api";
import { ButtonSpinner, ErrorBox } from "@/components/ui";
import { validateIndianMobileInput } from "@/features/ux/form-validation";
import { useAuth } from "./auth-context";
import { normalizePhone } from "./phone";

const INPUT_BASE =
  "w-full rounded-xl border bg-white px-3 py-2.5 text-sm transition-colors focus:border-green-600 focus:outline-none";
const BUTTON = "btn-primary w-full";

/**
 * Phone OTP sign-in. New numbers are registered on first use within the target module domain (`accountDomain`),
 * keeping Customer, Restaurant Owner, and Delivery Partner accounts strictly isolated.
 */
export function OtpLogin({
  askName = false,
  submitLabel = "Verify and continue",
  accountDomain,
  onDone,
}: {
  askName?: boolean;
  submitLabel?: string;
  accountDomain?: AccountDomain;
  onDone: () => void;
}) {
  const { reload } = useAuth();
  const [step, setStep] = useState<"details" | "code">("details");
  const [name, setName] = useState("");
  const [nameTouched, setNameTouched] = useState(false);
  const [phoneInput, setPhoneInput] = useState("");
  const [phoneTouched, setPhoneTouched] = useState(false);
  const [phone, setPhone] = useState("");
  const [code, setCode] = useState("");
  const [consent, setConsent] = useState(false);
  const [busy, setBusy] = useState(false);
  const [resending, setResending] = useState(false);
  const [error, setError] = useState<unknown>(null);

  const mobileState = validateIndianMobileInput(phoneInput);
  const nameValid = !askName || name.trim().length >= 2;
  const showNameError = askName && nameTouched && !nameValid;
  const showPhoneError = phoneTouched && phoneInput.length > 0 && !mobileState.valid;

  const requestOtp = async (e: React.FormEvent) => {
    e.preventDefault();
    setNameTouched(true);
    setPhoneTouched(true);
    const p = normalizePhone(phoneInput);
    if (askName && name.trim().length < 2) {
      setError(new Error("Enter your name (at least 2 characters)."));
      return;
    }
    if (!p) {
      setError(new Error(mobileState.hint ?? "Enter a valid 10-digit Indian mobile number."));
      return;
    }
    if (!consent) {
      setError(new Error("Please accept the Terms and Privacy Policy to continue."));
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await identity.requestOtp(p, accountDomain);
      setPhone(p);
      setStep("code");
      toast.success(`Verification code sent to ${p}`);
    } catch (err) {
      setError(err);
    } finally {
      setBusy(false);
    }
  };

  const resendOtp = async () => {
    if (!phone || resending) return;
    setResending(true);
    setError(null);
    try {
      await identity.requestOtp(phone, accountDomain);
      toast.success("Sent a fresh OTP code");
    } catch (err) {
      setError(err);
    } finally {
      setResending(false);
    }
  };

  const verify = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!/^\d{4,8}$/.test(code)) {
      setError(new Error("Enter the 6-digit numeric code we sent you."));
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await identity.verifyOtp(phone, code, askName ? name.trim() : undefined, accountDomain);
      await reload();
      onDone();
    } catch (err) {
      setError(new Error(errorMessage(err)));
      setBusy(false);
    }
  };

  if (step === "code") {
    const codeReady = /^\d{4,8}$/.test(code);
    return (
      <form onSubmit={verify} className="space-y-4" noValidate>
        <div className="rounded-xl border border-green-200 bg-green-50/70 p-3 text-xs text-green-950">
          <div className="flex items-center justify-between gap-2">
            <span>
              Code sent to <strong className="font-mono">{phone}</strong>
            </span>
            <span className="rounded-full bg-green-700 px-2 py-0.5 text-[10px] font-bold text-white">
              Step 2 of 2
            </span>
          </div>
        </div>
        <div>
          <div className="mb-1 flex items-center justify-between">
            <label htmlFor="otp-code" className="text-sm font-medium text-stone-900">
              One-time code
            </label>
            <span className="font-mono text-xs text-stone-500">{code.length}/6 digits</span>
          </div>
          <input
            id="otp-code"
            type="text"
            inputMode="numeric"
            autoComplete="one-time-code"
            placeholder="••••••"
            maxLength={8}
            value={code}
            onChange={(e) => {
              setCode(e.target.value.replace(/\D/g, ""));
              if (error) setError(null);
            }}
            aria-invalid={error !== null}
            className={`${INPUT_BASE} text-center font-mono text-xl font-bold tracking-[0.35em] ${
              codeReady ? "border-green-600 bg-green-50/30" : "border-stone-300"
            }`}
          />
          <p className="mt-1 text-xs text-stone-500">
            Enter the 6-digit code sent via SMS (for testing, any 6-digit code such as <code className="font-mono font-bold text-stone-700">123456</code> works).
          </p>
        </div>
        {error !== null && <ErrorBox error={error} />}
        <button type="submit" disabled={busy} className={BUTTON}>
          {busy && <ButtonSpinner />}
          {busy ? "Verifying code..." : submitLabel}
        </button>
        <div className="flex items-center justify-between pt-1 text-xs">
          <button
            type="button"
            onClick={resendOtp}
            disabled={resending || busy}
            className="font-semibold text-green-800 underline disabled:opacity-50"
          >
            {resending ? "Sending new code..." : "Resend OTP"}
          </button>
          <button
            type="button"
            onClick={() => {
              setStep("details");
              setCode("");
              setError(null);
            }}
            className="text-stone-600 underline hover:text-stone-900"
          >
            Use a different number
          </button>
        </div>
      </form>
    );
  }

  return (
    <form onSubmit={requestOtp} className="space-y-4" noValidate>
      {askName && (
        <div>
          <div className="mb-1 flex items-center justify-between">
            <label htmlFor="otp-name" className="text-sm font-medium text-stone-900">
              Your name
            </label>
            {name.trim().length >= 2 && (
              <span className="text-xs font-semibold text-green-800" aria-hidden="true">
                ✓ Looks good
              </span>
            )}
          </div>
          <input
            id="otp-name"
            type="text"
            autoComplete="name"
            maxLength={80}
            placeholder="e.g. Aarav Sharma"
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
            <p className="mt-1 text-xs font-medium text-red-700">
              Please enter at least 2 characters for your name.
            </p>
          )}
        </div>
      )}
      <div>
        <div className="mb-1 flex items-center justify-between">
          <label htmlFor="otp-phone" className="text-sm font-medium text-stone-900">
            Mobile number
          </label>
          <span
            className={`font-mono text-xs ${
              mobileState.valid
                ? "font-bold text-green-800"
                : showPhoneError
                  ? "font-semibold text-red-700"
                  : "text-stone-500"
            }`}
          >
            {mobileState.valid ? "✓ 10/10 digits" : `${mobileState.digits.length}/10 digits`}
          </span>
        </div>
        <div className="flex">
          <span className="inline-flex items-center rounded-l-xl border border-r-0 border-stone-300 bg-stone-100 px-3 font-mono text-sm font-semibold text-stone-700">
            +91
          </span>
          <input
            id="otp-phone"
            type="tel"
            inputMode="numeric"
            autoComplete="tel-national"
            value={mobileState.formatted}
            onBlur={() => setPhoneTouched(true)}
            onChange={(e) => {
              const next = validateIndianMobileInput(e.target.value);
              setPhoneInput(next.formatted);
              if (error) setError(null);
            }}
            placeholder="98765 43210"
            aria-invalid={showPhoneError}
            className={`w-full rounded-r-xl border bg-white px-3 py-2.5 font-mono text-sm transition-colors focus:border-green-600 focus:outline-none ${
              showPhoneError
                ? "border-red-400 bg-red-50/30"
                : mobileState.valid
                  ? "border-green-600"
                  : "border-stone-300"
            }`}
          />
        </div>
        {mobileState.hint && (phoneTouched || mobileState.digits.length > 0) && (
          <p
            className={`mt-1 text-xs ${
              mobileState.valid ? "font-medium text-green-800" : "text-stone-600"
            }`}
          >
            {mobileState.hint}
          </p>
        )}
      </div>
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
      {error !== null && <ErrorBox error={error} />}
      <button type="submit" disabled={busy} className={BUTTON}>
        {busy && <ButtonSpinner />}
        {busy ? "Sending OTP..." : "Send OTP"}
      </button>
    </form>
  );
}
