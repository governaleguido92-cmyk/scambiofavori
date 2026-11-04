import { GranelloIcon } from '../GranelloIcon';
import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import colors from '../../theme/colors';
import { Favor } from '../../services/api';
import { tt, tx } from '../../i18n/tt';
import { getCategoryVisual } from '../../utils/favorVisual';
import { roleText, statusOf } from '../../utils/favorLabels';
import { BrandLogo } from '../BrandLogo';

interface ChatHeaderProps {
  favor: Favor | null;
  currentUserId?: string;
  /** Nome dell'altra persona, per la frase "lo chiude ...". */
  otherName?: string;
  /** Tocca a chi legge chiudere il favore. */
  canComplete: boolean;
  onBack: () => void;
  onMenu: () => void;
  onComplete: () => void;
}

/** Intestazione della chat: colore ed emoji della categoria, chi aiuta chi, stato e azione per chiudere il favore. */
export function ChatHeader({ favor, currentUserId, otherName, canComplete, onBack, onMenu, onComplete }: ChatHeaderProps) {
  const visual = getCategoryVisual(favor?.category ?? 'Altro');
  const status = favor ? statusOf(favor) : null;

  return (
    <View style={[styles.container, { backgroundColor: visual.color }]}>
      <View style={styles.circleA} />
      <View style={styles.circleB} />

      <View style={styles.topRow}>
        <TouchableOpacity
          style={styles.iconButton}
          onPress={onBack}
          accessibilityRole="button"
          accessibilityLabel={tt('Indietro')}
          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
        >
          <Ionicons name="arrow-back" size={24} color="#fff" />
        </TouchableOpacity>

        <BrandLogo size={26} />
        <Text style={styles.emoji}>{visual.emoji}</Text>

        <View style={styles.titleBlock}>
          <Text style={styles.title} numberOfLines={1}>{favor?.title || tt('Chat')}</Text>
          {favor && <Text style={styles.subtitle} numberOfLines={1}>{roleText(favor, currentUserId)}</Text>}
        </View>

        <TouchableOpacity
          style={styles.iconButton}
          onPress={onMenu}
          accessibilityRole="button"
          accessibilityLabel={tt('Altre azioni')}
          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          data-testid="chat-menu-button"
        >
          <Ionicons name="ellipsis-vertical" size={22} color="#fff" />
        </TouchableOpacity>
      </View>

      {favor && status && (
        <View style={styles.pillRow}>
          <View style={[styles.statusPill, { backgroundColor: status.color }]}>
            <Text style={styles.statusText}>{status.label}</Text>
          </View>
          <View style={styles.granelliPill}>
            <Text style={styles.granelliText}><GranelloIcon size={14} /> {favor.granelli_cost}</Text>
          </View>
        </View>
      )}

      {favor?.status === 'accepted' && (
        canComplete ? (
          <TouchableOpacity
            style={styles.completeButton}
            onPress={onComplete}
            accessibilityRole="button"
            accessibilityLabel={tt('Completa il favore')}
            data-testid="chat-complete-button"
          >
            <Ionicons name="checkmark-circle" size={20} color={colors.primaryDark} />
            <Text style={styles.completeText}>{tt('Completa il favore')}</Text>
          </TouchableOpacity>
        ) : (
          <Text style={styles.waitText}>{tx('Il favore lo chiude {0}, quando è fatto.', [otherName || tt('un vicino')])}</Text>
        )
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { paddingHorizontal: 12, paddingTop: 8, paddingBottom: 12, overflow: 'hidden' },
  circleA: {
    position: 'absolute', right: -24, top: -24, width: 110, height: 110, borderRadius: 55,
    backgroundColor: 'rgba(255,255,255,0.10)',
  },
  circleB: {
    position: 'absolute', left: -20, bottom: -36, width: 90, height: 90, borderRadius: 45,
    backgroundColor: 'rgba(255,255,255,0.07)',
  },
  topRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  iconButton: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center' },
  emoji: { fontSize: 30 },
  titleBlock: { flex: 1 },
  title: { color: '#fff', fontSize: 18, fontWeight: '800' },
  subtitle: { color: 'rgba(255,255,255,0.88)', fontSize: 13, marginTop: 1 },
  pillRow: { flexDirection: 'row', gap: 8, marginTop: 8, marginLeft: 52 },
  statusPill: { borderRadius: 999, paddingHorizontal: 10, paddingVertical: 3 },
  statusText: { color: '#fff', fontSize: 11, fontWeight: '800', letterSpacing: 0.3 },
  granelliPill: {
    borderRadius: 999, paddingHorizontal: 10, paddingVertical: 3,
    backgroundColor: '#0C0E09', borderWidth: 1, borderColor: 'rgba(152,170,74,0.5)',
  },
  granelliText: { color: colors.granelli, fontSize: 12, fontWeight: '800' },
  completeButton: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
    marginTop: 10, paddingVertical: 12, borderRadius: 12, backgroundColor: '#fff',
  },
  completeText: { color: colors.primaryDark, fontSize: 15, fontWeight: '800' },
  waitText: { color: 'rgba(255,255,255,0.92)', fontSize: 12.5, marginTop: 10, marginLeft: 52 },
});
