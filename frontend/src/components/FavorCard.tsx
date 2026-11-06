import { avatarColorsForKind } from '../utils/avatarColor';
import { GranelloIcon } from './GranelloIcon';
import { useRouter } from 'expo-router';
import { readableTextColor } from '../utils/readableColor';
import { earnsGranelli, favorKindFor, granelliFlowLabel } from '../utils/favorKind';
import React from 'react';
import { View, Text, TouchableOpacity, StyleProp, ViewStyle } from 'react-native';
import type { ReactNode } from 'react';
import { Ionicons } from '@expo/vector-icons';
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
  /** Scheda essenziale per gli elenchi lunghi: tipo, Granelli, titolo, distanza e scadenza. Il resto sta nel dettaglio. */
  lean?: boolean;
}

/** Scheda di un favore con banda colorata per categoria. Usata nella home (griglia) e nella mappa (fila scorrevole). */
export const FavorCard: React.FC<FavorCardProps> = ({
  item, currentUserId, onPress, onReport, style, highlighted, statusLabel, statusColor, roleText, children, lean,
}) => {
  const router = useRouter();
  const visual = getCategoryVisual(item.category);
  const expiry = getExpiryInfo(item.expires_at);
  const isOffer = item.type === 'offer';
  const isOwn = !!currentUserId && item.creator_id === currentUserId && !roleText;
  const kindKey = favorKindFor(item, currentUserId);
  const kindLabel = tt(kindKey);
  // L'etichetta dice sempre per esteso «Dona un favore» / «Ricevi un favore»
  const kindPillLabel = tt(`${kindKey} un favore`);
  // Dono: la richiesta di un altro che puoi soddisfare, o un'offerta tua. Ricevo: l'offerta di un altro, o una richiesta tua.
  const isGive = earnsGranelli(item, currentUserId);

  if (lean) {
    return (
      <TouchableOpacity
        style={[
          styles.gridCard,
          styles.leanCard,
          isGive ? styles.gridCardRequest : styles.gridCardOffer,
          item.is_emergency && styles.gridCardUrgent,
          highlighted && styles.gridCardHighlighted,
          style,
        ]}
        onPress={() => onPress(item)}
        accessibilityRole="button"
        accessibilityLabel={`${kindLabel}: ${item.title}, ${formatGranelli(item.granelli_cost)}${item.is_emergency ? ', ' + tt('Urgente') : ''}`}
        data-testid={`favor-card-${item.favor_id}`}
      >
        <View style={styles.cleanHead}>
          <Text style={[styles.cleanKind, styles.leanKind, { color: isGive ? colors.accent : colors.lime }]} numberOfLines={1}>{kindPillLabel}</Text>
          <View style={styles.cleanFlow}>
            <GranelloIcon size={11} />
            <Text style={[styles.cleanFlowText, styles.leanFlowText]}>{tt(granelliFlowLabel(item, currentUserId))} {item.granelli_cost}</Text>
          </View>
        </View>
        <View style={styles.leanBody}>
          <View style={styles.cleanTitleRow}>
            <Text style={styles.cleanEmoji}>{visual.emoji}</Text>
            <Text style={[styles.gridTitle, styles.cleanTitle, styles.leanTitle]} numberOfLines={2}>{item.title}</Text>
          </View>
        </View>
        <View style={styles.leanMeta}>
          <Text style={styles.leanMetaText} numberOfLines={1}>
            {typeof item.distance_km === 'number' ? formatDistance(item.distance_km) : tt(item.category)}
          </Text>
          <View style={[styles.leanAvatar, { backgroundColor: avatarColorsForKind(isGive).backgroundColor }]}>
            <Text style={[styles.leanAvatarInitial, { color: avatarColorsForKind(isGive).color }]}>{item.creator_name.charAt(0).toUpperCase()}</Text>
          </View>
        </View>
      </TouchableOpacity>
    );
  }

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
      {/* Intestazione pulita: il tipo (arancione = dono, oliva = ricevo) e cosa succede ai Granelli. Niente fasce piene. */}
      <View style={styles.cleanHead}>
        <Text style={[styles.cleanKind, { color: isGive ? colors.accent : colors.lime }]} numberOfLines={1}>{kindPillLabel}</Text>
        <View style={styles.cleanFlow}>
          <GranelloIcon size={11} />
          <Text style={styles.cleanFlowText}>{tt(granelliFlowLabel(item, currentUserId))} {item.granelli_cost}</Text>
        </View>
      </View>
      {(statusLabel || item.is_emergency) && (
        <View style={styles.cleanTags}>
          {statusLabel && (
            <View style={[styles.gridStatusTag, { backgroundColor: statusColor ?? colors.primary }]}>
              <Text style={[styles.gridStatusText, { color: readableTextColor(statusColor ?? colors.primary) }]}>{statusLabel}</Text>
            </View>
          )}
          {item.is_emergency && (
            <View style={styles.gridUrgentTag}>
              <Text style={styles.gridUrgentText}>{tt('URGENTE')}</Text>
            </View>
          )}
        </View>
      )}

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
            <View style={[styles.gridAvatar, { backgroundColor: avatarColorsForKind(isGive).backgroundColor }]}>
              <Text style={[styles.authorInitial, { color: avatarColorsForKind(isGive).color }]}>{item.creator_name.charAt(0).toUpperCase()}</Text>
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
        <View style={styles.cleanTitleRow}>
          <Text style={styles.cleanEmoji}>{visual.emoji}</Text>
          <Text style={[styles.gridTitle, styles.cleanTitle]} numberOfLines={2}>{item.title}</Text>
        </View>
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
