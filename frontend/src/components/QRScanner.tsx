import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Platform } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

// Platform-specific camera import
let CameraComponent: React.ComponentType<any> | null = null;
let useCameraPermissionsHook: (() => [any, () => Promise<any>]) | null = null;

if (Platform.OS !== 'web') {
  try {
    const ExpoCamera = require('expo-camera');
    CameraComponent = ExpoCamera.CameraView;
    useCameraPermissionsHook = ExpoCamera.useCameraPermissions;
  } catch (e) {
    console.log('expo-camera not available');
  }
}

interface QRScannerProps {
  onBarcodeScanned: (data: { data: string }) => void;
  scanningComplete: boolean;
}

// Hook sempre chiamato incondizionatamente — regola React Hooks
const _noop = () => [{ granted: false }, async () => ({ granted: false })] as const;
const _activeHook = useCameraPermissionsHook ?? _noop;

export function useQRPermissions() {
  // eslint-disable-next-line react-hooks/rules-of-hooks
  return _activeHook();
}

export function QRScanner({ onBarcodeScanned, scanningComplete }: QRScannerProps) {
  if (Platform.OS === 'web' || !CameraComponent) {
    return (
      <View style={styles.placeholder}>
        <Ionicons name="qr-code-outline" size={64} color="#666" />
        <Text style={styles.placeholderText}>
          Scanner QR non disponibile su questa piattaforma
        </Text>
        <Text style={styles.placeholderSubtext}>
          Usa l'app su iOS o Android per scansionare
        </Text>
      </View>
    );
  }

  const Camera = CameraComponent;
  
  return (
    <Camera
      style={styles.camera}
      barcodeScannerSettings={{
        barcodeTypes: ['qr'],
      }}
      onBarcodeScanned={scanningComplete ? undefined : onBarcodeScanned}
    />
  );
}

export function isCameraAvailable() {
  return Platform.OS !== 'web' && CameraComponent !== null;
}

const styles = StyleSheet.create({
  camera: {
    flex: 1,
  },
  placeholder: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#1a1a2e',
    padding: 20,
  },
  placeholderText: {
    color: '#888',
    fontSize: 16,
    textAlign: 'center',
    marginTop: 16,
  },
  placeholderSubtext: {
    color: '#666',
    fontSize: 14,
    textAlign: 'center',
    marginTop: 8,
  },
});
