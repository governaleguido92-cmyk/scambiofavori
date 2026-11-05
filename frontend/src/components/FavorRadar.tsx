import React, { useMemo, useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, LayoutChangeEvent, Modal, Pressable, ScrollView } from 'react-native';
import colors from '../theme/colors';
import { Favor, CURRENCY_NAME } from '../services/api';
import { tt, tx } from '../i18n/tt';
import { formatRadius } from '../utils/radius';
import { formatDistance } from '../utils/favorVisual';
import { bearingDeg, fallbackBearing, radarOffset } from '../utils/radar';
import { earnsGranelli, favorKindFor, granelliFlowLabel } from '../utils/favorKind';

interface FavorRadarProps {
  favors: Favor[];
  userLocation: { latitude: number; longitude: number };
  radiusKm: number;
  selectedId: string | null;
  onSelect: (favorId: string) => void;
  /** Id dell'utente: i suoi favori vengono evidenziati. */
  currentUserId?: string;
}

/** Punti piccoli e tutti uguali: il colore dice il tipo (arancione = Dona, verde oliva = Ricevi), i dettagli stanno nell'elenco. */
const DOT_SIZE = 16;
const CLUSTER_SIZE = 30;
/** Sotto questa distanza (in pixel) due punti si fondono in un cerchio con il numero. */
const CLUSTER_DISTANCE_PX = 22;
const EDGE_MARGIN = CLUSTER_SIZE / 2 + 22;
const GIVE_COLOR = colors.accent;
const RECEIVE_COLOR = '#98AA4A';
const MIXED_COLOR = '#2E3420';

interface Placed {
  favor: Favor;
  x: number;
  y: number;
  give: boolean;
}

interface Group {
  members: Placed[];
  x: number;
  y: number;
}

/**
 * Unisce i punti vicini: ogni punto entra nel primo gruppo il cui centro è a meno di CLUSTER_DISTANCE_PX.
 * Il favore selezionato resta sempre un punto a sé, così si vede dove sta.
 */
export function groupPlaced(placed: Placed[], selectedId: string | null, distancePx: number = CLUSTER_DISTANCE_PX): Group[] {
  const groups: Group[] = [];
  for (const item of placed) {
    if (item.favor.favor_id === selectedId) {
      groups.push({ members: [item], x: item.x, y: item.y });
      continue;
    }
    const target = groups.find(
      (group) => !group.members.some((m) => m.favor.favor_id === selectedId) && Math.hypot(group.x - item.x, group.y - item.y) < distancePx,
    );
    if (target) {
      target.members.push(item);
      target.x = target.members.reduce((sum, m) => sum + m.x, 0) / target.members.length;
      target.y = target.members.reduce((sum, m) => sum + m.y, 0) / target.members.length;
    } else {
      groups.push({ members: [item], x: item.x, y: item.y });
    }
  }
  return groups;
}

/**
 * Vista "radar": l'utente al centro, i favori attorno nella direzione reale (posizioni già sfocate dal server)
 * e a una distanza proporzionale al raggio scelto. Non è una mappa stradale: serve a capire a colpo d'occhio
 * quanti favori ci sono e da che parte. I punti vicini si raggruppano in un cerchio con il numero.
 */
