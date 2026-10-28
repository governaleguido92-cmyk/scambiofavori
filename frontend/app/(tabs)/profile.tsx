import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  ScrollView,
  Alert,
  TextInput,
  Modal,
  Share,
  RefreshControl,
  ActivityIndicator,
  Image,
  Switch,
  Platform,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter, useFocusEffect } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import { useAuth } from '../../src/context/AuthContext';
import { useTranslation } from 'react-i18next';
import { SUPPORTED_LANGUAGES, changeLanguage } from '../../src/i18n';
import { api, Badge, LeaderboardUser, Category, CURRENCY_NAME, CURRENCY_SYMBOL, getImageUrl } from '../../src/services/api';
import { ProfileCompletionBar } from '../../src/components/ProfileCompletionBar';
import { DeleteAccountModal } from '../../src/components/DeleteAccountModal';
import { SupporterProfileBorder, SupporterBadge } from '../../src/components/SupporterBadge';
import themeColors from '../../src/theme/colors';
import { styles } from '../../src/styles/profile.styles';
import { logger } from '../../src/utils/logger';

const BADGE_ICONS: Record<string, string> = {
  'heart': 'heart',
  'home': 'home',
  'school': 'school',
  'people': 'people',
  'flash': 'heart-sharp',
  'footsteps': 'footsteps',
  'sunny': 'heart-circle',
  'ribbon': 'heart-half',
  'star': 'heart',
  'trophy': 'heart-circle-outline',
  'medal': 'heart-outline',
};

