import React, { useEffect, useRef } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import colors from '../theme/colors';
import { tt, tx } from '../i18n/tt';
import { useNow } from '../hooks/useNow';
import { COUNTDOWN_LAST_HOUR_MS, formatCountdown, msLeft } from '../utils/favorCountdown';
import { formatGranelli } from '../utils/granelli';

interface FavorCountdownProps {
  expiresAt: string | undefined;
  /** Chi guarda guadagnerebbe Granelli aiutando: il testo ricorda l'occasione che sta per sparire. */
  earns: boolean;
  granelli: number;
  /** "card": riga compatta sulle schede. "banner": riquadro nel dettaglio del favore. */
  variant: 'card' | 'banner';
  /** Chiamata una volta, quando il tempo finisce mentre la pagina è aperta. */
  onExpire?: () => void;
}

/** Conto alla rovescia che scorre dal vivo, secondo per secondo, fino alla scadenza dell'annuncio. */
export function FavorCountdown({ expiresAt, earns, granelli, variant, onExpire }: FavorCountdownProps) {
  const now = useNow();
  const left = msLeft(expiresAt, now);
  const isExpired = left !== null && left <= 0;
  const expiredRef = useRef(false);

  useEffect(() => {
    if (isExpired && !expiredRef.current) {
      expiredRef.current = true;
      onExpire?.();
    }
  }, [isExpired, onExpire]);

  if (left === null) return null;
  const isLastHour = !isExpired && left <= COUNTDOWN_LAST_HOUR_MS;
  const clock = formatCountdown(left);
  const tone = isExpired ? styles.expired : isLastHour ? styles.lastHour : styles.running;

  if (variant === 'card') {
    const label = isExpired ? tt('Scaduto') : clock;
    return (
      <View style={styles.cardRow} accessibilityLabel={isExpired ? tt('Annuncio scaduto') : tx('Scade tra {0}', [clock])}>
        <Ionicons name={isExpired ? 'hourglass' : 'hourglass-outline'} size={12} color={tone.color} />
        <Text style={[styles.cardText, tone]} numberOfLines={1}>{label}</Text>
      </View>
    );
  }

  const title = isExpired
    ? (earns ? tt('Scaduto: l\'occasione di guadagnare è persa') : tt('Annuncio scaduto'))
    : (earns ? tx('Hai ancora {0} per guadagnare {1}', [clock, formatGranelli(granelli)]) : tx('L\'annuncio scade tra {0}', [clock]));
  const subtitle = isExpired
    ? tt('Nessuno può più accettarlo.')
    : (earns ? tt('Poi l\'annuncio scade e l\'occasione è persa.') : tt('Poi sparisce dagli elenchi.'));

  return (
    <View style={[styles.banner, isLastHour && styles.bannerLastHour, isExpired && styles.bannerExpired]}>
      <Ionicons name={isExpired ? 'hourglass' : 'hourglass-outline'} size={22} color={tone.color} />
      <View style={styles.bannerTexts}>
        <Text style={[styles.bannerTitle, tone]}>{title}</Text>
        <Text style={styles.bannerSubtitle}>{subtitle}</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  running: { color: colors.accent },
  lastHour: { color: colors.error, fontWeight: '800' },
  expired: { color: colors.textMuted },
  cardRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  cardText: {
    fontSize: 12,
    fontWeight: '700',
    fontVariant: ['tabular-nums'],
  },
  banner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    padding: 14,
    marginBottom: 14,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: colors.accent,
    backgroundColor: colors.accentMuted,
  },
  bannerLastHour: {
    borderWidth: 2,
    borderColor: colors.error,
  },
  bannerExpired: {
    borderColor: colors.backgroundLight,
    backgroundColor: colors.backgroundCard,
  },
  bannerTexts: {
    flex: 1,
    gap: 4,
  },
  bannerTitle: {
    fontSize: 16,
    fontWeight: '800',
    fontVariant: ['tabular-nums'],
  },
  bannerSubtitle: {
    color: colors.textSecondary,
    fontSize: 13,
    lineHeight: 18,
  },
});
