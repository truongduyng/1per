/**
 * Timezone utilities for handling device timezone and date operations
 */

/**
 * Get the device's current timezone identifier
 * @returns string - IANA timezone identifier (e.g., "America/New_York")
 */
export function getDeviceTimezone(): string {
  return Intl.DateTimeFormat().resolvedOptions().timeZone;
}

/**
 * Get the current date in the device's local timezone with time set to start of day
 * @returns Date - Current date at 00:00:00 in local timezone
 */
export function getTodayInLocalTimezone(): Date {
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  return today;
}

/**
 * Get a date string in YYYY-MM-DD format for the local timezone
 * Useful for consistent date comparisons and grouping
 * @param date - Date object to format
 * @returns string - Date in YYYY-MM-DD format in local timezone
 */
export function getLocalDateString(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

/**
 * Check if a date is today in the local timezone
 * @param date - Date to check
 * @returns boolean - True if the date is today in local timezone
 */
export function isToday(date: Date): boolean {
  const today = getTodayInLocalTimezone();
  return getLocalDateString(date) === getLocalDateString(today);
}

/**
 * Check if two dates are on the same day in local timezone
 * @param date1 - First date
 * @param date2 - Second date
 * @returns boolean - True if both dates are on the same day
 */
export function isSameLocalDay(date1: Date, date2: Date): boolean {
  return getLocalDateString(date1) === getLocalDateString(date2);
}

/**
 * Get the start of day for a given date in local timezone
 * @param date - Date to get start of day for
 * @returns Date - Date set to 00:00:00 in local timezone
 */
export function getStartOfDay(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

/**
 * Get the end of day for a given date in local timezone
 * @param date - Date to get end of day for
 * @returns Date - Date set to 23:59:59.999 in local timezone
 */
export function getEndOfDay(date: Date): Date {
  const endOfDay = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  endOfDay.setHours(23, 59, 59, 999);
  return endOfDay;
}

/**
 * Format a date for display in the user's locale and timezone
 * @param date - Date to format
 * @param options - Intl.DateTimeFormatOptions
 * @returns string - Formatted date string
 */
export function formatDateInLocalTimezone(
  date: Date,
  options: Intl.DateTimeFormatOptions = {}
): string {
  return date.toLocaleDateString('en-US', {
    timeZone: getDeviceTimezone(),
    ...options,
  });
}

/**
 * Format a goal target date for display, e.g. "Mar 6, 2026"
 * Returns null when date is falsy.
 */
export function formatTargetDate(date: Date | string | null | undefined): string | null {
  if (!date) return null;
  return new Date(date).toLocaleDateString('en', { month: 'short', day: 'numeric', year: 'numeric' });
}