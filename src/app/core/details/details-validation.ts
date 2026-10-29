import { MAX_QUANTITY } from '@core/stock-adjust/stock-adjust';
import { EditableDetail } from './details-fields';

/** Inline messages (US-22). Spec files import these to assert on them. */
export const DETAIL_MESSAGES = {
  required: (label: string) => `${label} is required.`,
  number: (label: string) => `${label} must be a number ≥ 0, e.g. 12.50.`,
  whole: (label: string) => `${label} must be a whole number from 0 to 1,000,000.`,
} as const;

/** Digits, optionally a dot and more digits: no sign, comma, exponent or bare leading dot. */
const NUMBER = /^\d+(?:\.\d+)?$/;
const WHOLE = /^\d+$/;

/**
 * Why the typed text for one field cannot be saved, or null when it can
 * (US-22). Pure. Nothing is corrected: the text is checked as typed, except
 * that spaces around a number are not part of it. Text fields are stored
 * exactly as typed; "required" means not blank or only spaces.
 */
export function validateDetail(def: EditableDetail, typed: string): string | null {
  const trimmed = typed.trim();
  if (trimmed === '') {
    return def.required ? DETAIL_MESSAGES.required(def.label) : null;
  }
  switch (def.kind) {
    case 'text':
      return null;
    case 'number':
      return NUMBER.test(trimmed) ? null : DETAIL_MESSAGES.number(def.label);
    case 'whole':
      return WHOLE.test(trimmed) && Number(trimmed) <= MAX_QUANTITY ? null : DETAIL_MESSAGES.whole(def.label);
  }
}
