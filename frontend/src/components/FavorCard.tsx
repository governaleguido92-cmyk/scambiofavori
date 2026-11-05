import { GranelloIcon } from './GranelloIcon';
import { useRouter } from 'expo-router';
import { favorKindLabel } from '../utils/favorKind';
import React from 'react';
import { View, Text, TouchableOpacity, StyleProp, ViewStyle } from 'react-native';
import type { ReactNode } from 'react';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { Favor } from '../services/api';
import colors from '../theme/colors';
import { styles } from '../styles/home.styles';
import { tt, tx } from '../i18n/tt';
import { getCategoryVisual, getExpiryInfo, formatDistance } from '../utils/favorVisual';
import { formatGranelli } from '../utils/granelli';
import { UserNameWithBadge, SupporterProfileBorder } from './SupporterBadge';

interface FavorCardProps {
  item: Favor;
  /** Id dell'utente collegato: sui propri favori non si mostra il flag di segnalazione. */
  currentUserId?: string;
  onPress: (item: Favor) => void;
  /** Se assente, il flag di segnalazione non viene mostrato. */
  onReport?: (item: Favor) => void;
  /** Sovrascrive la larghezza di default (metà riga nella griglia). */
  style?: StyleProp<ViewStyle>;
  /** Scheda evidenziata, per esempio quella del segnaposto toccato sulla mappa. */
  highlighted?: boolean;
  /** Etichetta di stato sulla banda (In corso, Concluso...) e il suo colore. */
  statusLabel?: string;
  statusColor?: string;
  /** Al posto del nome dell'autore: per esempio "Marta ti sta aiutando". */
  roleText?: string;
  /** Contenuto sotto la scheda: pulsanti e suggerimenti. */
  children?: ReactNode;
}

/** Scheda di un favore con banda colorata per categoria. Usata nella home (griglia) e nella mappa (fila scorrevole). */
export const FavorCard: React.FC<FavorCardProps> = ({
  item, currentUserId, onPress, onReport, style, highlighted, statusLabel, statusColor, roleText, children,
}) => {
  const { t } = useTranslation();
  const router = useRouter();
  const visual = getCategoryVisual(item.category);
  const expiry = getExpiryInfo(item.expires_at);
  const isOffer = item.type === 'offer';
  const isOwn = !!currentUserId && item.creator_id === currentUserId && !roleText;
  const kindLabel = tt(favorKindLabel(item.type, isOwn));
  // Dono: la richiesta di un altro che puoi soddisfare, o un'offerta tua. Ricevo: l'offerta di un altro, o una richiesta tua.
  const isGive = isOwn ? isOffer : !isOffer;

  return (
    <TouchableOpacity
      style={[
        styles.gridCard,
        isGive ? styles.gridCardRequest : styles.gridCardOffer, // arancione = dono, oliva = ricevo (come nelle schede della Home)
        item.is_emergency && styles.gridCardUrgent,
        item.creator_in_debt && isOffer && styles.favorCardDebtHighlight,
        isOwn && styles.gridCardOwn,
        highlighted && styles.gridCardHighlighted,
        style,
      ]}
      onPress={() => onPress(item)}
      accessibilityRole="button"
      accessibilityLabel={`${kindLabel}: ${item.title}, ${formatGranelli(item.granelli_cost)}${item.is_emergency ? ', ' + tt('Urgente') : ''}`}
      data-testid={`favor-card-${item.favor_id}`}
    >
      {/* Banda colorata per tipo: arancione = dona, verde oliva = ricevi (l'emoji dice la categoria) */}
      <View style={[styles.gridBand, { backgroundColor: isGive ? colors.accent : colors.lime }]}>
        <View style={styles.gridBandCircleA} />
        <View style={styles.gridBandCircleB} />
        <Text style={styles.gridBandEmoji}>{visual.emoji}</Text>
        <View style={styles.gridKindPill}>
          <Text style={styles.gridKindText}>{kindLabel}</Text>
        </View>
        <View style={styles.gridGranelliPill}>
          <Text style={styles.gridGranelliText}><GranelloIcon size={14} /> {item.granelli_cost}</Text>
        </View>
        {statusLabel && (
          <View style={[styles.gridStatusPill, { backgroundColor: statusColor ?? colors.primary }]}>
            <Text style={styles.gridStatusText}>{statusLabel}</Text>
          </View>
        )}
        {item.is_emergency && (
          <View style={styles.gridUrgentPill}>
            <Text style={styles.gridUrgentText}>{tt('URGENTE')}</Text>
          </View>
        )}
      </View>

      <View style={styles.gridBody}>
        <View style={styles.gridWhoRow}>
          <TouchableOpacity
            style={{ flexDirection: 'row', alignItems: 'center', gap: 6, flexShrink: 1 }}
            disabled={isOwn}
            onPress={(e) => { e.stopPropagation(); router.push(`/vicino/${item.creator_id}` as any); }}
            accessibilityRole="button"
            accessibilityLabel={tx('Profilo di {0}', [item.creator_name])}
            data-testid={`open-profile-${item.creator_id}`}
          >
          <SupporterProfileBorder isSupporter={item.creator_is_supporter} size={24}>
            <View style={[styles.gridAvatar, { backgroundColor: visual.color }]}>
              <Text style={styles.authorInitial}>{item.creator_name.charAt(0).toUpperCase()}</Text>
            </View>
          </SupporterProfileBorder>
          <View style={styles.headerContent}>
            {isOwn ? (
              <View style={[styles.ownBadge, { alignSelf: 'flex-start' }]}>
                <Text style={styles.ownBadgeText}>{tt('IL TUO FAVORE')}</Text>
              </View>
            ) : roleText ? (
              <Text style={styles.gridCreatorName} numberOfLines={2}>{roleText}</Text>
            ) : (
              <UserNameWithBadge
                name={item.creator_name}
                isSupporter={item.creator_is_supporter}
                nameStyle={styles.gridCreatorName}
              />
            )}
          </View>
          </TouchableOpacity>
          {onReport && item.creator_id !== currentUserId && (
            <TouchableOpacity
              style={styles.reportButton}
              onPress={(e) => {
                e.stopPropagation();
                onReport(item);
              }}
              hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
              accessibilityRole="button"
              accessibilityLabel={tt('Segnala')}
              data-testid={`report-favor-${item.favor_id}`}
            >
              <Ionicons name="flag-outline" size={14} color={colors.textMuted} />
            </TouchableOpacity>
          )}
        </View>
        <Text style={styles.gridTitle} numberOfLines={2}>{item.title}</Text>
        <Text style={styles.gridDescription} numberOfLines={2}>{item.description}</Text>
      </View>

      <View style={styles.gridMeta}>
        <Text style={styles.gridNear} numberOfLines={1}>
          {typeof item.distance_km === 'number' ? `● ${formatDistance(item.distance_km)}` : tt(item.category)}
        </Text>
        {expiry && (
          <Text style={[styles.gridExpiry, expiry.isSoon && styles.gridExpirySoon]} numberOfLines={1}>
            {expiry.label}
          </Text>
        )}
      </View>
      {children}
    </TouchableOpacity>
  );
};
