import React, { useRef, useState } from 'react';
import { View, Text, StyleSheet, PanResponder, LayoutChangeEvent, AccessibilityActionEvent } from 'react-native';
import colors from '../theme/colors';
import {
  MIN_RADIUS_KM,
  MAX_RADIUS_KM,
  formatRadius,
  positionFromRadius,
  radiusFromPosition,
} from '../utils/radius';

interface RadiusSliderProps {
  /** Raggio attuale in km. */
  valueKm: number;
  onChange: (km: number) => void;
  label: string;
}

const THUMB_SIZE = 26;
const KEYBOARD_STEP = 0.05;

/** Cursore a scala logaritmica da 10 m a 30 km, senza librerie native (funziona anche su web). */
export const RadiusSlider: React.FC<RadiusSliderProps> = ({ valueKm, onChange, label }) => {
  const [trackWidth, setTrackWidth] = useState(0);
  const widthRef = useRef(0);
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;
  const dragStartRef = useRef(0);
  const valueRef = useRef(valueKm);
  valueRef.current = valueKm;

  const emitPosition = (position: number) => onChangeRef.current(radiusFromPosition(position));

  const panResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: () => true,
      onPanResponderTerminationRequest: () => false,
      onPanResponderGrant: (evt) => {
        const width = widthRef.current;
        if (width <= 0) return;
        // Tocco sulla barra: il cursore salta lì, poi si può trascinare.
        const start = Math.min(1, Math.max(0, evt.nativeEvent.locationX / width));
        dragStartRef.current = start;
        emitPosition(start);
      },
      onPanResponderMove: (_evt, gesture) => {
        const width = widthRef.current;
        if (width <= 0) return;
        emitPosition(Math.min(1, Math.max(0, dragStartRef.current + gesture.dx / width)));
      },
    })
  ).current;

  const onLayout = (event: LayoutChangeEvent) => {
    const width = event.nativeEvent.layout.width;
    widthRef.current = width;
    setTrackWidth(width);
  };

  const onAccessibilityAction = (event: AccessibilityActionEvent) => {
    const current = positionFromRadius(valueRef.current);
    if (event.nativeEvent.actionName === 'increment') emitPosition(Math.min(1, current + KEYBOARD_STEP));
    if (event.nativeEvent.actionName === 'decrement') emitPosition(Math.max(0, current - KEYBOARD_STEP));
  };

  const position = positionFromRadius(valueKm);
  const thumbLeft = Math.max(0, position * trackWidth - THUMB_SIZE / 2);

  return (
    <View style={styles.container}>
      <View style={styles.headerRow}>
        <Text style={styles.label}>{label}</Text>
        <Text style={styles.value}>{formatRadius(valueKm)}</Text>
      </View>
      <View
        style={styles.touchArea}
        onLayout={onLayout}
        {...panResponder.panHandlers}
        accessible
        accessibilityRole="adjustable"
        accessibilityLabel={label}
        accessibilityValue={{ text: formatRadius(valueKm) }}
        accessibilityActions={[{ name: 'increment' }, { name: 'decrement' }]}
        onAccessibilityAction={onAccessibilityAction}
      >
        <View style={styles.track} pointerEvents="none" />
        <View style={[styles.fill, { width: Math.max(0, position * trackWidth) }]} pointerEvents="none" />
        <View style={[styles.thumb, { left: thumbLeft }]} pointerEvents="none" />
      </View>
      <View style={styles.scaleRow}>
        <Text style={styles.scaleText}>{formatRadius(MIN_RADIUS_KM)}</Text>
        <Text style={styles.scaleText}>{formatRadius(MAX_RADIUS_KM)}</Text>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    marginHorizontal: 20,
    marginBottom: 12,
    paddingHorizontal: 14,
    paddingTop: 10,
    paddingBottom: 8,
    borderRadius: 14,
    backgroundColor: colors.backgroundCard,
    borderWidth: 1,
    borderColor: colors.border,
  },
  headerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  label: {
    color: colors.textSecondary,
    fontSize: 13,
    fontWeight: '600',
  },
  value: {
    color: colors.lime,
    fontSize: 16,
    fontWeight: '800',
  },
  touchArea: {
    height: 40,
    justifyContent: 'center',
  },
  track: {
    height: 6,
    borderRadius: 3,
    backgroundColor: colors.backgroundLight,
  },
  fill: {
    position: 'absolute',
    left: 0,
    height: 6,
    borderRadius: 3,
    backgroundColor: colors.accent,
  },
  thumb: {
    position: 'absolute',
    top: 7,
    width: THUMB_SIZE,
    height: THUMB_SIZE,
    borderRadius: THUMB_SIZE / 2,
    backgroundColor: '#fff',
    borderWidth: 3,
    borderColor: colors.accent,
  },
  scaleRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  scaleText: {
    color: colors.textMuted,
    fontSize: 11,
  },
});
