/** Normalises Indian mobile input to E.164 (+91XXXXXXXXXX). Returns null if invalid. */
export function normalizePhone(input: string): string | null {
  const digits = input.replace(/[\s\-()]/g, "");
  const m = digits.match(/^(?:\+?91|0)?([6-9]\d{9})$/);
  return m ? `+91${m[1]}` : null;
}
