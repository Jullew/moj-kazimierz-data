export function warsawLocalIso(
  year: number,
  monthIndex: number,
  day: number,
  hour: number,
  minute: number,
) {
  const guess = new Date(Date.UTC(year, monthIndex, day, hour, minute));
  const formatter = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Europe/Warsaw',
    timeZoneName: 'longOffset',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  });
  const offsetName =
    formatter.formatToParts(guess).find((part) => part.type === 'timeZoneName')?.value ??
    'GMT+01:00';
  const offset = offsetName.replace('GMT', '') || '+00:00';
  return `${String(year)}-${String(monthIndex + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}T${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}:00${offset}`;
}
