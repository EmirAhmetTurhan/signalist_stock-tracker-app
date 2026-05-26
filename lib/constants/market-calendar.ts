// lib/constants/market-calendar.ts

// NYSE Holidays 2024-2026 (YYYY-MM-DD in New York time)
const NYSE_HOLIDAYS = new Set([
  // 2024
  '2024-01-01', // New Year's Day
  '2024-01-15', // MLK Jr. Day
  '2024-02-19', // Washington's Birthday
  '2024-03-29', // Good Friday
  '2024-05-27', // Memorial Day
  '2024-06-19', // Juneteenth
  '2024-07-04', // Independence Day
  '2024-09-02', // Labor Day
  '2024-11-28', // Thanksgiving
  '2024-12-25', // Christmas
  // 2025
  '2025-01-01', // New Year's Day
  '2025-01-20', // MLK Jr. Day
  '2025-02-17', // Washington's Birthday
  '2025-04-18', // Good Friday
  '2025-05-26', // Memorial Day
  '2025-06-19', // Juneteenth
  '2025-07-04', // Independence Day
  '2025-09-01', // Labor Day
  '2025-11-27', // Thanksgiving
  '2025-12-25', // Christmas
  // 2026
  '2026-01-01', // New Year's Day
  '2026-01-19', // MLK Jr. Day
  '2026-02-16', // Washington's Birthday
  '2026-04-03', // Good Friday
  '2026-05-25', // Memorial Day
  '2026-06-19', // Juneteenth
  '2026-07-03', // Independence Day (Observed)
  '2026-09-07', // Labor Day
  '2026-11-26', // Thanksgiving
  '2026-12-25', // Christmas
]);

/**
 * Checks if the US stock market is currently open.
 * Uses Intl.DateTimeFormat to correctly handle Daylight Saving Time for America/New_York.
 * Regular Hours: Monday-Friday, 09:30 - 16:00 ET
 */
export function isMarketOpen(date: Date = new Date()): boolean {
  // Get time in NY timezone
  const nyDateStr = new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/New_York',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: 'numeric',
    minute: 'numeric',
    hour12: false,
    weekday: 'short',
  }).format(date); // e.g., "Mon, 05/26/2026, 14:30"

  // Parse output
  const match = nyDateStr.match(/([a-zA-Z]+),\s*(\d{2})\/(\d{2})\/(\d{4}),\s*(\d{1,2}):(\d{2})/);
  if (!match) return false; // Fail safe

  const [, weekday, month, day, year, hourStr, minStr] = match;
  const hour = parseInt(hourStr, 10);
  const min = parseInt(minStr, 10);

  // 1. Weekend Check
  if (weekday === 'Sat' || weekday === 'Sun') return false;

  // 2. Holiday Check
  const dateKey = `${year}-${month}-${day}`;
  if (NYSE_HOLIDAYS.has(dateKey)) return false;

  // 3. Time Check (09:30 to 16:00)
  const timeInMinutes = hour * 60 + min;
  const marketOpenMin = 9 * 60 + 30; // 9:30 AM = 570
  const marketCloseMin = 16 * 60;    // 4:00 PM = 960

  if (timeInMinutes < marketOpenMin || timeInMinutes >= marketCloseMin) {
    return false;
  }

  return true;
}
