import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TouchableOpacity,
  RefreshControl,
  ActivityIndicator,
  Alert,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter, useFocusEffect } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useAuth } from '../../src/context/AuthContext';
import { api, Favor, CURRENCY_NAME, CURRENCY_SYMBOL } from '../../src/services/api';

export default function MyFavorsScreen() {
  const { user, token, refreshUser } = useAuth();
  const router = useRouter();
  const [favors, setFavors] = useState<Favor[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [filter, setFilter] = useState<'all' | 'created' | 'accepted'>('all');

  const loadMyFavors = useCallback(async () => {
    if (!token) return;
    try {
      const data = await api.getMyFavors(token);
      setFavors(data);
    } catch (error) {
      console.log('Error loading my favors:', error);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [token]);

  useFocusEffect(
    useCallback(() => {
      loadMyFavors();
    }, [loadMyFavors])
  );

  const onRefresh = () => {
    setRefreshing(true);
    loadMyFavors();
  };

  const handleComplete = async (favorId: string) => {
    if (!token) return;
    Alert.alert(
      'Conferma Completamento',
      `Sei sicuro di voler segnare questo favore come completato? I ${CURRENCY_NAME} verranno trasferiti.`,
      [
        { text: 'Annulla', style: 'cancel' },
        {
          text: 'Completa',
          onPress: async () => {
            try {
              await api.completeFavor(favorId, token);
              await refreshUser();
              loadMyFavors();
              Alert.alert('Successo', `Favore completato! I ${CURRENCY_NAME} sono stati trasferiti.`);
            } catch (error: any) {
              Alert.alert('Errore', error.message || 'Impossibile completare il favore');
            }
          },
        },
      ]
    );
  };

  const handleCancel = async (favorId: string) => {
    if (!token) return;
    Alert.alert(
      'Cancella Favore',
      'Sei sicuro di voler cancellare questo favore?',
      [
        { text: 'No', style: 'cancel' },
        {
          text: 'Sì, cancella',
          style: 'destructive',
          onPress: async () => {
            try {
              await api.cancelFavor(favorId, token);
              loadMyFavors();
            } catch (error: any) {
              Alert.alert('Errore', error.message || 'Impossibile cancellare il favore');
            }
          },
        },
      ]
    );
  };

  const filteredFavors = favors.filter((favor) => {
    if (filter === 'created') return favor.creator_id === user?.user_id;
    if (filter === 'accepted') return favor.accepted_by === user?.user_id;
    return true;
  });

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'active':
        return '#4ecca3';
      case 'accepted':
        return '#ffd700';
      case 'completed':
        return '#4caf50';
      case 'cancelled':
        return '#ff6b6b';
      default:
        return '#888';
    }
  };

  const getStatusText = (status: string) => {
    switch (status) {
      case 'active':
        return 'Attivo';
      case 'accepted':
        return 'Accettato';
      case 'completed':
        return 'Completato';
      case 'cancelled':
        return 'Cancellato';
      default:
        return status;
    }
  };

  const renderFavorCard = ({ item }: { item: Favor }) => {
    const isCreator = item.creator_id === user?.user_id;
    const isAccepter = item.accepted_by === user?.user_id;

    return (
      <TouchableOpacity
        style={styles.favorCard}
        onPress={() => router.push(`/favor/${item.favor_id}`)}
      >
        <View style={styles.favorHeader}>
          <View style={[styles.statusBadge, { backgroundColor: getStatusColor(item.status) + '30' }]}>
            <View style={[styles.statusDot, { backgroundColor: getStatusColor(item.status) }]} />
            <Text style={[styles.statusText, { color: getStatusColor(item.status) }]}>
              {getStatusText(item.status)}
            </Text>
          </View>
          <View style={styles.badgesRow}>
            {item.is_emergency && (
              <View style={styles.emergencyBadge}>
                <Ionicons name="alert-circle" size={12} color="#ff6b6b" />
              </View>
            )}
            {item.is_micro && (
              <View style={styles.microBadge}>
                <Ionicons name="flash" size={12} color="#ff9800" />
              </View>
            )}
            <View style={[styles.typeBadge, item.type === 'offer' ? styles.offerBadge : styles.requestBadge]}>
              <Text style={styles.typeText}>
                {item.type === 'offer' ? 'Offerta' : 'Richiesta'}
              </Text>
            </View>
          </View>
        </View>

        <Text style={styles.favorTitle}>{item.title}</Text>
        <Text style={styles.favorDescription} numberOfLines={2}>
          {item.description}
        </Text>

        <View style={styles.roleContainer}>
          <Ionicons
            name={isCreator ? 'create' : 'hand-left'}
            size={14}
            color="#888"
          />
          <Text style={styles.roleText}>
            {isCreator ? 'Creato da te' : `Accettato da ${item.creator_name}`}
          </Text>
        </View>

        <View style={styles.favorFooter}>
          <View style={styles.soliContainer}>
            <Text style={styles.soliSymbol}>{CURRENCY_SYMBOL}</Text>
            <Text style={styles.soliText}>{item.granelli_cost} {CURRENCY_NAME}</Text>
          </View>

          {/* Actions */}
          <View style={styles.actionsContainer}>
            {item.status === 'accepted' && isCreator && (
              <TouchableOpacity
                style={styles.completeButton}
                onPress={() => handleComplete(item.favor_id)}
              >
                <Ionicons name="checkmark-circle" size={18} color="#fff" />
                <Text style={styles.completeButtonText}>Completa</Text>
              </TouchableOpacity>
            )}
            {item.status === 'active' && isCreator && (
              <TouchableOpacity
                style={styles.cancelButton}
                onPress={() => handleCancel(item.favor_id)}
              >
                <Ionicons name="close-circle" size={18} color="#ff6b6b" />
              </TouchableOpacity>
            )}
          </View>
        </View>

        {item.accepted_by_name && (
          <View style={styles.acceptedByContainer}>
            <Ionicons name="person" size={14} color="#4ecca3" />
            <Text style={styles.acceptedByText}>
              Accettato da: {item.accepted_by_name}
            </Text>
          </View>
        )}
      </TouchableOpacity>
    );
  };

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title}>I Miei Favori</Text>
      </View>

      <View style={styles.filterContainer}>
        {(['all', 'created', 'accepted'] as const).map((f) => (
          <TouchableOpacity
            key={f}
            style={[styles.filterButton, filter === f && styles.filterButtonActive]}
            onPress={() => setFilter(f)}
          >
            <Text style={[styles.filterButtonText, filter === f && styles.filterButtonTextActive]}>
              {f === 'all' ? 'Tutti' : f === 'created' ? 'Creati' : 'Accettati'}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      {loading ? (
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color="#4ecca3" />
        </View>
      ) : filteredFavors.length === 0 ? (
        <View style={styles.emptyContainer}>
          <Ionicons name="folder-open" size={60} color="#333" />
          <Text style={styles.emptyText}>Nessun favore</Text>
          <Text style={styles.emptySubtext}>
            {filter === 'all'
              ? 'Non hai ancora creato o accettato favori'
              : filter === 'created'
              ? 'Non hai ancora creato favori'
              : 'Non hai ancora accettato favori'}
          </Text>
        </View>
      ) : (
        <FlatList
          data={filteredFavors}
          renderItem={renderFavorCard}
          keyExtractor={(item) => item.favor_id}
          contentContainerStyle={styles.listContent}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#4ecca3" />
          }
        />
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#1a1a2e',
  },
  header: {
    paddingHorizontal: 20,
    paddingTop: 16,
    paddingBottom: 8,
  },
  title: {
    fontSize: 28,
    fontWeight: 'bold',
    color: '#fff',
  },
  filterContainer: {
    flexDirection: 'row',
    paddingHorizontal: 20,
    gap: 12,
    marginTop: 16,
  },
  filterButton: {
    paddingHorizontal: 20,
    paddingVertical: 10,
    borderRadius: 20,
    backgroundColor: '#16213e',
  },
  filterButtonActive: {
    backgroundColor: '#4ecca3',
  },
  filterButtonText: {
    color: '#888',
    fontWeight: '600',
  },
  filterButtonTextActive: {
    color: '#1a1a2e',
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  emptyContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  emptyText: {
    color: '#888',
    fontSize: 18,
    marginTop: 16,
  },
  emptySubtext: {
    color: '#666',
    fontSize: 14,
    marginTop: 4,
    textAlign: 'center',
    paddingHorizontal: 40,
  },
  listContent: {
    padding: 20,
    paddingTop: 16,
  },
  favorCard: {
    backgroundColor: '#16213e',
    borderRadius: 16,
    padding: 16,
    marginBottom: 16,
  },
  favorHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  statusBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
    gap: 6,
  },
  statusDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  statusText: {
    fontSize: 12,
    fontWeight: '600',
  },
  badgesRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  emergencyBadge: {
    backgroundColor: 'rgba(255, 107, 107, 0.2)',
    padding: 4,
    borderRadius: 8,
  },
  microBadge: {
    backgroundColor: 'rgba(255, 152, 0, 0.2)',
    padding: 4,
    borderRadius: 8,
  },
  typeBadge: {
    paddingHorizontal: 12,
    paddingVertical: 4,
    borderRadius: 12,
  },
  offerBadge: {
    backgroundColor: 'rgba(78, 204, 163, 0.2)',
  },
  requestBadge: {
    backgroundColor: 'rgba(255, 107, 107, 0.2)',
  },
  typeText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#fff',
  },
  favorTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#fff',
    marginBottom: 8,
  },
  favorDescription: {
    fontSize: 14,
    color: '#888',
    lineHeight: 20,
    marginBottom: 8,
  },
  roleContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: 12,
  },
  roleText: {
    color: '#888',
    fontSize: 12,
  },
  favorFooter: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  soliContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  soliSymbol: {
    fontSize: 16,
  },
  soliText: {
    color: '#ffd700',
    fontSize: 14,
    fontWeight: 'bold',
  },
  actionsContainer: {
    flexDirection: 'row',
    gap: 12,
  },
  completeButton: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#4ecca3',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 12,
    gap: 4,
  },
  completeButtonText: {
    color: '#fff',
    fontSize: 12,
    fontWeight: '600',
  },
  cancelButton: {
    padding: 6,
  },
  acceptedByContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: 12,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: '#333',
  },
  acceptedByText: {
    color: '#4ecca3',
    fontSize: 12,
  },
});
