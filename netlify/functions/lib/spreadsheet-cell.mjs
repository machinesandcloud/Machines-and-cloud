// Spreadsheet formula-injection guard for CSV downloads (OWASP "CSV Injection"). Same trigger rule as
// lib/intake.mjs csvCell: a cell that starts with = + - @ (after optional whitespace) or with a tab or
// carriage return gets a leading apostrophe, so Excel, Numbers and Google Sheets show it as text.
// One deliberate exception: a plain signed number (an E.164 phone such as +17135550123, or -5, 12.50)
// is left as is. It has no operator, reference or function after the sign, so it cannot run anything,
// and owners import the phone column into Jobber or Housecall Pro.
const PLAIN_NUMBER = /^[+-]?\d+(?:\.\d+)?$/;
export function formulaSafe(text) {
  const t = String(text ?? "");
  if (PLAIN_NUMBER.test(t)) return t;
  return /^\s*[=+\-@]/.test(t) || /^[\t\r]/.test(t) ? "'" + t : t;
}
