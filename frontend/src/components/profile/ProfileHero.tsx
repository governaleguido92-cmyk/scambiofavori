import React, { useState } from 'react';
import { View, Text, TouchableOpacity, TextInput, Image, ActivityIndicator, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { getImageUrl, User } from '../../services/api';
import { SupporterProfileBorder, SupporterBadge } from '../SupporterBadge';
import { styles } from '../../styles/profile.styles';
import { tt } from '../../i18n/tt';
import { communityProgress, hasRatings, socialImpact } from '../../utils/profileProgress';

const NAME_MIN = 2;
const NAME_MAX = 50;

interface ProfileHeroProps {
  user: User | null;
  /** Foto appena scelta, mostrata subito mentre si carica. */
  profileImage: string | null;
  uploadingImage: boolean;
  onPickImage: () => void;
  /** Salva il nome; restituisce true se è andata a buon fine. */
  onSaveName: (name: string) => Promise<boolean>;
}

const Stars = ({ value }: { value: number }) => (
  <View style={styles.starsRow}>
    {[1, 2, 3, 4, 5].map((star) => (
      <Ionicons key={star} name={star <= value ? 'star' : 'star-outline'} size={16} color="#ffd700" />
    ))}
  </View>
);

/** Foto, nome, livello e barre di avanzamento. Le stelle compaiono solo quando esiste almeno una valutazione. */
export function ProfileHero({ user, profileImage, uploadingImage, onPickImage, onSaveName }: ProfileHeroProps) {
  const [editingName, setEditingName] = useState(false);
  const [newName, setNewName] = useState('');
  const [savingName, setSavingName] = useState(false);

  const { level, progress, remaining } = communityProgress(user?.community_score || 0);
  const impactScore = user?.social_impact_score || 0;
  const impact = socialImpact(impactScore);
  const trimmed = newName.trim();
  const canSaveName = trimmed.length >= NAME_MIN && trimmed !== user?.name && !savingName;

  const startEditing = () => {
    setNewName(user?.name || '');
    setEditingName(true);
  };

  const saveName = async () => {
    if (!canSaveName) return;
    setSavingName(true);
    const saved = await onSaveName(trimmed);
    setSavingName(false);
    if (saved) setEditingName(false);
  };

  return (
    <View style={styles.profileCard}>
      <View style={styles.avatarContainer}>
        <TouchableOpacity
          onPress={onPickImage}
          disabled={uploadingImage}
          accessibilityRole="button"
          accessibilityLabel={tt('Cambia la foto del profilo')}
        >
          <SupporterProfileBorder isSupporter={user?.is_supporter || false} size={80}>
            {profileImage || user?.picture ? (
              <Image source={{ uri: profileImage || getImageUrl(user?.picture) }} style={styles.avatarImage} />
            ) : (
              <View style={styles.avatar}>
                <Text style={styles.avatarText}>{user?.name?.charAt(0).toUpperCase() || 'U'}</Text>
              </View>
            )}
          </SupporterProfileBorder>
          <View style={styles.cameraIconContainer}>
            {uploadingImage ? <ActivityIndicator size="small" color="#fff" /> : <Ionicons name="camera" size={16} color="#fff" />}
          </View>
        </TouchableOpacity>
        <View style={styles.levelBadge}>
          <Text style={styles.levelText}>{tt('Lv.')}{level}</Text>
        </View>
      </View>

      <View style={styles.nameContainer}>
        {editingName ? (
          <View style={local.nameEdit}>
            <TextInput
              style={[styles.userName, local.nameInput]}
              value={newName}
              onChangeText={setNewName}
              autoFocus
              maxLength={NAME_MAX}
              returnKeyType="done"
              onSubmitEditing={saveName}
              accessibilityLabel={tt('Il tuo nome')}
            />
            <TouchableOpacity
              onPress={saveName}
              disabled={!canSaveName}
              accessibilityRole="button"
              accessibilityLabel={tt('Salva il nome')}
              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
            >
              {savingName ? (
                <ActivityIndicator size="small" color="#B8C868" />
              ) : (
                <Ionicons name="checkmark-circle" size={26} color={canSaveName ? '#B8C868' : '#4B6354'} />
              )}
            </TouchableOpacity>
            <TouchableOpacity
              onPress={() => setEditingName(false)}
              accessibilityRole="button"
              accessibilityLabel={tt('Annulla')}
              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
            >
              <Ionicons name="close-circle" size={26} color="#8FA595" />
            </TouchableOpacity>
          </View>
        ) : (
          <TouchableOpacity
            onPress={startEditing}
            style={local.nameRow}
            accessibilityRole="button"
            accessibilityLabel={`${user?.name ?? ''}, ${tt('Modifica il nome')}`}
          >
            <Text style={styles.userName}>{user?.name}</Text>
            <Ionicons name="pencil" size={14} color="#8FA595" />
          </TouchableOpacity>
        )}
        {user?.is_supporter && <SupporterBadge size="medium" showLabel style={{ marginLeft: 8 }} />}
      </View>
      <Text style={styles.userTitle}>{tt(user?.title || 'Nuovo Vicino')}</Text>
      <Text style={styles.userEmail}>{user?.email}</Text>

      <View style={styles.progressSection}>
        <View style={styles.progressHeader}>
          <Text style={styles.progressLabel}>{tt('Crescita Comunitaria')}</Text>
          <Text style={styles.progressValue}>{user?.community_score || 0}{' '}{tt('punti')}</Text>
        </View>
        <View style={styles.progressBar}>
          <View style={[styles.progressFill, { width: `${progress}%` }]} />
        </View>
        <Text style={styles.progressHint}>{remaining}{' '}{tt('punti al prossimo livello')}</Text>
      </View>

      <View style={styles.socialImpactSection}>
        <View style={styles.socialImpactHeader}>
          <View style={styles.socialImpactTitle}>
            <Ionicons name="heart-circle" size={20} color="#ff6b6b" />
            <Text style={styles.socialImpactLabel}>{tt('Impatto Sociale')}</Text>
          </View>
          <Text style={styles.socialImpactLevel}>{tt('Lv.')}{' '}{impact.level}</Text>
        </View>
        <View style={styles.socialImpactBar}>
          <View style={[styles.socialImpactFill, { width: `${impact.percent}%` }]} />
        </View>
        <View style={styles.socialImpactStats}>
          <Text style={styles.socialImpactScore}>{impactScore}{' '}{tt('punti impatto')}</Text>
          <Text style={styles.socialImpactHint}>{tt('+20 per favore • +50 per emergenza')}</Text>
        </View>
      </View>

      {hasRatings(user) ? (
        <View style={styles.ratingsContainer}>
          <View style={styles.ratingItem}>
            <Text style={styles.ratingLabel}>{tt('Efficienza')}</Text>
            <Stars value={Math.round(user?.average_rating || 0)} />
          </View>
          <View style={styles.ratingItem}>
            <Text style={styles.ratingLabel}>{tt('Gentilezza')}</Text>
            <Stars value={Math.round(user?.average_kindness || 0)} />
          </View>
          <View style={styles.ratingItem}>
            <Text style={styles.ratingLabel}>{tt('Impatto')}</Text>
            <Stars value={Math.round(user?.average_impact || 0)} />
          </View>
        </View>
      ) : (
        <Text style={local.noRatings}>{tt('Le valutazioni compariranno dopo i primi favori completati.')}</Text>
      )}
    </View>
  );
}

const local = StyleSheet.create({
  nameRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  nameEdit: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  nameInput: { borderBottomWidth: 1, borderBottomColor: '#B8C868', minWidth: 140, color: '#fff' },
  noRatings: { color: '#8FA595', fontSize: 12, textAlign: 'center', marginTop: 12 },
});
