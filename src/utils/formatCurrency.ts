import { settingsDB } from '../database/db';
import type { AppSettings } from '../types';

export interface CurrencyOption {
  code: string;
  symbol: string;
  label: string;
  region: string;
}

export const SUPPORTED_CURRENCIES: CurrencyOption[] = [
  { code: 'USD', symbol: '$', label: 'USD ($) - US Dollar', region: 'United States' },
  { code: 'INR', symbol: '₹', label: 'INR (₹) - Indian Rupee', region: 'India' },
  { code: 'JPY', symbol: '¥', label: 'JPY (¥) - Japanese Yen', region: 'Japan' },
  { code: 'EUR', symbol: '€', label: 'EUR (€) - Euro', region: 'Eurozone' },
  { code: 'GBP', symbol: '£', label: 'GBP (£) - British Pound', region: 'United Kingdom' },
];

/**
 * Formats a numeric price into a localized currency string.
 * Supports USD, INR, JPY (0 decimals), EUR, GBP.
 */
export function formatCurrency(
  amount: number | undefined | null,
  symbolOverride?: string,
  currencyCodeOverride?: string
): string {
  const num = typeof amount === 'number' && !isNaN(amount) ? amount : 0;
  
  let settings: Partial<AppSettings> = {};
  try {
    settings = settingsDB.get() || {};
  } catch {
    // fallback if DB not ready
  }

  const symbol = symbolOverride || settings.currencySymbol || '$';
  const currencyCode = currencyCodeOverride || settings.currency || 'USD';

  // Japanese Yen doesn't use decimals
  if (currencyCode === 'JPY' || symbol === '¥') {
    const rounded = Math.round(num);
    return `${symbol}${rounded.toLocaleString('ja-JP')}`;
  }

  // Indian Rupee formatting (e.g. ₹1,50,000.00 or ₹150.00)
  if (currencyCode === 'INR' || symbol === '₹') {
    return `${symbol}${num.toLocaleString('en-IN', {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    })}`;
  }

  // Standard 2 decimal places with local thousand separators
  return `${symbol}${num.toLocaleString('en-US', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}
