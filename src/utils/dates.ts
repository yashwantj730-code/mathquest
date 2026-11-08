// Day key in a given IANA timezone, e.g. "2026-10-26" (Asia/Kolkata default) for streaks
export const dayKey = (d: Date, tz = 'Asia/Kolkata') =>
  new Intl.DateTimeFormat('en-CA', { timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit' }).format(d);
export const daysBetween = (a: string, b: string) =>
  Math.round((Date.parse(b) - Date.parse(a)) / 86400000);
