/** Compact relative time, e.g. "13 minutes ago", "2 hours ago", "5 days ago". Pure + testable. */
export function timeAgo(ms: number, now: number = Date.now()): string {
  const secs = Math.max(0, Math.round((now - ms) / 1000));
  const units: [number, string][] = [
    [60, "second"],
    [60, "minute"],
    [24, "hour"],
    [7, "day"],
    [4.34524, "week"],
    [12, "month"],
    [Number.POSITIVE_INFINITY, "year"],
  ];
  let value = secs;
  let unit = "second";
  for (const [size, name] of units) {
    if (value < size) { unit = name; break; }
    value = Math.floor(value / size);
    unit = name;
  }
  if (unit === "second" && value < 5) return "just now";
  return `${value} ${unit}${value === 1 ? "" : "s"} ago`;
}