export const FavorRadar: React.FC<FavorRadarProps> = ({ favors, userLocation, radiusKm, selectedId, onSelect, currentUserId }) => {
  const [size, setSize] = useState({ width: 0, height: 0 });
  const [openGroup, setOpenGroup] = useState<Placed[] | null>(null);

  const onLayout = (event: LayoutChangeEvent) => {
    const { width, height } = event.nativeEvent.layout;
    setSize({ width, height });
  };

  const radiusPx = Math.max(0, Math.min(size.width, size.height) / 2 - EDGE_MARGIN);
  const centerX = size.width / 2;
  const centerY = size.height / 2;

  const groups = useMemo(() => {
    if (radiusPx <= 0) return [];
    const placed: Placed[] = [];
    for (const favor of favors) {
      if (typeof favor.distance_km !== 'number') continue;
      const bearing =
        typeof favor.approximate_latitude === 'number' && typeof favor.approximate_longitude === 'number'
          ? bearingDeg(userLocation.latitude, userLocation.longitude, favor.approximate_latitude, favor.approximate_longitude)
          : fallbackBearing(favor.favor_id);
      const { x, y } = radarOffset(favor.distance_km, bearing, radiusKm, radiusPx);
      placed.push({ favor, x, y, give: earnsGranelli(favor, currentUserId) });
    }
    return groupPlaced(placed, selectedId);
  }, [favors, userLocation.latitude, userLocation.longitude, radiusKm, radiusPx, selectedId, currentUserId]);

  const pickFromGroup = (favorId: string) => {
    setOpenGroup(null);
    onSelect(favorId);
  };

  return (
    <View style={styles.container} onLayout={onLayout}>
      {radiusPx > 0 && (
        <>
          <View style={[styles.ring, ringBox(centerX, centerY, radiusPx)]} />
          <View style={[styles.ring, styles.ringInner, ringBox(centerX, centerY, radiusPx / 2)]} />
          <Text style={[styles.ringLabel, { left: centerX + 6, top: centerY - radiusPx - 16 }]}>
            {formatRadius(radiusKm)}
          </Text>
          <Text style={[styles.ringLabel, { left: centerX + 6, top: centerY - radiusPx / 2 - 16 }]}>
            {formatRadius(radiusKm / 2)}
          </Text>

          <View style={[styles.userDot, { left: centerX - 7, top: centerY - 7 }]} />

          {groups.map((group) => {
            const count = group.members.length;
            if (count === 1) {
              const { favor, give } = group.members[0];
              const selected = favor.favor_id === selectedId;
              const isOwn = !!currentUserId && favor.creator_id === currentUserId;
              return (
                <TouchableOpacity
                  key={favor.favor_id}
                  style={[styles.dotHit, { left: centerX + group.x - DOT_SIZE, top: centerY + group.y - DOT_SIZE, zIndex: selected ? 3 : 1 }]}
                  onPress={() => onSelect(favor.favor_id)}
                  accessibilityRole="button"
                  accessibilityLabel={`${isOwn ? tt('Il tuo favore') + ': ' : ''}${tt(favorKindFor(favor, currentUserId))}: ${favor.title}, ${favor.granelli_cost} ${CURRENCY_NAME}`}
                  data-testid={`map-favor-${favor.favor_id}`}
                >
                  <View
                    style={[
                      styles.dot,
                      { backgroundColor: give ? GIVE_COLOR : RECEIVE_COLOR },
                      favor.is_emergency && styles.dotUrgent,
                      isOwn && styles.dotOwn,
                      selected && styles.dotSelected,
                    ]}
                  />
                </TouchableOpacity>
              );
            }
            const gives = group.members.filter((m) => m.give).length;
            const background = gives === count ? GIVE_COLOR : gives === 0 ? RECEIVE_COLOR : MIXED_COLOR;
            const mixed = background === MIXED_COLOR;
            return (
              <TouchableOpacity
                key={`group-${group.members.map((m) => m.favor.favor_id).join('-')}`}
                style={[styles.dotHit, { left: centerX + group.x - DOT_SIZE, top: centerY + group.y - DOT_SIZE, zIndex: 2 }]}
                onPress={() => setOpenGroup(group.members)}
                accessibilityRole="button"
                accessibilityLabel={tx('{0} favori in questa zona', [count])}
                data-testid={`map-group-${count}`}
              >
                <View style={[styles.cluster, { backgroundColor: background }, mixed && styles.clusterMixed]}>
                  <Text style={[styles.clusterText, mixed && styles.clusterTextMixed]}>{count}</Text>
                </View>
              </TouchableOpacity>
            );
          })}

          {/* Legenda minima: i colori dei punti e il punto «tu» */}
          <View style={styles.legend} pointerEvents="none">
            <View style={styles.legendItem}>
              <View style={[styles.legendDot, { backgroundColor: GIVE_COLOR }]} />
              <Text style={styles.legendText}>{tt('Dona')}</Text>
            </View>
            <View style={styles.legendItem}>
              <View style={[styles.legendDot, { backgroundColor: RECEIVE_COLOR }]} />
              <Text style={styles.legendText}>{tt('Ricevi')}</Text>
            </View>
            <View style={styles.legendItem}>
              <View style={[styles.legendDot, styles.legendYou]} />
              <Text style={styles.legendText}>{tt('Tu')}</Text>
            </View>
          </View>
        </>
      )}

      <Modal visible={openGroup !== null} transparent animationType="slide" onRequestClose={() => setOpenGroup(null)}>
        <Pressable style={styles.backdrop} onPress={() => setOpenGroup(null)} accessibilityLabel={tt('Chiudi')}>
          <Pressable style={styles.sheet} onPress={() => undefined}>
            <Text style={styles.sheetTitle}>{tx('{0} favori in questa zona', [openGroup?.length ?? 0])}</Text>
            <ScrollView style={styles.sheetList}>
              {(openGroup ?? []).map(({ favor, give }) => (
                <TouchableOpacity
                  key={favor.favor_id}
                  style={styles.row}
                  onPress={() => pickFromGroup(favor.favor_id)}
                  accessibilityRole="button"
                  data-testid={`map-group-item-${favor.favor_id}`}
                >
                  <View style={[styles.rowDot, { backgroundColor: give ? GIVE_COLOR : RECEIVE_COLOR }]} />
                  <View style={styles.rowText}>
                    <Text style={styles.rowTitle} numberOfLines={1}>{favor.title}</Text>
                    <Text style={styles.rowMeta} numberOfLines={1}>
                      {tt(`${favorKindFor(favor, currentUserId)} un favore`)} · {tt(granelliFlowLabel(favor, currentUserId))} {favor.granelli_cost}
                      {typeof favor.distance_km === 'number' ? ` · ${formatDistance(favor.distance_km)}` : ''}
                    </Text>
                  </View>
                </TouchableOpacity>
              ))}
            </ScrollView>
            <TouchableOpacity style={styles.close} onPress={() => setOpenGroup(null)} accessibilityRole="button">
              <Text style={styles.closeText}>{tt('Chiudi')}</Text>
            </TouchableOpacity>
          </Pressable>
        </Pressable>
      </Modal>
    </View>
  );
};

