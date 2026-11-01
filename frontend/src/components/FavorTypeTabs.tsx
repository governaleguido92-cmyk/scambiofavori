import React from 'react';
import { View, Text, TouchableOpacity } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import colors from '../theme/colors';
import { styles } from '../styles/home.styles';
import { tt } from '../i18n/tt';

export type FavorType = 'request' | 'offer';

interface FavorTypeTabsProps {
  value: FavorType;
  onChange: (type: FavorType) => void;
}

/** Due schede grandi, Richieste e Offerte di favori, sempre separate, con la riga che spiega cosa fare. */
export const FavorTypeTabs: React.FC<FavorTypeTabsProps> = ({ value, onChange }) => (
  <>
    <View style={styles.typeFilter}>
      {(['request', 'offer'] as const).map((type) => {
        const active = value === type;
        return (
          <TouchableOpacity
            key={type}
            style={[
              styles.typeButton,
              active && (type === 'offer' ? styles.typeButtonActiveOffer : styles.typeButtonActiveRequest),
            ]}
            onPress={() => onChange(type)}
            accessibilityRole="tab"
            accessibilityState={{ selected: active }}
          >
            <Text style={[styles.typeButtonText, active && styles.typeButtonTextActive]}>
              {type === 'offer' ? tt('Offerte di favori') : tt('Richieste di favori')}
            </Text>
          </TouchableOpacity>
        );
      })}
    </View>

    <View style={[styles.typeHintBox, value === 'offer' ? styles.typeHintBoxOffer : styles.typeHintBoxRequest]}>
      <Ionicons
        name={value === 'offer' ? 'search' : 'hand-left'}
        size={20}
        color={value === 'offer' ? '#5FBF7F' : colors.accentLight}
      />
      <Text style={styles.typeHintText}>
        {value === 'request'
          ? tt('Aiuta un vicino e guadagni Granelli')
          : tt('Trova chi ha tempo per te e usa i tuoi Granelli')}
      </Text>
    </View>
  </>
);
