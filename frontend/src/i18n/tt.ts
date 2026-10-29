import i18n from './index';
import { EN_DICTIONARY } from './enDictionary';

/**
 * Translate a UI text written in Italian (the source language).
 * Returns the English version when the app language is English and a translation exists.
 */
export const tt = (italian: string): string =>
  i18n.language === 'en' ? EN_DICTIONARY[italian] ?? italian : italian;

/** Same as `tt`, filling the `{0}`, `{1}`... placeholders with `values`. */
export const tx = (italian: string, values: ReadonlyArray<string | number>): string =>
  tt(italian).replace(/\{(\d+)\}/g, (_match, index: string) => String(values[Number(index)] ?? ''));
