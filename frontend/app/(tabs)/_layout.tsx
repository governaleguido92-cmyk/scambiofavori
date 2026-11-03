import React, { useEffect } from 'react';
import { Tabs, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { Platform, View, StyleSheet } from 'react-native';
import { useAuth } from '../../src/context/AuthContext';
import colors from '../../src/theme/colors';
import { tt } from '../../src/i18n/tt';
import { useMessages } from '../../src/context/MessagesContext';


export default function TabsLayout() {
  const { user, loading } = useAuth();
  const { unread } = useMessages();
  const router = useRouter();

  // Redirect to login when user logs out
  useEffect(() => {
    if (!loading && !user) {
      router.replace('/(auth)/login');
    }
  }, [user, loading]);

  // Don't render tabs if no user
  if (!user) return null;

  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: colors.lime,
        tabBarInactiveTintColor: colors.textSecondary,
        tabBarStyle: {
          backgroundColor: colors.backgroundCard,
          borderTopWidth: 0,
          elevation: 0,
          height: Platform.OS === 'ios' ? 90 : 70,
          paddingBottom: Platform.OS === 'ios' ? 30 : 10,
          paddingTop: 10,
        },
        // Etichetta sempre sotto l'icona: su web, di default, finisce accanto e il tasto Crea risulta fuori asse.
        tabBarLabelPosition: 'below-icon',
        tabBarLabelStyle: {
          fontSize: 12,
          fontWeight: '600',
        },
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          title: tt('Home'),
          tabBarIcon: ({ color, size }) => (
            <Ionicons name="heart" size={size} color={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="map"
        options={{
          title: tt('Mappa'),
          tabBarIcon: ({ color, size }) => (
            <Ionicons name="people" size={size} color={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="create"
        options={{
          title: tt('Crea'),
          tabBarIcon: ({ color, size }) => (
            <View style={styles.createButton}>
              <Ionicons name="heart" size={28} color="#fff" />
            </View>
          ),
        }}
      />
      <Tabs.Screen
        name="my-favors"
        options={{
          title: tt('I Miei'),
          tabBarBadge: unread > 0 ? (unread > 99 ? '99+' : unread) : undefined,
          tabBarBadgeStyle: { backgroundColor: colors.accent, color: colors.background, fontWeight: '900' },
          tabBarIcon: ({ color, size }) => (
            <Ionicons name="heart-half" size={size} color={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="profile"
        options={{
          title: tt('Profilo'),
          tabBarIcon: ({ color, size }) => (
            <Ionicons name="home" size={size} color={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="oggettoteca"
        options={{
          href: null, // Hide from tab bar
        }}
      />
    </Tabs>
  );
}

const styles = StyleSheet.create({
  // Il cerchio sporge sopra la barra: 54 px di altezza meno 30 di margine = 24 px, come le altre icone,
  // così l'etichetta "Crea" resta sulla stessa riga delle altre voci.
  createButton: {
    backgroundColor: colors.accent,
    width: 54,
    height: 54,
    borderRadius: 27,
    marginTop: -30,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 4,
    borderColor: colors.background,
    shadowColor: colors.accent,
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.4,
    shadowRadius: 6,
    elevation: 6,
  },
});
