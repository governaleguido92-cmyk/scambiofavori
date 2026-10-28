import { Platform } from 'react-native';

/**
 * The Supporter perk (golden-heart badge) is paid through Stripe. Google Play requires Google Play Billing for
 * digital benefits sold inside an app, so on Android the purchase is hidden. Web (and later iOS) keep it.
 * Existing supporters keep their badge everywhere.
 */
export const SUPPORTER_PURCHASE_ENABLED: boolean = Platform.OS !== 'android';
