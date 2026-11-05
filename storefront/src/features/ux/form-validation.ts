const CROCKFORD_32_RE = /^[0-9A-HJ-KM-NP-TV-Z]{10}$/;

function parseOrderNumber(raw: string): string | null {
  const cleaned = raw
    .trim()
    .toUpperCase()
    .replace(/^FA[\s-]*/i, "")
    .replace(/[\s-]/g, "");
  return CROCKFORD_32_RE.test(cleaned) ? cleaned : null;
}

export interface PasswordStrengthResult {
  score: 0 | 1 | 2 | 3 | 4;
  label: "Enter password" | "Too short" | "Fair" | "Good" | "Strong";
  hasMinLength: boolean;
  hasLetter: boolean;
  hasNumber: boolean;
  hasSpecialOrUpper: boolean;
  valid: boolean;
}

export function evaluatePasswordStrength(password: string): PasswordStrengthResult {
  const hasMinLength = password.length >= 8;
  const hasLetter = /[A-Za-z]/.test(password);
  const hasNumber = /\d/.test(password);
  const hasSpecialOrUpper = /[A-Z]/.test(password) && /[^A-Za-z0-9]/.test(password);
  const valid = hasMinLength && hasLetter && hasNumber;

  if (password.length === 0) {
    return {
      score: 0,
      label: "Enter password",
      hasMinLength: false,
      hasLetter: false,
      hasNumber: false,
      hasSpecialOrUpper: false,
      valid: false,
    };
  }

  if (!hasMinLength) {
    return {
      score: 1,
      label: "Too short",
      hasMinLength,
      hasLetter,
      hasNumber,
      hasSpecialOrUpper,
      valid: false,
    };
  }

  let score: 0 | 1 | 2 | 3 | 4 = 2;
  if (valid && (password.length >= 10 || /[A-Z]/.test(password))) {
    score = 3;
  }
  if (valid && password.length >= 12 && hasSpecialOrUpper) {
    score = 4;
  }

  const label = score === 4 ? "Strong" : score === 3 ? "Good" : "Fair";

  return {
    score,
    label,
    hasMinLength,
    hasLetter,
    hasNumber,
    hasSpecialOrUpper,
    valid,
  };
}

export interface IndianMobileValidationResult {
  digits: string;
  formatted: string;
  e164: string | null;
  valid: boolean;
  hint: string | null;
}

export function validateIndianMobileInput(raw: string): IndianMobileValidationResult {
  const trimmed = raw.trim();
  // Strip leading +91 or 91 if user pasted full number
  let digitsOnly = trimmed.replace(/\D/g, "");
  if (digitsOnly.length === 12 && digitsOnly.startsWith("91")) {
    digitsOnly = digitsOnly.slice(2);
  } else if (digitsOnly.length === 11 && digitsOnly.startsWith("0")) {
    digitsOnly = digitsOnly.slice(1);
  }
  digitsOnly = digitsOnly.slice(0, 10);

  const formatted =
    digitsOnly.length > 5
      ? `${digitsOnly.slice(0, 5)} ${digitsOnly.slice(5)}`
      : digitsOnly;

  if (digitsOnly.length === 0) {
    return {
      digits: "",
      formatted: "",
      e164: null,
      valid: false,
      hint: null,
    };
  }

  if (!/^[6-9]/.test(digitsOnly)) {
    return {
      digits: digitsOnly,
      formatted,
      e164: null,
      valid: false,
      hint: "Indian mobile numbers must begin with 6, 7, 8, or 9.",
    };
  }

  if (digitsOnly.length < 10) {
    const remaining = 10 - digitsOnly.length;
    return {
      digits: digitsOnly,
      formatted,
      e164: null,
      valid: false,
      hint: `Enter ${remaining} more ${remaining === 1 ? "digit" : "digits"} (${digitsOnly.length}/10).`,
    };
  }

  return {
    digits: digitsOnly,
    formatted,
    e164: `+91${digitsOnly}`,
    valid: true,
    hint: "Valid 10-digit Indian mobile number.",
  };
}

export interface OrderNumberValidationResult {
  formattedInput: string;
  normalizedCode: string | null;
  valid: boolean;
  hint: string | null;
}

export function validateOrderNumberInput(raw: string): OrderNumberValidationResult {
  const cleaned = raw
    .toUpperCase()
    .replace(/^FA[\s-]*/i, "")
    .replace(/[^0-9A-Z]/g, "")
    .slice(0, 10);

  if (cleaned.length === 0) {
    return {
      formattedInput: "",
      normalizedCode: null,
      valid: false,
      hint: null,
    };
  }

  const formattedInput =
    cleaned.length > 5
      ? `FA-${cleaned.slice(0, 5)}-${cleaned.slice(5)}`
      : `FA-${cleaned}`;

  const parsed = parseOrderNumber(formattedInput);
  if (cleaned.length < 10) {
    return {
      formattedInput,
      normalizedCode: null,
      valid: false,
      hint: `Order code requires 10 characters (${cleaned.length}/10 entered).`,
    };
  }

  if (!parsed) {
    return {
      formattedInput,
      normalizedCode: null,
      valid: false,
      hint: "Letters I, L, O, and U are not used in order codes. Check your receipt.",
    };
  }

  return {
    formattedInput,
    normalizedCode: parsed,
    valid: true,
    hint: "Order code format verified.",
  };
}

export interface CheckoutProgressStep {
  id: string;
  label: string;
  detail: string;
  status: "completed" | "active" | "upcoming";
}

export interface CheckoutProgressState {
  active: boolean;
  percent: number;
  headline: string;
  subline: string;
  steps: CheckoutProgressStep[];
}

export function resolveCheckoutProgressState(
  phase: "idle" | "creating" | "paying" | "payment-failed",
): CheckoutProgressState {
  if (phase === "idle" || phase === "payment-failed") {
    return {
      active: false,
      percent: 0,
      headline: "",
      subline: "",
      steps: [],
    };
  }

  if (phase === "creating") {
    return {
      active: true,
      percent: 45,
      headline: "Reserving your items with the kitchen…",
      subline: "Verifying dietary guardrails, live item availability, and tax breakdown.",
      steps: [
        {
          id: "validate",
          label: "Dietary & cart check",
          detail: "Pure-veg, Jain, and kitchen availability verified",
          status: "completed",
        },
        {
          id: "create",
          label: "Creating kitchen order",
          detail: "Locking prices and generating your FA order number",
          status: "active",
        },
        {
          id: "pay",
          label: "Securing payment",
          detail: "Confirming UPI / card authorization",
          status: "upcoming",
        },
      ],
    };
  }

  return {
    active: true,
    percent: 85,
    headline: "Authorizing payment & notifying kitchen…",
    subline: "Please do not close or refresh this window while we confirm your payment.",
    steps: [
      {
        id: "validate",
        label: "Dietary & cart check",
        detail: "Pure-veg, Jain, and kitchen availability verified",
        status: "completed",
      },
      {
        id: "create",
        label: "Creating kitchen order",
        detail: "Order ticket reserved with the restaurant",
        status: "completed",
      },
      {
        id: "pay",
        label: "Securing payment",
        detail: "Finalizing payment and dispatching live order tracker",
        status: "active",
      },
    ],
  };
}
