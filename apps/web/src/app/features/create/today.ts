/** Today where the person is, as `YYYY-MM-DD`: the date their own clock and time zone show. */
export function today(): string {
  const now = new Date();
  const twoDigits = (value: number): string => String(value).padStart(2, '0');
  return `${String(now.getFullYear())}-${twoDigits(now.getMonth() + 1)}-${twoDigits(now.getDate())}`;
}