const ringBox = (cx: number, cy: number, radius: number) => ({
  left: cx - radius,
  top: cy - radius,
  width: radius * 2,
  height: radius * 2,
  borderRadius: radius,
});

const styles = StyleSheet.create({
  container: {
    height: 320,
    marginHorizontal: 20,
    borderRadius: 18,
    backgroundColor: colors.backgroundCard,
    borderWidth: 1,
    borderColor: colors.border,
    overflow: 'hidden',
  },
  ring: {
    position: 'absolute',
    borderWidth: 1,
    borderColor: 'rgba(152, 170, 74, 0.45)',
  },
  ringInner: {
    borderStyle: 'dashed',
    borderColor: 'rgba(152, 170, 74, 0.25)',
  },
  ringLabel: {
    position: 'absolute',
    color: colors.textMuted,
    fontSize: 10,
    fontWeight: '600',
  },
  legend: {
    position: 'absolute',
    left: 12,
    right: 12,
    bottom: 8,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 16,
  },
  legendItem: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  legendDot: { width: 10, height: 10, borderRadius: 5 },
  legendYou: { backgroundColor: colors.background, borderWidth: 2, borderColor: '#fff' },
  legendText: { color: '#FFFFFF', fontSize: 11.5, fontWeight: '700' },
  userDot: {
    zIndex: 4,
    position: 'absolute',
    width: 14,
    height: 14,
    borderRadius: 7,
    backgroundColor: colors.background,
    borderWidth: 2.5,
    borderColor: '#fff',
  },
  // Area toccabile più grande del punto (almeno 32 pixel) per il dito
  dotHit: {
    position: 'absolute',
    width: DOT_SIZE * 2,
    height: DOT_SIZE * 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  dot: {
    width: DOT_SIZE,
    height: DOT_SIZE,
    borderRadius: DOT_SIZE / 2,
    borderWidth: 2,
    borderColor: colors.backgroundCard,
  },
  dotUrgent: {
    borderColor: colors.error,
    borderWidth: 3,
  },
  dotOwn: {
    borderColor: '#FFFFFF',
    borderWidth: 3,
  },
  dotSelected: {
    transform: [{ scale: 1.5 }],
    borderColor: '#FFFFFF',
    borderWidth: 3,
  },
  cluster: {
    width: CLUSTER_SIZE,
    height: CLUSTER_SIZE,
    borderRadius: CLUSTER_SIZE / 2,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: colors.backgroundCard,
  },
  clusterMixed: {
    borderColor: '#FFFFFF',
  },
  clusterText: {
    color: colors.background,
    fontSize: 13,
    fontWeight: '900',
  },
  clusterTextMixed: {
    color: '#FFFFFF',
  },
  backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.6)', justifyContent: 'flex-end' },
  sheet: {
    backgroundColor: colors.background,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    padding: 18,
    gap: 10,
    maxHeight: '70%',
  },
  sheetTitle: { color: '#FFFFFF', fontSize: 17, fontWeight: '800' },
  sheetList: { flexGrow: 0 },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    backgroundColor: colors.backgroundCard,
    borderRadius: 12,
    padding: 12,
    marginBottom: 8,
  },
  rowDot: { width: 14, height: 14, borderRadius: 7 },
  rowText: { flex: 1 },
  rowTitle: { color: '#FFFFFF', fontSize: 15, fontWeight: '700' },
  rowMeta: { color: '#FFFFFF', opacity: 0.8, fontSize: 12.5, marginTop: 2 },
  close: { alignItems: 'center', paddingVertical: 12, borderRadius: 12 },
  closeText: { color: '#FFFFFF', fontWeight: '700' },
});
