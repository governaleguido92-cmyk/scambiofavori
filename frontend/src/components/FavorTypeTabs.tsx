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
  /** Nasconde la riga che spiega cosa fare (per le schermate essenziali). */
  hideHint?: boolean;
}

/** Due schede grandi, Dona un favore e Ricevi un favore, sempre separate, con la riga che spiega cosa fare. */
export const FavorTypeTabs: React.FC<FavorTypeTabsProps> = ({ value, onChange, hideHint }) => (
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
              {type === 'offer' ? tt('Ricevi un favore') : tt('Dona un favore')}
            </Text>
          </TouchableOpacity>
        );
      })}
    </View>

    {!hideHint && (
    <View style={[styles.typeHintBox, value === 'offer' ? styles.typeHintBoxOffer : styles.typeHintBoxRequest]}>
      <Ionicons
        name={value === 'offer' ? 'hand-left' : 'gift'}
        size={20}
        color={value === 'offer' ? '#98AA4A' : colors.accentLight}
      />
      <Text style={styles.typeHintText}>
        {value === 'request'
          ? tt('Aiuta un vicino (es. portare la spesa) e guadagni Granelli')
          : tt('Chiedi una mano a chi ha tempo (es. un passaggio): spendi i tuoi Granelli')}
      </Text>
    </View>
    )}
  </>
);