export default function ProfileScreen() {
  const { user, token, logout, deleteAccount, refreshUser } = useAuth();
  const { t, i18n } = useTranslation();
  const router = useRouter();
  const [badges, setBadges] = useState<Badge[]>([]);
  const [allBadges, setAllBadges] = useState<Badge[]>([]);
  const [showDonateModal, setShowDonateModal] = useState(false);
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [showReferralModal, setShowReferralModal] = useState(false);
  const [showLeaderboard, setShowLeaderboard] = useState(false);
  const [showSkillsModal, setShowSkillsModal] = useState(false);
  const [donationAmount, setDonationAmount] = useState('1');
  const [solidarityFund, setSolidarityFund] = useState(0);
  const [leaderboard, setLeaderboard] = useState<LeaderboardUser[]>([]);
  const [referralInfo, setReferralInfo] = useState<{ referral_code: string; successful_referrals: number; bonus_per_referral: number } | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  // Skills state
  const [userSkills, setUserSkills] = useState<string[]>([]);
  const [selectedSkills, setSelectedSkills] = useState<string[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [savingSkills, setSavingSkills] = useState(false);
  // Profile picture state
  const [profileImage, setProfileImage] = useState<string | null>(null);
  const [uploadingImage, setUploadingImage] = useState(false);
  // Profile completion refresh trigger
  const [completionKey, setCompletionKey] = useState(0);
  // Name editing state
  const [editingName, setEditingName] = useState(false);
  const [newName, setNewName] = useState('');
  const [savingName, setSavingName] = useState(false);
  // Notification preferences state
  const [notifPrefs, setNotifPrefs] = useState<Record<string, boolean>>({
    favor_accepted: true, favor_completed: true, new_message: true, new_review: true, skill_match: true,
  });
  const [loadingPrefs, setLoadingPrefs] = useState(false);
  // Reviews state
  const [receivedReviews, setReceivedReviews] = useState<any[]>([]);
  const [loadingReviews, setLoadingReviews] = useState(false);
  // Badge info modal state
  const [showBadgeModal, setShowBadgeModal] = useState(false);
  const [selectedBadge, setSelectedBadge] = useState<any>(null);

  const BADGE_INFO: Record<string, { description: string; howToGet: string }> = {
    'Vicino Gentile': {
      description: 'Hai completato il tuo primo favore nella community.',
      howToGet: 'Completa 1 favore (offerta o richiesta).'
    },
    'Aiutante Locale': {
      description: 'Hai aiutato 5 persone nel tuo quartiere.',
      howToGet: 'Completa 5 favori come offerente.'
    },
    'Pilastro del Quartiere': {
      description: 'Sei un punto di riferimento per la tua comunità.',
      howToGet: 'Completa 20 favori nella community.'
    },
    'Cuore d\'Oro': {
      description: 'Hai donato al Fondo Solidarietà per aiutare chi è in difficoltà.',
      howToGet: 'Fai una donazione al Fondo Solidarietà.'
    },
    'Eroe Silenzioso': {
      description: 'Hai risposto a richieste urgenti quando serviva di più.',
      howToGet: 'Completa 3 favori di emergenza.'
    },
    'Micro-Eroe': {
      description: 'Hai dato consigli e info rapide a tanti vicini.',
      howToGet: 'Completa 10 micro-favori.'
    },
    'Sostenitore': {
      description: 'Supporti lo sviluppo di Scambio di Favori con un abbonamento.',
      howToGet: 'Attiva l\'abbonamento Sostenitore (€1/mese).'
    },
  };

  const handleBadgePress = (badge: any) => {
    setSelectedBadge(badge);
    setShowBadgeModal(true);
  };

  const showImagePickerOptions = () => {
    Alert.alert(
      'Foto Profilo',
      'Come vuoi aggiungere la foto?',
      [
        {
          text: 'Scatta Foto',
          onPress: () => pickImageFromCamera(),
        },
        {
          text: 'Scegli dalla Libreria',
          onPress: () => pickImageFromLibrary(),
        },
        {
          text: 'Annulla',
          style: 'cancel',
        },
      ]
    );
  };

  const pickImageFromCamera = async () => {
    const { status } = await ImagePicker.requestCameraPermissionsAsync();
    if (status !== 'granted') {
      Alert.alert('Permesso negato', 'È necessario il permesso per usare la fotocamera.');
      return;
    }

    const result = await ImagePicker.launchCameraAsync({
      allowsEditing: true,
      aspect: [1, 1],
      quality: 0.8,
    });

    if (!result.canceled && result.assets[0]) {
      const imageUri = result.assets[0].uri;
      setProfileImage(imageUri);
      await uploadProfileImage(imageUri);
    }
  };

  const pickImageFromLibrary = async () => {
    // On Android the system photo picker needs no permission (READ_MEDIA_IMAGES is not declared).
    if (Platform.OS !== 'android') {
      const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (status !== 'granted') {
        Alert.alert('Permesso negato', 'È necessario il permesso per accedere alla libreria foto.');
        return;
      }
    }

    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      allowsEditing: true,
      aspect: [1, 1],
      quality: 0.8,
    });

    if (!result.canceled && result.assets[0]) {
      const imageUri = result.assets[0].uri;
      setProfileImage(imageUri);
      await uploadProfileImage(imageUri);
    }
  };

  const pickImage = async () => {
    showImagePickerOptions();
  };

  const uploadProfileImage = async (uri: string) => {
    if (!token) return;
    setUploadingImage(true);
    try {
      await api.uploadProfilePicture(uri, token);
      await refreshUser();
      setCompletionKey(k => k + 1);
      Alert.alert('Successo', 'Foto profilo aggiornata!');
    } catch (error: any) {
      logger.debug('Error uploading image:', error);
      Alert.alert('Errore', 'Impossibile caricare la foto. Riprova.');
      setProfileImage(null);
    } finally {
      setUploadingImage(false);
    }
  };

  const loadData = useCallback(async () => {
    if (!token) return;
    try {
      const [myBadges, allBadgesData, fundData, leaderboardData, referralData, skillsData, categoriesData] = await Promise.all([
        api.getMyBadges(token),
        api.getAllBadges(),
        api.getSolidarityFund(),
        api.getLeaderboard(),
        api.getReferralCode(token),
        api.getUserSkills(token),
        api.getCategories(),
      ]);
      setBadges(myBadges);
      setAllBadges(allBadgesData);
      setSolidarityFund(fundData.solidarity_fund_total);
      setLeaderboard(leaderboardData);
      setReferralInfo(referralData);
      setUserSkills(skillsData.skills || []);
      setSelectedSkills(skillsData.skills || []);
      setCategories(categoriesData);
      
      // Load received reviews
      if (user?.user_id) {
        try {
          const reviewsData = await api.getUserReviews(user.user_id);
          setReceivedReviews(reviewsData);
        } catch (err) {
          logger.debug('Error loading reviews:', err);
        }
      }
      // Load notification preferences
      try {
        const prefs = await api.getNotificationPreferences(token);
        setNotifPrefs(prefs);
      } catch (err) {
        logger.debug('Error loading notification prefs:', err);
      }
    } catch (error) {
      logger.debug('Error loading profile data:', error);
    }
  }, [token, user?.user_id]);

  useFocusEffect(
    useCallback(() => {
      refreshUser();
      loadData();
    }, [loadData])
  );

  const onRefresh = async () => {
    setRefreshing(true);
    await refreshUser();
    await loadData();
    setRefreshing(false);
  };

  const handleLogout = () => {
    Alert.alert(
      'Logout',
      'Sei sicuro di voler uscire?',
      [
        { text: 'Annulla', style: 'cancel' },
        {
          text: 'Esci',
          style: 'destructive',
          onPress: async () => {
            await logout();
          },
        },
      ]
    );
  };

  const handleToggleNotifPref = async (key: string) => {
    if (!token) return;
    const updated = { ...notifPrefs, [key]: !notifPrefs[key as keyof typeof notifPrefs] };
    setNotifPrefs(updated);
    try {
      await api.updateNotificationPreferences(updated, token);
    } catch (err) {
      // Revert on error
      setNotifPrefs(notifPrefs);
      Alert.alert('Errore', 'Impossibile aggiornare le preferenze');
    }
  };

  const handleDonate = async () => {
    if (!token) return;
    const amount = parseInt(donationAmount);
    if (isNaN(amount) || amount < 1) {
      Alert.alert('Errore', 'Inserisci un importo valido');
      return;
    }
    if (amount > (user?.granelli || 0)) {
      Alert.alert('Errore', `${CURRENCY_NAME} insufficienti`);
      return;
    }

    try {
      await api.createDonation(amount, undefined, 'Donazione al Fondo Solidarietà', token);
      await refreshUser();
      await loadData();
      setShowDonateModal(false);
      setDonationAmount('1');
      Alert.alert('Grazie!', `Hai donato ${amount} ${CURRENCY_NAME} al Fondo Solidarietà`);
    } catch (error: any) {
      Alert.alert('Errore', error.message);
    }
  };

  const handleShareReferral = async () => {
    if (!referralInfo) return;
    try {
      await Share.share({
        message: `Unisciti a Scambio di Favori! Usa il mio codice referral: ${referralInfo.referral_code} per iniziare con bonus ${CURRENCY_NAME}!`,
      });
    } catch (error) {
      logger.debug('Error sharing:', error);
    }
  };

  const handleSaveName = async () => {
    if (!token || !newName.trim()) return;
    setSavingName(true);
    try {
      const result = await api.updateUserName(newName.trim(), token);
      await refreshUser();
      setEditingName(false);
      Alert.alert('Successo', 'Nome aggiornato!');
    } catch (error: any) {
      Alert.alert('Errore', error.message || 'Impossibile aggiornare il nome');
    } finally {
      setSavingName(false);
    }
  };

  const toggleSkill = (skillName: string) => {
    setSelectedSkills(prev => 
      prev.includes(skillName)
        ? prev.filter(s => s !== skillName)
        : [...prev, skillName]
    );
  };

  const handleSaveSkills = async () => {
    if (!token) return;
    setSavingSkills(true);
    try {
      const result = await api.updateUserSkills(selectedSkills, token);
      setUserSkills(result.skills);
      setShowSkillsModal(false);
      setCompletionKey(k => k + 1);
      Alert.alert('Successo', 'Competenze aggiornate! Riceverai notifiche per favori in queste categorie.');
    } catch (error: any) {
      Alert.alert('Errore', error.message || 'Impossibile salvare le competenze');
    } finally {
      setSavingSkills(false);
    }
  };

  const getCategoryIcon = (iconName: string) => {
    const iconMap: Record<string, string> = {
      'car': 'car',
      'cart': 'cart',
      'laptop': 'laptop',
      'water': 'water',
      'people': 'people',
      'restaurant': 'restaurant',
      'leaf': 'leaf',
      'bulb': 'bulb',
      'information-circle': 'information-circle',
      'flash': 'flash',
      'ellipsis-horizontal': 'ellipsis-horizontal',
    };
    return iconMap[iconName] || 'help-circle';
  };

  const renderStars = (rating: number) => {
    const stars = [];
    for (let i = 1; i <= 5; i++) {
      stars.push(
        <Ionicons
          key={i}
          name={i <= rating ? 'star' : 'star-outline'}
          size={16}
          color="#ffd700"
        />
      );
    }
    return stars;
  };

  // Calculate progress to next level
  const communityScore = user?.community_score || 0;
  const currentLevel = Math.floor(communityScore / 100) + 1;
  const progressToNext = (communityScore % 100);

  // Calculate Social Impact Bar
  const socialImpactScore = user?.social_impact_score || 0;
  const maxSocialImpact = 500; // Max for visualization
  const socialImpactProgress = Math.min((socialImpactScore / maxSocialImpact) * 100, 100);
  const socialImpactLevel = Math.floor(socialImpactScore / 100);

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView
        contentContainerStyle={styles.scrollContent}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#4ecca3" />
        }
      >
        <View style={styles.header}>
          <Text style={styles.title}>Profilo</Text>
          {user?.identity_verified && (
            <View style={styles.verifiedBadge}>
              <Ionicons name="shield-checkmark" size={16} color="#4ecca3" />
              <Text style={styles.verifiedText}>Verificato</Text>
            </View>
          )}
        </View>

        {/* Profile Card */}
        <View style={styles.profileCard}>
          <View style={styles.avatarContainer}>
            <TouchableOpacity onPress={pickImage} disabled={uploadingImage}>
              <SupporterProfileBorder isSupporter={user?.is_supporter || false} size={80}>
                {profileImage || user?.picture ? (
                  <Image 
                    source={{ uri: profileImage || getImageUrl(user?.picture) }} 
                    style={styles.avatarImage}
                  />
                ) : (
                  <View style={styles.avatar}>
                    <Text style={styles.avatarText}>
                      {user?.name?.charAt(0).toUpperCase() || 'U'}
                    </Text>
                  </View>
                )}
              </SupporterProfileBorder>
              {/* Camera icon overlay */}
              <View style={styles.cameraIconContainer}>
                {uploadingImage ? (
                  <ActivityIndicator size="small" color="#fff" />
                ) : (
                  <Ionicons name="camera" size={16} color="#fff" />
                )}
              </View>
            </TouchableOpacity>
            <View style={styles.levelBadge}>
              <Text style={styles.levelText}>Lv.{currentLevel}</Text>
            </View>
          </View>
          <View style={styles.nameContainer}>
            {editingName ? (
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                <TextInput
                  style={[styles.userName, { borderBottomWidth: 1, borderBottomColor: '#2D5A3D', minWidth: 120, color: '#fff' }]}
                  value={newName}
                  onChangeText={setNewName}
                  autoFocus
                  maxLength={50}
                  returnKeyType="done"
                  onSubmitEditing={handleSaveName}
                />
                <TouchableOpacity onPress={handleSaveName} disabled={savingName}>
                  {savingName ? (
                    <ActivityIndicator size="small" color="#2D5A3D" />
                  ) : (
                    <Ionicons name="checkmark-circle" size={24} color="#2D5A3D" />
                  )}
                </TouchableOpacity>
                <TouchableOpacity onPress={() => setEditingName(false)}>
                  <Ionicons name="close-circle" size={24} color="#666" />
                </TouchableOpacity>
              </View>
            ) : (
              <TouchableOpacity onPress={() => { setNewName(user?.name || ''); setEditingName(true); }} style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                <Text style={styles.userName}>{user?.name}</Text>
                <Ionicons name="pencil" size={14} color="#666" />
              </TouchableOpacity>
            )}
            {user?.is_supporter && (
              <SupporterBadge size="medium" showLabel={true} style={{ marginLeft: 8 }} />
            )}
          </View>
          <Text style={styles.userTitle}>{user?.title || 'Nuovo Vicino'}</Text>
          <Text style={styles.userEmail}>{user?.email}</Text>
          
          {/* Community Score Progress Bar */}
          <View style={styles.progressSection}>
            <View style={styles.progressHeader}>
              <Text style={styles.progressLabel}>Crescita Comunitaria</Text>
              <Text style={styles.progressValue}>{communityScore} punti</Text>
            </View>
            <View style={styles.progressBar}>
              <View style={[styles.progressFill, { width: `${progressToNext}%` }]} />
            </View>
            <Text style={styles.progressHint}>{100 - progressToNext} punti al prossimo livello</Text>
          </View>

          {/* Social Impact Bar - NEW */}
          <View style={styles.socialImpactSection}>
            <View style={styles.socialImpactHeader}>
              <View style={styles.socialImpactTitle}>
                <Ionicons name="heart-circle" size={20} color="#ff6b6b" />
                <Text style={styles.socialImpactLabel}>Impatto Sociale</Text>
              </View>
              <Text style={styles.socialImpactLevel}>Lv. {socialImpactLevel}</Text>
            </View>
            <View style={styles.socialImpactBar}>
              <View style={[styles.socialImpactFill, { width: `${socialImpactProgress}%` }]} />
            </View>
            <View style={styles.socialImpactStats}>
              <Text style={styles.socialImpactScore}>{socialImpactScore} punti impatto</Text>
              <Text style={styles.socialImpactHint}>
                +20 per favore • +50 per emergenza
              </Text>
            </View>
          </View>
          
          {/* Ratings */}
          <View style={styles.ratingsContainer}>
            <View style={styles.ratingItem}>
              <Text style={styles.ratingLabel}>Efficienza</Text>
              <View style={styles.starsRow}>{renderStars(Math.round(user?.average_rating || 0))}</View>
            </View>
            <View style={styles.ratingItem}>
              <Text style={styles.ratingLabel}>Gentilezza</Text>
              <View style={styles.starsRow}>{renderStars(Math.round(user?.average_kindness || 0))}</View>
            </View>
            <View style={styles.ratingItem}>
              <Text style={styles.ratingLabel}>Impatto</Text>
              <View style={styles.starsRow}>{renderStars(Math.round(user?.average_impact || 0))}</View>
            </View>
          </View>
        </View>

        {/* Stats Grid */}
        <View style={styles.statsGrid}>
          <View style={styles.statCard}>
            <Text style={styles.statSymbol}>{CURRENCY_SYMBOL}</Text>
            <Text style={styles.statValue}>{user?.granelli || 0}</Text>
            <Text style={styles.statLabel}>{CURRENCY_NAME}</Text>
          </View>
          <View style={styles.statCard}>
            <Ionicons name="gift" size={28} color="#4ecca3" />
            <Text style={styles.statValue}>{user?.total_favors_given || 0}</Text>
            <Text style={styles.statLabel}>Donati</Text>
          </View>
          <View style={styles.statCard}>
            <Ionicons name="hand-left" size={28} color="#ff6b6b" />
            <Text style={styles.statValue}>{user?.total_favors_received || 0}</Text>
            <Text style={styles.statLabel}>Ricevuti</Text>
          </View>
          <View style={styles.statCard}>
            <Ionicons name="time" size={28} color="#2196f3" />
            <Text style={styles.statValue}>{(user?.total_hours_helped || 0).toFixed(1)}h</Text>
            <Text style={styles.statLabel}>Ore Donate</Text>
          </View>
        </View>

        {/* Profile Completion Bar */}
        {token && (
          <ProfileCompletionBar
            token={token}
            refreshKey={completionKey}
            onItemPress={(itemId) => {
              if (itemId === 'skills') {
                setShowSkillsModal(true);
              }
            }}
          />
        )}

        {/* Badges Section */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Badge Comunitari</Text>
          <Text style={styles.badgeHint}>Tocca un badge per scoprire come ottenerlo</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false}>
            {allBadges.map((badge) => {
              const earned = badges.some(b => b.id === badge.id);
              return (
                <TouchableOpacity
                  key={badge.id}
                  style={[styles.badgeCard, !earned && styles.badgeCardLocked]}
                  onPress={() => handleBadgePress({ ...badge, earned })}
                >
                  <View style={[styles.badgeIcon, { backgroundColor: earned ? badge.color : '#333' }]}>
                    <Ionicons
                      name={(BADGE_ICONS[badge.icon] || 'ribbon') as any}
                      size={24}
                      color={earned ? '#fff' : '#666'}
                    />
                  </View>
                  <Text style={[styles.badgeName, !earned && styles.badgeNameLocked]}>
                    {badge.name}
                  </Text>
                  {!earned && <Ionicons name="lock-closed" size={12} color="#666" />}
                </TouchableOpacity>
              );
            })}
          </ScrollView>
        </View>

        {/* Skills/Competenze Section */}
        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <Text style={styles.sectionTitle}>Le Tue Competenze</Text>
            <TouchableOpacity 
              style={styles.editSkillsButton}
              onPress={() => {
                setSelectedSkills(userSkills);
                setShowSkillsModal(true);
              }}
              data-testid="edit-skills-button"
            >
              <Ionicons name="pencil" size={16} color="#4ecca3" />
              <Text style={styles.editSkillsText}>Modifica</Text>
            </TouchableOpacity>
          </View>
          
          {userSkills.length > 0 ? (
            <View style={styles.skillsContainer}>
              {userSkills.map((skill) => {
                const category = categories.find(c => c.name === skill);
                return (
                  <View key={skill} style={styles.skillTag} data-testid={`skill-tag-${skill}`}>
                    <Ionicons 
                      name={getCategoryIcon(category?.icon || 'help-circle') as any} 
                      size={14} 
                      color="#4ecca3" 
                    />
                    <Text style={styles.skillTagText}>{skill}</Text>
                  </View>
                );
              })}
            </View>
          ) : (
            <View style={styles.noSkillsCard}>
              <Ionicons name="school-outline" size={40} color="#666" />
              <Text style={styles.noSkillsTitle}>Nessuna competenza selezionata</Text>
              <Text style={styles.noSkillsDescription}>
                Seleziona le tue competenze per ricevere notifiche quando qualcuno cerca aiuto nelle tue aree di esperienza!
              </Text>
              <TouchableOpacity 
                style={styles.addSkillsButton}
                onPress={() => {
                  setSelectedSkills([]);
                  setShowSkillsModal(true);
                }}
                data-testid="add-skills-button"
              >
                <Ionicons name="add" size={20} color="#fff" />
                <Text style={styles.addSkillsButtonText}>Aggiungi Competenze</Text>
              </TouchableOpacity>
            </View>
          )}
          
          <Text style={styles.skillsHint}>
            Riceverai notifiche quando viene pubblicato un favore nelle tue aree di competenza
          </Text>
        </View>

        {/* Received Reviews Section */}
        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <Text style={styles.sectionTitle}>Recensioni Ricevute</Text>
            <View style={styles.reviewsCount}>
              <Ionicons name="star" size={16} color="#FFD700" />
              <Text style={styles.reviewsCountText}>{receivedReviews.length}</Text>
            </View>
          </View>
          
          {receivedReviews.length > 0 ? (
            <View style={styles.reviewsList}>
              {receivedReviews.slice(0, 5).map((review) => (
                <View key={review.review_id} style={styles.reviewCard}>
                  <View style={styles.reviewHeader}>
                    <View style={styles.reviewStars}>
                      {[1, 2, 3, 4, 5].map((star) => (
                        <Ionicons
                          key={star}
                          name={star <= review.rating ? 'star' : 'star-outline'}
                          size={16}
                          color="#FFD700"
                        />
                      ))}
                    </View>
                    <Text style={styles.reviewDate}>
                      {new Date(review.created_at).toLocaleDateString('it-IT')}
                    </Text>
                  </View>
                  <Text style={styles.reviewerName}>da {review.reviewer_name}</Text>
                  {review.comment && (
                    <Text style={styles.reviewComment}>"{review.comment}"</Text>
                  )}
                  {review.public_thanks && (
                    <View style={styles.publicThanksContainer}>
                      <Ionicons name="heart" size={14} color="#ff6b6b" />
                      <Text style={styles.publicThanksText}>{review.public_thanks}</Text>
                    </View>
                  )}
                </View>
              ))}
              {receivedReviews.length > 5 && (
                <Text style={styles.moreReviewsText}>
                  +{receivedReviews.length - 5} altre recensioni
                </Text>
              )}
            </View>
          ) : (
            <View style={styles.noReviewsCard}>
              <Ionicons name="chatbubble-ellipses-outline" size={40} color="#666" />
              <Text style={styles.noReviewsText}>
                Nessuna recensione ricevuta ancora. Completa dei favori per ricevere feedback!
              </Text>
            </View>
          )}
        </View>

        {/* Solidarity Fund */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Fondo Solidarietà</Text>
          <View style={styles.fundCard}>
            <View style={styles.fundInfo}>
              <Ionicons name="heart" size={32} color="#ff6b6b" />
              <View>
                <Text style={styles.fundAmount}>{solidarityFund} {CURRENCY_NAME}</Text>
                <Text style={styles.fundLabel}>disponibili per chi ha bisogno</Text>
              </View>
            </View>
            <TouchableOpacity
              style={styles.donateButton}
              onPress={() => setShowDonateModal(true)}
            >
              <Ionicons name="gift" size={18} color="#fff" />
              <Text style={styles.donateButtonText}>Dona</Text>
            </TouchableOpacity>
          </View>
          <Text style={styles.fundDescription}>
            Il Fondo Solidarietà aiuta anziani e persone fragili a partecipare alla community
          </Text>
        </View>

        {/* Referral Section */}
        <TouchableOpacity
          style={styles.referralCard}
          onPress={() => setShowReferralModal(true)}
        >
          <View style={styles.referralLeft}>
            <Ionicons name="people" size={28} color="#2196f3" />
            <View>
              <Text style={styles.referralTitle}>Invita Amici</Text>
              <Text style={styles.referralSubtitle}>
                {referralInfo?.successful_referrals || 0} inviti completati
              </Text>
            </View>
          </View>
          <Ionicons name="chevron-forward" size={24} color="#888" />
        </TouchableOpacity>

        {/* Supporter Section - "Sostieni il Progetto" */}
        <TouchableOpacity
          style={styles.supporterCard}
          onPress={() => router.push('/supporter' as any)}
          data-testid="become-supporter-button"
        >
          <View style={styles.referralLeft}>
            <View style={styles.supporterIconWrapper}>
              <Ionicons name="heart" size={28} color="#ffd700" />
            </View>
            <View>
              <Text style={styles.supporterTitle}>Sostieni il Progetto</Text>
              <Text style={styles.supporterSubtitle}>Diventa un Pilastro della Community</Text>
            </View>
          </View>
          <Ionicons name="chevron-forward" size={24} color="#ffd700" />
        </TouchableOpacity>

        {/* Leaderboard Button */}
        <TouchableOpacity
          style={styles.leaderboardButton}
          onPress={() => setShowLeaderboard(true)}
        >
          <Ionicons name="trophy" size={24} color="#ffd700" />
          <Text style={styles.leaderboardButtonText}>Classifica Community</Text>
          <Ionicons name="chevron-forward" size={24} color="#888" />
        </TouchableOpacity>

        {/* Info Cards */}
        <View style={styles.infoSection}>
          <Text style={styles.sectionTitle}>Come Funzionano i {CURRENCY_NAME}</Text>
          
          <View style={styles.infoCard}>
            <View style={styles.infoItem}>
              <View style={[styles.infoIcon, { backgroundColor: '#4ecca320' }]}>
                <Text style={styles.infoIconText}>{CURRENCY_SYMBOL}</Text>
              </View>
              <View style={styles.infoText}>
                <Text style={styles.infoTitle}>1 Ora = 1 Sole</Text>
                <Text style={styles.infoDescription}>
                  Ogni favore fatto è un raggio di sole che illumina il quartiere
                </Text>
              </View>
            </View>

            <View style={styles.infoItem}>
              <View style={[styles.infoIcon, { backgroundColor: '#2196f3' + '20' }]}>
                <Ionicons name="qr-code" size={20} color="#2196f3" />
              </View>
              <View style={styles.infoText}>
                <Text style={styles.infoTitle}>Check-in QR</Text>
                <Text style={styles.infoDescription}>
                  Valida l'incontro con il codice QR
                </Text>
              </View>
            </View>
          </View>
        </View>

        {/* Notification Preferences Section */}
        <View style={styles.section} data-testid="notification-preferences-section">
          <Text style={styles.sectionTitle}>Preferenze Notifiche</Text>
          <View style={styles.notifPrefsContainer}>
            {[
              { key: 'favor_accepted', label: 'Favore accettato', icon: 'checkmark-circle', desc: 'Quando qualcuno accetta il tuo favore' },
              { key: 'favor_completed', label: 'Favore completato', icon: 'trophy', desc: 'Al completamento di un favore' },
              { key: 'new_message', label: 'Nuovi messaggi', icon: 'chatbubble', desc: 'Messaggi nella chat' },
              { key: 'new_review', label: 'Nuove recensioni', icon: 'star', desc: 'Quando ricevi una recensione' },
              { key: 'skill_match', label: 'Match competenze', icon: 'flash', desc: 'Favori che corrispondono alle tue competenze' },
            ].map((item) => (
              <View key={item.key} style={styles.notifPrefRow}>
                <View style={styles.notifPrefIcon}>
                  <Ionicons name={item.icon as any} size={18} color={themeColors.accent} />
                </View>
                <View style={styles.notifPrefText}>
                  <Text style={styles.notifPrefLabel}>{item.label}</Text>
                  <Text style={styles.notifPrefDesc}>{item.desc}</Text>
                </View>
                <Switch
                  value={notifPrefs[item.key as keyof typeof notifPrefs]}
                  onValueChange={() => handleToggleNotifPref(item.key)}
                  trackColor={{ false: themeColors.backgroundLight, true: themeColors.primaryLight }}
                  thumbColor={notifPrefs[item.key as keyof typeof notifPrefs] ? themeColors.accent : '#ccc'}
                  data-testid={`notif-toggle-${item.key}`}
                />
              </View>
            ))}
          </View>
        </View>

        {/* Language Selector */}
        <View style={styles.languageSection}>
          <View style={styles.languageLabelRow}>
            <Ionicons name="language" size={18} color="#A8C4B0" />
            <Text style={styles.languageLabel}>{t('settings.language')}</Text>
          </View>
          <View style={styles.languageButtons}>
            {SUPPORTED_LANGUAGES.map(lang => (
              <TouchableOpacity
                key={lang.code}
                style={[styles.languageBtn, i18n.language === lang.code && styles.languageBtnActive]}
                onPress={() => changeLanguage(lang.code)}
              >
                <Text style={styles.languageBtnText}>{lang.flag} {lang.label}</Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>

        {/* Logout Button */}
        <TouchableOpacity style={styles.logoutButton} onPress={handleLogout}>
          <Ionicons name="log-out" size={20} color="#ff6b6b" />
          <Text style={styles.logoutText}>{t('profile.logout')}</Text>
        </TouchableOpacity>

        {/* Delete account (GDPR right to erasure; required by Google Play) */}
        <TouchableOpacity
          style={styles.deleteAccountButton}
          onPress={() => setShowDeleteModal(true)}
          accessibilityRole="button"
          accessibilityLabel="Elimina il mio account"
        >
          <Text style={styles.deleteAccountText}>Elimina account</Text>
        </TouchableOpacity>
      </ScrollView>

      <DeleteAccountModal
        visible={showDeleteModal}
        email={user?.email ?? ''}
        onClose={() => setShowDeleteModal(false)}
        onConfirm={async (confirmEmail) => {
          await deleteAccount(confirmEmail);
          setShowDeleteModal(false);
        }}
      />

      {/* Donate Modal */}
      <Modal visible={showDonateModal} transparent animationType="slide">
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <Text style={styles.modalTitle}>Dona al Fondo Solidarietà</Text>
            <Text style={styles.modalDescription}>
              I tuoi {CURRENCY_NAME} aiuteranno anziani e persone fragili della community
            </Text>
            
            <View style={styles.donateInputContainer}>
              <TouchableOpacity
                style={styles.donateAdjust}
                onPress={() => setDonationAmount(String(Math.max(1, parseInt(donationAmount) - 1)))}
              >
                <Ionicons name="remove" size={24} color="#fff" />
              </TouchableOpacity>
              <TextInput
                style={styles.donateInput}
                value={donationAmount}
                onChangeText={setDonationAmount}
                keyboardType="number-pad"
                maxLength={3}
              />
              <TouchableOpacity
                style={styles.donateAdjust}
                onPress={() => setDonationAmount(String(parseInt(donationAmount) + 1))}
              >
                <Ionicons name="add" size={24} color="#fff" />
              </TouchableOpacity>
            </View>
            <Text style={styles.donateCreditsLabel}>{CURRENCY_NAME}</Text>

            <View style={styles.modalButtons}>
              <TouchableOpacity
                style={styles.modalCancelButton}
                onPress={() => setShowDonateModal(false)}
              >
                <Text style={styles.modalCancelText}>Annulla</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.modalConfirmButton} onPress={handleDonate}>
                <Ionicons name="heart" size={18} color="#fff" />
                <Text style={styles.modalConfirmText}>Dona</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* Referral Modal */}
      <Modal visible={showReferralModal} transparent animationType="slide">
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <Text style={styles.modalTitle}>Invita i Tuoi Amici</Text>
            <Text style={styles.modalDescription}>
              Guadagna {referralInfo?.bonus_per_referral || 3} {CURRENCY_NAME} quando un amico completa il primo favore
            </Text>
            
            <View style={styles.referralCodeBox}>
              <Text style={styles.referralCodeLabel}>Il tuo codice:</Text>
              <Text style={styles.referralCode}>{referralInfo?.referral_code || '...'}</Text>
            </View>

            <View style={styles.referralStats}>
              <View style={styles.referralStatItem}>
                <Text style={styles.referralStatValue}>{referralInfo?.successful_referrals || 0}</Text>
                <Text style={styles.referralStatLabel}>Inviti Completati</Text>
              </View>
              <View style={styles.referralStatItem}>
                <Text style={styles.referralStatValue}>
                  {(referralInfo?.successful_referrals || 0) * (referralInfo?.bonus_per_referral || 3)}
                </Text>
                <Text style={styles.referralStatLabel}>{CURRENCY_NAME} Guadagnati</Text>
              </View>
            </View>

            <View style={styles.modalButtons}>
              <TouchableOpacity
                style={styles.modalCancelButton}
                onPress={() => setShowReferralModal(false)}
              >
                <Text style={styles.modalCancelText}>Chiudi</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.modalConfirmButton} onPress={handleShareReferral}>
                <Ionicons name="share-social" size={18} color="#fff" />
                <Text style={styles.modalConfirmText}>Condividi</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* Leaderboard Modal */}
      <Modal visible={showLeaderboard} transparent animationType="slide">
        <View style={styles.modalOverlay}>
          <View style={[styles.modalContent, styles.leaderboardModal]}>
            <Text style={styles.modalTitle}>Classifica Community</Text>
            
            <ScrollView style={styles.leaderboardList}>
              {leaderboard.map((item, index) => (
                <View
                  key={item.user_id}
                  style={[
                    styles.leaderboardItem,
                    item.user_id === user?.user_id && styles.leaderboardItemMe
                  ]}
                >
                  <View style={styles.leaderboardRank}>
                    {index < 3 ? (
                      <Ionicons
                        name="trophy"
                        size={24}
                        color={index === 0 ? '#ffd700' : index === 1 ? '#c0c0c0' : '#cd7f32'}
                      />
                    ) : (
                      <Text style={styles.leaderboardRankText}>{index + 1}</Text>
                    )}
                  </View>
                  <View style={styles.leaderboardInfo}>
                    <Text style={styles.leaderboardName}>{item.name}</Text>
                    <Text style={styles.leaderboardTitle}>{item.title}</Text>
                  </View>
                  <View style={styles.leaderboardScore}>
                    <Text style={styles.leaderboardScoreValue}>{item.community_score}</Text>
                    <Text style={styles.leaderboardScoreLabel}>punti</Text>
                  </View>
                </View>
              ))}
            </ScrollView>

            <TouchableOpacity
              style={styles.modalCloseButton}
              onPress={() => setShowLeaderboard(false)}
            >
              <Text style={styles.modalCloseText}>Chiudi</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      {/* Skills Selection Modal */}
      <Modal visible={showSkillsModal} transparent animationType="slide">
        <View style={styles.modalOverlay}>
          <View style={[styles.modalContent, styles.skillsModal]}>
            <Text style={styles.modalTitle}>Le Tue Competenze</Text>
            <Text style={styles.modalDescription}>
              Seleziona le categorie in cui puoi aiutare. Riceverai notifiche quando qualcuno cerca aiuto in queste aree.
            </Text>
            
            <ScrollView style={styles.skillsList} showsVerticalScrollIndicator={false}>
              {categories.map((category) => {
                const isSelected = selectedSkills.includes(category.name);
                return (
                  <TouchableOpacity
                    key={category.name}
                    style={[styles.skillSelectItem, isSelected && styles.skillSelectItemActive]}
                    onPress={() => toggleSkill(category.name)}
                    data-testid={`skill-select-${category.name}`}
                  >
                    <View style={[styles.skillSelectIcon, isSelected && styles.skillSelectIconActive]}>
                      <Ionicons 
                        name={getCategoryIcon(category.icon) as any} 
                        size={20} 
                        color={isSelected ? '#fff' : '#888'} 
                      />
                    </View>
                    <View style={styles.skillSelectInfo}>
                      <Text style={[styles.skillSelectName, isSelected && styles.skillSelectNameActive]}>
                        {category.name}
                      </Text>
                    </View>
                    <View style={[styles.skillCheckbox, isSelected && styles.skillCheckboxActive]}>
                      {isSelected && <Ionicons name="checkmark" size={16} color="#fff" />}
                    </View>
                  </TouchableOpacity>
                );
              })}
            </ScrollView>

            <View style={styles.selectedCount}>
              <Text style={styles.selectedCountText}>
                {selectedSkills.length} competenze selezionate
              </Text>
            </View>

            <View style={styles.modalButtons}>
              <TouchableOpacity
                style={styles.modalCancelButton}
                onPress={() => setShowSkillsModal(false)}
              >
                <Text style={styles.modalCancelText}>Annulla</Text>
              </TouchableOpacity>
              <TouchableOpacity 
                style={[styles.modalConfirmButton, savingSkills && styles.modalConfirmButtonDisabled]} 
                onPress={handleSaveSkills}
                disabled={savingSkills}
              >
                {savingSkills ? (
                  <ActivityIndicator size="small" color="#fff" />
                ) : (
                  <>
                    <Ionicons name="save" size={18} color="#fff" />
                    <Text style={styles.modalConfirmText}>Salva</Text>
                  </>
                )}
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
      {/* Badge Info Modal */}
      <Modal visible={showBadgeModal} transparent animationType="fade">
        <View style={styles.modalOverlay}>
          <View style={styles.badgeModalContent}>
            {selectedBadge && (
              <>
                <View style={[styles.badgeModalIcon, { backgroundColor: selectedBadge.earned ? selectedBadge.color : '#333' }]}>
                  <Ionicons
                    name={(BADGE_ICONS[selectedBadge.icon] || 'ribbon') as any}
                    size={48}
                    color={selectedBadge.earned ? '#fff' : '#666'}
                  />
                </View>
                <Text style={styles.badgeModalTitle}>{selectedBadge.name}</Text>
                <View style={[styles.badgeModalStatus, selectedBadge.earned ? styles.badgeEarned : styles.badgeLocked]}>
                  <Ionicons name={selectedBadge.earned ? 'checkmark-circle' : 'lock-closed'} size={16} color={selectedBadge.earned ? '#4ecca3' : '#666'} />
                  <Text style={[styles.badgeStatusText, selectedBadge.earned && styles.badgeStatusEarned]}>
                    {selectedBadge.earned ? 'Ottenuto!' : 'Non ancora ottenuto'}
                  </Text>
                </View>
                <Text style={styles.badgeModalDescription}>
                  {BADGE_INFO[selectedBadge.name]?.description || selectedBadge.description || 'Badge della community.'}
                </Text>
                <View style={styles.badgeHowToGet}>
                  <Ionicons name="bulb" size={18} color="#FFD700" />
                  <Text style={styles.badgeHowToGetText}>
                    {BADGE_INFO[selectedBadge.name]?.howToGet || 'Partecipa attivamente alla community.'}
                  </Text>
                </View>
                <TouchableOpacity style={styles.badgeModalClose} onPress={() => setShowBadgeModal(false)}>
                  <Text style={styles.badgeModalCloseText}>Chiudi</Text>
                </TouchableOpacity>
              </>
            )}
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}
