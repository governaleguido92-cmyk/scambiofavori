import React, { useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, LayoutChangeEvent } from 'react-native';
import colors from '../theme/colors';
import { Favor, CURRENCY_SYMBOL } from '../services/api';
import { tt } from '../i18n/tt';
import { getCategoryVisual } from '../utils/favorVisual';
import { formatRadius } from '../utils/radius';
import { bearingDeg, fallbackBearing, radarOffset } from '../utils/radar';

interface FavorRadarProps {
  favors: Favor[];
  userLocation: { latitude: number; longitude: number };
  radiusKm: number;
  selectedId: string | null;
  onSelect: (favorId: string) => void;
}

const MARKER_SIZE = 46;
const EDGE_MARGIN = MARKER_SIZE / 2 + 22;
const OFFER_COLOR = '#5FBF7F';

/**
 * Vista "radar": l'utente al centro, i favori attorno nella direzione reale (posizioni già sfocate dal server)
 * e a una distanza proporzionale al raggio scelto. Non è una mappa stradale: serve a capire a colpo d'occhio
 * quanti favori ci sono e da che parte.
 */
export const FavorRadar: React.FC<FavorRadarProps> = ({ favors, userLocation, radiusKm, selectedId, onSelect }) => {
  const [size, setSize] = useState({ width: 0, height: 0 });

  const onLayout = (event: LayoutChangeEvent) => {
    const { width, height } = event.nativeEvent.layout;
    setSize({ width, height });
  };

  const radiusPx = Math.max(0, Math.min(size.width, size.height) / 2 - EDGE_MARGIN);
  const centerX = size.width / 2;
  const centerY = size.height / 2;

  // Il favore selezionato va disegnato per ultimo, cioè sopra gli altri.
  const ordered = [...favors].sort((a, b) => Number(a.favor_id === selectedId) - Number(b.favor_id === selectedId));

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
            {formatRadius(radiusKm / 4)}
          </Text>

          <View style={[styles.userDot, { left: centerX - 7, top: centerY - 7 }]} />
          <Text style={[styles.userLabel, { left: centerX - 40, top: centerY + 12, width: 80 }]}>{tt('Tu sei qui')}</Text>

          {ordered.map((favor) => {
            if (typeof favor.distance_km !== 'number') return null;
            const bearing =
              typeof favor.approximate_latitude === 'number' && typeof favor.approximate_longitude === 'number'
                ? bearingDeg(userLocation.latitude, userLocation.longitude, favor.approximate_latitude, favor.approximate_longitude)
                : fallbackBearing(favor.favor_id);
            const { x, y } = radarOffset(favor.distance_km, bearing, radiusKm, radiusPx);
            const visual = getCategoryVisual(favor.category);
            const selected = favor.favor_id === selectedId;
            const borderColor = favor.is_emergency ? colors.error : favor.type === 'offer' ? OFFER_COLOR : colors.accent;
            return (
              <TouchableOpacity
                key={favor.favor_id}
                style={[styles.marker, { left: centerX + x - MARKER_SIZE / 2, top: centerY + y - MARKER_SIZE / 2, zIndex: selected ? 2 : 1 }]}
                onPress={() => onSelect(favor.favor_id)}
                accessibilityRole="button"
                accessibilityLabel={`${favor.title}, ${favor.granelli_cost} ${CURRENCY_SYMBOL}`}
                data-testid={`map-favor-${favor.favor_id}`}
              >
                <View
                  style={[
                    styles.markerCircle,
                    { backgroundColor: visual.color, borderColor: selected ? '#fff' : borderColor },
                    selected && styles.markerCircleSelected,
                  ]}
                >
                  <Text style={styles.markerEmoji}>{visual.emoji}</Text>
                </View>
                <View style={styles.markerPill}>
                  <Text style={styles.markerPillText}>{CURRENCY_SYMBOL} {favor.granelli_cost}</Text>
                </View>
              </TouchableOpacity>
            );
          })}
        </>
      )}
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
    borderColor: 'rgba(184, 200, 104, 0.45)',
  },
  ringInner: {
    borderStyle: 'dashed',
    borderColor: 'rgba(184, 200, 104, 0.25)',
  },
  ringLabel: {
    position: 'absolute',
    color: colors.textMuted,
    fontSize: 10,
    fontWeight: '600',
  },
  userDot: {
    position: 'absolute',
    width: 14,
    height: 14,
    borderRadius: 7,
    backgroundColor: '#3B82F6',
    borderWidth: 2,
    borderColor: '#fff',
  },
  userLabel: {
    position: 'absolute',
    textAlign: 'center',
    color: colors.textSecondary,
    fontSize: 10,
    fontWeight: '600',
  },
  marker: {
    position: 'absolute',
    width: MARKER_SIZE,
    alignItems: 'center',
  },
  markerCircle: {
    width: MARKER_SIZE,
    height: MARKER_SIZE,
    borderRadius: MARKER_SIZE / 2,
    borderWidth: 3,
    alignItems: 'center',
    justifyContent: 'center',
  },
  markerCircleSelected: {
    transform: [{ scale: 1.18 }],
  },
  markerEmoji: {
    fontSize: 22,
  },
  markerPill: {
    marginTop: 2,
    paddingHorizontal: 6,
    paddingVertical: 1,
    borderRadius: 999,
    backgroundColor: '#1B1500',
    borderWidth: 1,
    borderColor: 'rgba(255,215,0,0.5)',
  },
  markerPillText: {
    color: colors.granelli,
    fontSize: 10.5,
    fontWeight: '800',
  },
});
