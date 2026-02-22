import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  ActivityIndicator,
  Alert,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import * as Location from 'expo-location';
import { useAuth } from '../../src/context/AuthContext';
import { api, Category } from '../../src/services/api';

const CATEGORY_ICONS: Record<string, string> = {
  'Trasporto': 'car',
  'Spesa': 'cart',
  'Tecnologia': 'laptop',
  'Pulizie': 'water',
  'Compagnia': 'people',
  'Cucina': 'restaurant',
  'Giardinaggio': 'leaf',
  'Altro': 'ellipsis-horizontal',
};

export default function CreateFavorScreen() {
  const { user, token, refreshUser } = useAuth();
  const router = useRouter();
  const [type, setType] = useState<'offer' | 'request'>('offer');
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [category, setCategory] = useState('');
  const [credits, setCredits] = useState('1');
  const [address, setAddress] = useState('');
  const [categories, setCategories] = useState<Category[]>([]);
  const [location, setLocation] = useState<{ latitude: number; longitude: number } | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [gettingLocation, setGettingLocation] = useState(false);

  useEffect(() => {
    loadCategories();
  }, []);

  const loadCategories = async () => {
    try {
      const data = await api.getCategories();
      setCategories(data);
      if (data.length > 0) setCategory(data[0].name);
    } catch (error) {
      console.log('Error loading categories:', error);
    }
  };

  const getLocation = async () => {
    setGettingLocation(true);
    try {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== 'granted') {
        Alert.alert('Permesso negato', 'Abilita la localizzazione per aggiungere la posizione');
        return;
      }

      const loc = await Location.getCurrentPositionAsync({});
      setLocation({
        latitude: loc.coords.latitude,
        longitude: loc.coords.longitude,
      });

      // Try to get address
      try {
        const [addr] = await Location.reverseGeocodeAsync({
          latitude: loc.coords.latitude,
          longitude: loc.coords.longitude,
        });
        if (addr) {
          setAddress(`${addr.street || ''} ${addr.streetNumber || ''}, ${addr.city || ''}`.trim());
        }
      } catch {
        setAddress('Posizione attuale');
      }
    } catch (error) {
      Alert.alert('Errore', 'Impossibile ottenere la posizione');
    } finally {
      setGettingLocation(false);
    }
  };

  const handleCreate = async () => {
    if (!title.trim()) {
      Alert.alert('Errore', 'Inserisci un titolo');
      return;
    }
    if (!description.trim()) {
      Alert.alert('Errore', 'Inserisci una descrizione');
      return;
    }
    if (!category) {
      Alert.alert('Errore', 'Seleziona una categoria');
      return;
    }

    const creditsNum = parseInt(credits) || 1;
    if (type === 'request' && (user?.credits || 0) < creditsNum) {
      Alert.alert('Crediti insufficienti', `Hai solo ${user?.credits} crediti disponibili`);
      return;
    }

    if (!token) return;

    setIsLoading(true);
    try {
      await api.createFavor(
        {
          type,
          title: title.trim(),
          description: description.trim(),
          category,
          credits_cost: creditsNum,
          latitude: location?.latitude,
          longitude: location?.longitude,
          address: address || undefined,
        },
        token
      );

      await refreshUser();
      
      Alert.alert(
        'Successo',
        type === 'offer' ? 'La tua offerta è stata pubblicata!' : 'La tua richiesta è stata pubblicata!',
        [
          {
            text: 'OK',
            onPress: () => {
              // Reset form
              setTitle('');
              setDescription('');
              setCredits('1');
              setAddress('');
              setLocation(null);
              router.push('/(tabs)');
            },
          },
        ]
      );
    } catch (error: any) {
      Alert.alert('Errore', error.message || 'Impossibile creare il favore');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <SafeAreaView style={styles.container}>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        style={styles.keyboardView}
      >
        <ScrollView
          contentContainerStyle={styles.scrollContent}
          keyboardShouldPersistTaps="handled"
        >
          <View style={styles.header}>
            <Text style={styles.title}>Crea Favore</Text>
            <View style={styles.creditsDisplay}>
              <Ionicons name="star" size={16} color="#ffd700" />
              <Text style={styles.creditsValue}>{user?.credits || 0}</Text>
            </View>
          </View>

          {/* Type Selector */}
          <View style={styles.typeSelector}>
            <TouchableOpacity
              style={[styles.typeButton, type === 'offer' && styles.typeButtonActive]}
              onPress={() => setType('offer')}
            >
              <Ionicons
                name="gift"
                size={24}
                color={type === 'offer' ? '#1a1a2e' : '#4ecca3'}
              />
              <Text style={[styles.typeButtonText, type === 'offer' && styles.typeButtonTextActive]}>
                Offri
              </Text>
              <Text style={[styles.typeButtonSubtext, type === 'offer' && styles.typeButtonSubtextActive]}>
                Guadagna crediti
              </Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.typeButton, type === 'request' && styles.typeButtonActiveRequest]}
              onPress={() => setType('request')}
            >
              <Ionicons
                name="hand-left"
                size={24}
                color={type === 'request' ? '#1a1a2e' : '#ff6b6b'}
              />
              <Text style={[styles.typeButtonText, type === 'request' && styles.typeButtonTextActive]}>
                Richiedi
              </Text>
              <Text style={[styles.typeButtonSubtext, type === 'request' && styles.typeButtonSubtextActive]}>
                Spendi crediti
              </Text>
            </TouchableOpacity>
          </View>

          {/* Title Input */}
          <View style={styles.inputGroup}>
            <Text style={styles.label}>Titolo</Text>
            <TextInput
              style={styles.input}
              placeholder="Es: Aiuto con la spesa"
              placeholderTextColor="#666"
              value={title}
              onChangeText={setTitle}
              maxLength={100}
            />
          </View>

          {/* Description Input */}
          <View style={styles.inputGroup}>
            <Text style={styles.label}>Descrizione</Text>
            <TextInput
              style={[styles.input, styles.textArea]}
              placeholder="Descrivi il favore in dettaglio..."
              placeholderTextColor="#666"
              value={description}
              onChangeText={setDescription}
              multiline
              numberOfLines={4}
              textAlignVertical="top"
              maxLength={500}
            />
          </View>

          {/* Category Selector */}
          <View style={styles.inputGroup}>
            <Text style={styles.label}>Categoria</Text>
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              style={styles.categoriesScroll}
            >
              {categories.map((cat) => (
                <TouchableOpacity
                  key={cat.name}
                  style={[styles.categoryChip, category === cat.name && styles.categoryChipActive]}
                  onPress={() => setCategory(cat.name)}
                >
                  <Ionicons
                    name={(CATEGORY_ICONS[cat.name] || 'ellipsis-horizontal') as any}
                    size={18}
                    color={category === cat.name ? '#1a1a2e' : '#4ecca3'}
                  />
                  <Text style={[styles.categoryChipText, category === cat.name && styles.categoryChipTextActive]}>
                    {cat.name}
                  </Text>
                </TouchableOpacity>
              ))}
            </ScrollView>
          </View>

          {/* Credits Input */}
          <View style={styles.inputGroup}>
            <Text style={styles.label}>Crediti</Text>
            <View style={styles.creditsInput}>
              <TouchableOpacity
                style={styles.creditButton}
                onPress={() => setCredits(String(Math.max(1, parseInt(credits) - 1)))}
              >
                <Ionicons name="remove" size={24} color="#fff" />
              </TouchableOpacity>
              <TextInput
                style={styles.creditValue}
                value={credits}
                onChangeText={(text) => setCredits(text.replace(/[^0-9]/g, ''))}
                keyboardType="number-pad"
                maxLength={2}
              />
              <TouchableOpacity
                style={styles.creditButton}
                onPress={() => setCredits(String(parseInt(credits) + 1))}
              >
                <Ionicons name="add" size={24} color="#fff" />
              </TouchableOpacity>
            </View>
            {type === 'request' && (
              <Text style={styles.creditsWarning}>
                Verranno scalati {credits} crediti al completamento
              </Text>
            )}
          </View>

          {/* Location */}
          <View style={styles.inputGroup}>
            <Text style={styles.label}>Posizione (opzionale)</Text>
            <TouchableOpacity
              style={styles.locationButton}
              onPress={getLocation}
              disabled={gettingLocation}
            >
              {gettingLocation ? (
                <ActivityIndicator size="small" color="#4ecca3" />
              ) : (
                <>
                  <Ionicons name="location" size={20} color="#4ecca3" />
                  <Text style={styles.locationButtonText}>
                    {location ? 'Cambia posizione' : 'Aggiungi posizione'}
                  </Text>
                </>
              )}
            </TouchableOpacity>
            {address && (
              <View style={styles.addressContainer}>
                <Ionicons name="checkmark-circle" size={16} color="#4ecca3" />
                <Text style={styles.addressText}>{address}</Text>
              </View>
            )}
          </View>

          {/* Submit Button */}
          <TouchableOpacity
            style={[styles.submitButton, type === 'request' && styles.submitButtonRequest]}
            onPress={handleCreate}
            disabled={isLoading}
          >
            {isLoading ? (
              <ActivityIndicator color="#1a1a2e" />
            ) : (
              <>
                <Ionicons
                  name={type === 'offer' ? 'gift' : 'hand-left'}
                  size={20}
                  color="#1a1a2e"
                />
                <Text style={styles.submitButtonText}>
                  {type === 'offer' ? 'Pubblica Offerta' : 'Pubblica Richiesta'}
                </Text>
              </>
            )}
          </TouchableOpacity>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#1a1a2e',
  },
  keyboardView: {
    flex: 1,
  },
  scrollContent: {
    padding: 20,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 24,
  },
  title: {
    fontSize: 28,
    fontWeight: 'bold',
    color: '#fff',
  },
  creditsDisplay: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#16213e',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 16,
    gap: 6,
  },
  creditsValue: {
    color: '#ffd700',
    fontSize: 16,
    fontWeight: 'bold',
  },
  typeSelector: {
    flexDirection: 'row',
    gap: 12,
    marginBottom: 24,
  },
  typeButton: {
    flex: 1,
    backgroundColor: '#16213e',
    borderRadius: 16,
    padding: 16,
    alignItems: 'center',
    borderWidth: 2,
    borderColor: 'transparent',
  },
  typeButtonActive: {
    backgroundColor: '#4ecca3',
    borderColor: '#4ecca3',
  },
  typeButtonActiveRequest: {
    backgroundColor: '#ff6b6b',
    borderColor: '#ff6b6b',
  },
  typeButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: 'bold',
    marginTop: 8,
  },
  typeButtonTextActive: {
    color: '#1a1a2e',
  },
  typeButtonSubtext: {
    color: '#888',
    fontSize: 12,
    marginTop: 4,
  },
  typeButtonSubtextActive: {
    color: '#1a1a2e',
    opacity: 0.8,
  },
  inputGroup: {
    marginBottom: 20,
  },
  label: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
    marginBottom: 8,
  },
  input: {
    backgroundColor: '#16213e',
    borderRadius: 12,
    padding: 16,
    color: '#fff',
    fontSize: 16,
  },
  textArea: {
    height: 120,
    paddingTop: 16,
  },
  categoriesScroll: {
    flexDirection: 'row',
  },
  categoryChip: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#16213e',
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 20,
    marginRight: 10,
    gap: 8,
  },
  categoryChipActive: {
    backgroundColor: '#4ecca3',
  },
  categoryChipText: {
    color: '#888',
    fontSize: 14,
  },
  categoryChipTextActive: {
    color: '#1a1a2e',
    fontWeight: '600',
  },
  creditsInput: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 20,
  },
  creditButton: {
    backgroundColor: '#16213e',
    width: 50,
    height: 50,
    borderRadius: 25,
    justifyContent: 'center',
    alignItems: 'center',
  },
  creditValue: {
    backgroundColor: '#16213e',
    color: '#ffd700',
    fontSize: 24,
    fontWeight: 'bold',
    textAlign: 'center',
    width: 80,
    paddingVertical: 12,
    borderRadius: 12,
  },
  creditsWarning: {
    color: '#ff6b6b',
    fontSize: 12,
    textAlign: 'center',
    marginTop: 8,
  },
  locationButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#16213e',
    padding: 16,
    borderRadius: 12,
    gap: 8,
  },
  locationButtonText: {
    color: '#4ecca3',
    fontSize: 16,
    fontWeight: '600',
  },
  addressContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 8,
    gap: 8,
  },
  addressText: {
    color: '#888',
    fontSize: 14,
    flex: 1,
  },
  submitButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#4ecca3',
    padding: 18,
    borderRadius: 16,
    gap: 10,
    marginTop: 16,
  },
  submitButtonRequest: {
    backgroundColor: '#ff6b6b',
  },
  submitButtonText: {
    color: '#1a1a2e',
    fontSize: 18,
    fontWeight: 'bold',
  },
});
