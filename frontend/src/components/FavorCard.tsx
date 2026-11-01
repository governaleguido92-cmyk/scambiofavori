import React from 'react';
import { View, Text, TouchableOpacity, StyleProp, ViewStyle } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { Favor, CURRENCY_SYMBOL } from '../services/api';
import colors from '../theme/colors';
import { styles } from '../styles/home.styles';
import { tt } from '../i18n/tt';
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
}

/** Scheda di un favore con banda colorata per categoria. Usata nella home (griglia) e nella mappa (fila scorrevole). */
export const FavorCard: React.FC<FavorCardProps> = ({ item, currentUserId, onPress, onReport, style, highlighted }) => {
  const { t } = useTranslation();
  const visual = getCategoryVisual(item.category);
  const expiry = getExpiryInfo(item.expires_at);
  const isOffer = item.type === 'offer';
  const kindLabel = isOffer ? t('favor.offer') : t('favor.request');

  return (
    <TouchableOpacity
      style={[
        styles.gridCard,
        isOffer ? styles.gridCardOffer : styles.gridCardRequest,
        item.is_emergency && styles.gridCardUrgent,
        item.creator_in_debt && isOffer && styles.favorCardDebtHighlight,
        highlighted && styles.gridCardHighlighted,
        style,
      ]}
      onPress={() => onPress(item)}
      accessibilityRole="button"
      accessibilityLabel={`${kindLabel}: ${item.title}, ${formatGranelli(item.granelli_cost)}${item.is_emergency ? ', ' + tt('Urgente') : ''}`}
      data-testid={`favor-card-${item.favor_id}`}
    >
      {/* Banda colorata per categoria */}
      <View style={[styles.gridBand, { backgroundColor: visual.color }]}>
        <View style={styles.gridBandCircleA} />
        <View style={styles.gridBandCircleB} />
        <Text style={styles.gridBandEmoji}>{visual.emoji}</Text>
        <View style={styles.gridKindPill}>
          <Text style={styles.gridKindText}>{kindLabel}</Text>
        </View>
        <View style={styles.gridGranelliPill}>
          <Text style={styles.gridGranelliText}>{CURRENCY_SYMBOL} {item.granelli_cost}</Text>
        </View>
        {item.is_emergency && (
          <View style={styles.gridUrgentPill}>
            <Text style={styles.gridUrgentText}>{tt('URGENTE')}</Text>
          </View>
        )}
      </View>

      <View style={styles.gridBody}>
        <View style={styles.gridWhoRow}>
          <SupporterProfileBorder isSupporter={item.creator_is_supporter} size={24}>
            <View style={[styles.gridAvatar, { backgroundColor: visual.color }]}>
              <Text style={styles.authorInitial}>{item.creator_name.charAt(0).toUpperCase()}</Text>
            </View>
          </SupporterProfileBorder>
          <View style={styles.headerContent}>
            <UserNameWithBadge
              name={item.creator_name}
              isSupporter={item.creator_is_supporter}
              nameStyle={styles.gridCreatorName}
            />
          </View>
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
    </TouchableOpacity>
  );
};
