import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Linking } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import colors from '../../theme/colors';
import { tt } from '../../i18n/tt';
import { MeetingPoint, mapsSearchUrl } from '../../utils/meetingPoint';

interface MeetingPointCardProps {
  point: MeetingPoint;
  time: string;
}

/** Il punto d'incontro come scheda: luogo e orario ben visibili e un tocco per cercarlo sulle mappe. */
export function MeetingPointCard({ point, time }: MeetingPointCardProps) {
  return (
    <View>
      <View style={styles.labelRow}>
        <Ionicons name="location" size={15} color={colors.accent} />
        <Text style={styles.label}>{tt('Punto d\'incontro')}</Text>
      </View>
      <Text style={styles.place}>{point.place}</Text>
      {point.when && (
        <View style={styles.whenRow}>
          <Ionicons name="time-outline" size={15} color={colors.lime} />
          <Text style={styles.when}>{point.when}</Text>
        </View>
      )}
      <TouchableOpacity
        style={styles.mapsButton}
        onPress={() => Linking.openURL(mapsSearchUrl(point.place))}
        accessibilityRole="link"
        accessibilityLabel={tt('Cerca sulle mappe')}
      >
        <Ionicons name="map-outline" size={15} color={colors.lime} />
        <Text style={styles.mapsText}>{tt('Cerca sulle mappe')}</Text>
      </TouchableOpacity>
      <Text style={styles.time}>{time}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  labelRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 4 },
  label: { color: colors.accent, fontSize: 11.5, fontWeight: '800', letterSpacing: 0.4, textTransform: 'uppercase' },
  place: { color: colors.textPrimary, fontSize: 16, fontWeight: '800', lineHeight: 21 },
  whenRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 4 },
  when: { color: colors.lime, fontSize: 14, fontWeight: '700' },
  mapsButton: {
    flexDirection: 'row', alignItems: 'center', gap: 6, alignSelf: 'flex-start', marginTop: 10,
    paddingHorizontal: 10, paddingVertical: 6, borderRadius: 10, backgroundColor: 'rgba(0,0,0,0.25)',
  },
  mapsText: { color: colors.lime, fontSize: 12.5, fontWeight: '700' },
  time: { color: colors.textMuted, fontSize: 11, marginTop: 6, alignSelf: 'flex-end' },
});
