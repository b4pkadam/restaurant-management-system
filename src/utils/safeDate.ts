import { format } from 'date-fns';

/**
 * Safely format any date value (ISO string, timestamp, Date object)
 * without throwing RangeError: Invalid time value exceptions.
 */
export function safeFormatDate(
  dateValue: string | Date | number | null | undefined,
  formatPattern: string,
  fallback: string = 'N/A'
): string {
  if (!dateValue) return fallback;

  try {
    let dateObj: Date;

    if (typeof dateValue === 'string') {
      const isTimestampNum = /^\d+$/.test(dateValue);
      if (isTimestampNum) {
        dateObj = new Date(Number(dateValue));
      } else {
        const isoLikeStr = dateValue.includes('T') || dateValue.includes('-')
          ? dateValue
          : dateValue + 'T00:00:00';
        dateObj = new Date(isoLikeStr);
      }
    } else {
      dateObj = new Date(dateValue);
    }

    if (isNaN(dateObj.getTime())) {
      return fallback;
    }

    return format(dateObj, formatPattern);
  } catch {
    return fallback;
  }
}
