/** Cities on the command-center clock strip: a label and an IANA time zone. */
export const CLOCKS = [
  { label: 'New York', zone: 'America/New_York' },
  { label: 'London', zone: 'Europe/London' },
  { label: 'Lahore', zone: 'Asia/Karachi' },
  { label: 'Tokyo', zone: 'Asia/Tokyo' }
] as const

/** "14:05:09" in the given time zone (24 hour). Falls back to UTC for an unknown zone. */
export function clockTime(date: Date, zone: string): string {
  try {
    return new Intl.DateTimeFormat('en-GB', {
      timeZone: zone,
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hourCycle: 'h23'
    }).format(date)
  } catch {
    return date.toISOString().slice(11, 19)
  }
}

/** "Fri 13 Nov" in UTC. */
export function utcDate(date: Date): string {
  return new Intl.DateTimeFormat('en-GB', {
    timeZone: 'UTC',
    weekday: 'short',
    day: 'numeric',
    month: 'short'
  }).format(date)
}
