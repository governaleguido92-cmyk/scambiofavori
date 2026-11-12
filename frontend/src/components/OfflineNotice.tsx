import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Animated } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import NetInfo from '@react-native-community/netinfo';
import { tt } from '../i18n/tt';
import { isReducedMotion } from '../utils/reducedMotion';
import colors from '../theme/colors';

interface OfflineNoticeProps {
  onRetry?: () => void;
}

export const OfflineNotice: React.FC<OfflineNoticeProps> = ({ onRetry }) => {
  const [isOffline, setIsOffline] = useState(false);
  const [slideAnim] = useState(new Animated.Value(-100));

  useEffect(() => {
    const unsubscribe = NetInfo.addEventListener(state => {
      const offline = !state.isConnected;
      setIsOffline(offline);
      
      // Con «Riduci animazioni» l'avviso compare subito, senza scivolare
      if (isReducedMotion()) {
        slideAnim.setValue(offline ? 0 : -100);
        return;
      }
      Animated.spring(slideAnim, {
        toValue: offline ? 0 : -100,
        useNativeDriver: true,
        tension: 100,
        friction: 10,
      }).start();
    });

    return () => unsubscribe();
  }, []);

  if (!isOffline) return null;

  return (
    <Animated.View 
      style={[
        styles.container,
        { transform: [{ translateY: slideAnim }] }
      ]}
      data-testid="offline-notice"
    >
      <View style={styles.content}>
        <Ionicons name="cloud-offline" size={20} color={colors.white} />
        <Text style={styles.text}>{tt('Sei offline')}</Text>
      </View>
      {onRetry && (
        <TouchableOpacity style={styles.retryButton} onPress={onRetry}>
          <Ionicons name="refresh" size={16} color={colors.white} />
          <Text style={styles.retryText}>{tt('Riprova')}</Text>
        </TouchableOpacity>
      )}
    </Animated.View>
  );
};

// Componente statico per mostrare errori di rete senza NetInfo
export const NetworkErrorBanner: React.FC<{
  visible: boolean;
  message?: string;
  onRetry?: () => void;
}> = ({ visible, message = 'Connessione persa', onRetry }) => {
  if (!visible) return null;

  return (
    <View style={styles.errorBanner} data-testid="network-error-banner">
      <View style={styles.content}>
        <Ionicons name="warning" size={20} color={colors.white} />
        <Text style={styles.text}>{message}</Text>
      </View>
      {onRetry && (
        <TouchableOpacity style={styles.retryButton} onPress={onRetry}>
          <Ionicons name="refresh" size={16} color={colors.white} />
          <Text style={styles.retryText}>{tt('Riprova')}</Text>
        </TouchableOpacity>
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    backgroundColor: colors.accent,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
    zIndex: 1000,
  },
  errorBanner: {
    backgroundColor: colors.accent,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
    marginBottom: 8,
    borderRadius: 12,
  },
  content: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  text: {
    color: colors.white,
    fontSize: 14,
    fontWeight: '600',
  },
  retryButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: 'rgba(255,255,255,0.2)',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 16,
  },
  retryText: {
    color: colors.white,
    fontSize: 14,
    fontWeight: '500',
  },
});
