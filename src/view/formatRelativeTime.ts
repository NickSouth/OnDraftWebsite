const RELATIVE_TIME_UNITS = [
  { name: "year", seconds: 60 * 60 * 24 * 365 },
  { name: "month", seconds: 60 * 60 * 24 * 30 },
  { name: "week", seconds: 60 * 60 * 24 * 7 },
  { name: "day", seconds: 60 * 60 * 24 },
  { name: "hour", seconds: 60 * 60 },
  { name: "minute", seconds: 60 },
];

export function formatRelativeTime(value: Date | string | number, now = new Date()): string {
  const date = value instanceof Date ? value : new Date(value);
  const timestamp = date.getTime();
  if (Number.isNaN(timestamp)) {
    return "";
  }

  const elapsedSeconds = Math.max(0, Math.round((now.getTime() - timestamp) / 1000));
  if (elapsedSeconds < 60) {
    return "just now";
  }

  const unit = RELATIVE_TIME_UNITS.find((entry) => elapsedSeconds >= entry.seconds);
  if (!unit) {
    return "just now";
  }

  const amount = Math.max(1, Math.round(elapsedSeconds / unit.seconds));
  return `${amount} ${unit.name}${amount === 1 ? "" : "s"} ago`;
}
