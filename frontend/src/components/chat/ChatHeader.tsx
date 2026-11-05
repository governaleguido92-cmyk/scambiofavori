import { GranelloIcon } from '../GranelloIcon';
import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import colors from '../../theme/colors';
import { Favor } from '../../services/api';
import { tt, tx } from '../../i18n/tt';
import { getCategoryVisual } from '../../utils/favorVisual';
import { roleText, statusOf } from '../../utils/favorLabels';
import { granelliFlowLabel } from '../../utils/favorKind';

interface ChatHeaderProps {
  favor: Favor | null;
  currentUserId?: string;
  /** Nome dell'altra persona, per la frase "lo chiude ...". */
  otherName?: string;
  /** Come chiude il favore chi legge: mostra il QR (chi riceve) o lo scansiona (chi esegue). */
  qrRole: 'show' | 'scan' | null;
  onBack: () => void;
  onMenu: () => void;
  onComplete: () => void;
  /** Apre il profilo dell'altra persona. */
  onOpenProfile?: () => void;
}

/** Intestazione della chat: colore ed emoji della categoria, chi aiuta chi, stato e azione per chiudere il favore. */
export function ChatHeader({ favor, currentUserId, otherName, qrRole, onBack, onMenu, onComplete, onOpenProfile }: ChatHeaderProps) {
  const visual = getCategoryVisual(favor?.category ?? 'Altro');
  const status = favor ? statusOf(favor) : null;

  return (
    // Intestazione scura come il resto dell'app: il colore della categoria sta nel cerchio dell'emoji e nel filo in basso,
    // così il testo è sempre bianco su scuro e si legge con qualsiasi categoria.
    <View style={[styles.container, { borderBottomColor: visual.color }]}>

      <View style={styles.topRow}>
        <TouchableOpacity
          style={styles.iconButton}
          onPress={onBack}
          accessibilityRole="button"
          accessibilityLabel={tt('Indietro')}
          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
        >
          <Ionicons name="arrow-back" size={24} color="#FFFFFF" />
        </TouchableOpacity>

        <View style={[styles.emojiCircle, { backgroundColor: visual.color }]}>
          <Text style={styles.emoji}>{visual.emoji}</Text>
        </View>

        <View style={styles.titleBlock}>
          <Text style={styles.title} numberOfLines={1}>{favor?.title || tt('Chat')}</Text>
          {favor && (
            <TouchableOpacity onPress={onOpenProfile} disabled={!onOpenProfile} accessibilityRole="button" accessibilityLabel={tt('Vedi il profilo')} data-testid="chat-open-profile">
              <Text style={styles.subtitle} numberOfLines={1}>
                {roleText(favor, currentUserId)}{onOpenProfile ? ' ›' : ''}
              </Text>
            </TouchableOpacity>
          )}
        </View>

        <TouchableOpacity
          style={styles.iconButton}
          onPress={onMenu}
          accessibilityRole="button"
          accessibilityLabel={tt('Altre azioni')}
          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          data-testid="chat-menu-button"
        >
          <Ionicons name="ellipsis-vertical" size={22} color="#FFFFFF" />
        </TouchableOpacity>
      </View>

      {favor && status && (
        <View style={styles.pillRow}>
          {/* Pillola scura come quella dei Granelli: il colore dello stato sta nel pallino, così non si confonde con lo sfondo */}
          <View style={styles.statusPill}>
            <View style={[styles.statusDot, { backgroundColor: status.color }]} />
            <Text style={styles.statusText}>{status.label}</Text>
          </View>
          <View style={styles.granelliPill}>
            <Text style={styles.granelliText}>{tt(granelliFlowLabel(favor, currentUserId))} <GranelloIcon size={14} /> {favor.granelli_cost}</Text>
          </View>
        </View>
      )}

      {favor?.status === 'accepted' && (
        qrRole ? (
          <TouchableOpacity
            style={styles.completeButton}
            onPress={onComplete}
            accessibilityRole="button"
            accessibilityLabel={qrRole === 'show' ? tt('Mostra il QR per completare') : tt('Scansiona il QR per completare')}
            data-testid="chat-complete-button"
          >
            <Ionicons name={qrRole === 'show' ? 'qr-code' : 'scan'} size={20} color="#FFFFFF" />
            <Text style={styles.completeText}>{qrRole === 'show' ? tt('Mostra il QR per completare') : tt('Scansiona il QR per completare')}</Text>
          </TouchableOpacity>
        ) : (
          <Text style={styles.waitText}>{tx('Il favore lo chiude {0}, quando è fatto.', [otherName || tt('un vicino')])}</Text>
        )
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    paddingHorizontal: 12, paddingTop: 8, paddingBottom: 12,
    backgroundColor: colors.backgroundCard, borderBottomWidth: 3,
  },
  topRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  iconButton: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center' },
  emojiCircle: { width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center' },
  emoji: { fontSize: 24 },
  titleBlock: { flex: 1 },
  title: { color: '#FFFFFF', fontSize: 18, fontWeight: '800' },
  subtitle: { color: 'rgba(255,255,255,0.85)', fontSize: 13, marginTop: 1 },
  pillRow: { flexDirection: 'row', gap: 8, marginTop: 10, marginLeft: 50 },
  statusPill: {
    flexDirection: 'row', alignItems: 'center', gap: 6, borderRadius: 999, paddingHorizontal: 10, paddingVertical: 3,
    backgroundColor: colors.background, borderWidth: 1, borderColor: 'rgba(255,255,255,0.25)',
  },
  statusDot: { width: 8, height: 8, borderRadius: 4 },
  statusText: { color: '#FFFFFF', fontSize: 11, fontWeight: '800', letterSpacing: 0.3 },
  granelliPill: {
    borderRadius: 999, paddingHorizontal: 10, paddingVertical: 3,
    backgroundColor: colors.background, borderWidth: 1, borderColor: 'rgba(152,170,74,0.5)',
  },
  granelliText: { color: '#FFFFFF', fontSize: 12, fontWeight: '800' },
  completeButton: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
    marginTop: 12, paddingVertical: 12, borderRadius: 12, backgroundColor: '#E0560F',
  },
  completeText: { color: '#FFFFFF', fontSize: 15, fontWeight: '800' },
  waitText: { color: 'rgba(255,255,255,0.85)', fontSize: 12.5, marginTop: 10, marginLeft: 50 },
});
