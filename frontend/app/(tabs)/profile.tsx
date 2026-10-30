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
  Platform,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter, useFocusEffect } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import { useAuth } from '../../src/context/AuthContext';
import { useTranslation } from 'react-i18next';
import { api, Badge, LeaderboardUser, Category, CURRENCY_NAME, CURRENCY_SYMBOL, getImageUrl } from '../../src/services/api';
import { ProfileCompletionBar } from '../../src/components/ProfileCompletionBar';
import { SupporterProfileBorder, SupporterBadge } from '../../src/components/SupporterBadge';
import themeColors from '../../src/theme/colors';
import { styles } from '../../src/styles/profile.styles';
import { SUPPORTER_PURCHASE_ENABLED } from '../../src/utils/features';
import { logger } from '../../src/utils/logger';
import { notify } from '../../src/utils/notify';
import { tt, tx } from '../../src/i18n/tt';

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
  const { user, token, refreshUser } = useAuth();
  const { t, i18n } = useTranslation();
  const router = useRouter();
  const [badges, setBadges] = useState<Badge[]>([]);
  const [allBadges, setAllBadges] = useState<Badge[]>([]);
  const [showDonateModal, setShowDonateModal] = useState(false);
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
  // Reviews state
  const [receivedReviews, setReceivedReviews] = useState<any[]>([]);
  const [loadingReviews, setLoadingReviews] = useState(false);
  // Badge info modal state
  const [showBadgeModal, setShowBadgeModal] = useState(false);
  const [selectedBadge, setSelectedBadge] = useState<any>(null);

  const BADGE_INFO: Record<string, { description: string; howToGet: string }> = {
    'Vicino Gentile': {
      description: tt('Hai completato il tuo primo favore nella community.'),
      howToGet: tt('Completa 1 favore (offerta o richiesta).')
    },
    'Aiutante Locale': {
      description: tt('Hai aiutato 5 persone nel tuo quartiere.'),
      howToGet: tt('Completa 5 favori come offerente.')
    },
    'Pilastro del Quartiere': {
      description: tt('Sei un punto di riferimento per la tua comunità.'),
      howToGet: tt('Completa 20 favori nella community.')
    },
    'Cuore d\'Oro': {
      description: tt('Hai donato al Fondo Solidarietà per aiutare chi è in difficoltà.'),
      howToGet: tt('Fai una donazione al Fondo Solidarietà.')
    },
    'Eroe Silenzioso': {
      description: tt('Hai risposto a richieste urgenti quando serviva di più.'),
      howToGet: tt('Completa 3 favori di emergenza.')
    },
    'Micro-Eroe': {
      description: tt('Hai dato consigli e info rapide a tanti vicini.'),
      howToGet: tt('Completa 10 micro-favori.')
    },
    'Sostenitore': {
      description: tt('Supporti lo sviluppo di Scambio Favori con un contributo.'),
      howToGet: SUPPORTER_PURCHASE_ENABLED
        ? 'Diventa Sostenitore da "Sostieni il Progetto" nel tuo profilo.'
        : 'Non disponibile in questa versione dell\'app.'
    },
  };

  const handleBadgePress = (badge: any) => {
    setSelectedBadge(badge);
    setShowBadgeModal(true);
  };

  const showImagePickerOptions = () => {
    Alert.alert(
      tt('Foto Profilo'),
      tt('Come vuoi aggiungere la foto?'),
      [
        {
          text: tt('Scatta Foto'),
          onPress: () => pickImageFromCamera(),
        },
        {
          text: tt('Scegli dalla Libreria'),
          onPress: () => pickImageFromLibrary(),
        },
        {
          text: tt('Annulla'),
          style: 'cancel',
        },
      ]
    );
  };

  const pickImageFromCamera = async () => {
    const { status } = await ImagePicker.requestCameraPermissionsAsync();
    if (status !== 'granted') {
      notify(tt('Permesso negato'), tt('È necessario il permesso per usare la fotocamera.'));
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
        notify(tt('Permesso negato'), tt('È necessario il permesso per accedere alla libreria foto.'));
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
      notify(tt('Successo'), tt('Foto profilo aggiornata!'));
    } catch (error: any) {
      logger.debug('Error uploading image:', error);
      notify(tt('Errore'), tt('Impossibile caricare la foto. Riprova.'));
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

  const handleDonate = async () => {
    if (!token) return;
    const amount = parseInt(donationAmount);
    if (isNaN(amount) || amount < 1) {
      notify(tt('Errore'), tt('Inserisci un importo valido'));
      return;
    }
    if (amount > (user?.granelli || 0)) {
      notify(tt('Errore'), tx('{0} insufficienti', [CURRENCY_NAME]));
      return;
    }

    try {
      await api.createDonation(amount, undefined, 'Donazione al Fondo Solidarietà', token);
      await refreshUser();
      await loadData();
      setShowDonateModal(false);
      setDonationAmount('1');
      notify(tt('Grazie!'), tx('Hai donato {0} {1} al Fondo Solidarietà', [amount, CURRENCY_NAME]));
    } catch (error: any) {
      notify(tt('Errore'), error.message);
    }
  };

  const handleShareReferral = async () => {
    if (!referralInfo) return;
    try {
      await Share.share({
        message: `Unisciti a Scambio Favori! Usa il mio codice referral: ${referralInfo.referral_code} per iniziare con bonus ${CURRENCY_NAME}!`,
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
      notify(tt('Successo'), tt('Nome aggiornato!'));
    } catch (error: any) {
      notify(tt('Errore'), error.message || tt('Impossibile aggiornare il nome'));
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
      notify(tt('Successo'), tt('Competenze aggiornate! Riceverai notifiche per favori in queste categorie.'));
    } catch (error: any) {
      notify(tt('Errore'), error.message || tt('Impossibile salvare le competenze'));
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
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#B8C868" />
        }
      >
        <View style={styles.header}>
          <Text style={styles.title}>{tt('Profilo')}</Text>
          <TouchableOpacity
            onPress={() => router.push('/settings' as any)}
            accessibilityRole="button"
            accessibilityLabel={tt('Impostazioni')}
            hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
            data-testid="open-settings"
          >
            <Ionicons name="settings-outline" size={24} color="#fff" />
          </TouchableOpacity>
          {user?.identity_verified && (
            <View style={styles.verifiedBadge}>
              <Ionicons name="shield-checkmark" size={16} color="#B8C868" />
              <Text style={styles.verifiedText}>{tt('Verificato')}</Text>
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
              <Text style={styles.levelText}>{tt('Lv.')}{currentLevel}</Text>
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
                  <Ionicons name="close-circle" size={24} color="#8FA595" />
                </TouchableOpacity>
              </View>
            ) : (
              <TouchableOpacity onPress={() => { setNewName(user?.name || ''); setEditingName(true); }} style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                <Text style={styles.userName}>{user?.name}</Text>
                <Ionicons name="pencil" size={14} color="#8FA595" />
              </TouchableOpacity>
            )}
            {user?.is_supporter && (
              <SupporterBadge size="medium" showLabel={true} style={{ marginLeft: 8 }} />
            )}
          </View>
          <Text style={styles.userTitle}>{tt(user?.title || 'Nuovo Vicino')}</Text>
          <Text style={styles.userEmail}>{user?.email}</Text>
          
          {/* Community Score Progress Bar */}
          <View style={styles.progressSection}>
            <View style={styles.progressHeader}>
              <Text style={styles.progressLabel}>{tt('Crescita Comunitaria')}</Text>
              <Text style={styles.progressValue}>{communityScore}{' '}{tt('punti')}</Text>
            </View>
            <View style={styles.progressBar}>
              <View style={[styles.progressFill, { width: `${progressToNext}%` }]} />
            </View>
            <Text style={styles.progressHint}>{100 - progressToNext}{' '}{tt('punti al prossimo livello')}</Text>
          </View>

          {/* Social Impact Bar - NEW */}
          <View style={styles.socialImpactSection}>
            <View style={styles.socialImpactHeader}>
              <View style={styles.socialImpactTitle}>
                <Ionicons name="heart-circle" size={20} color="#ff6b6b" />
                <Text style={styles.socialImpactLabel}>{tt('Impatto Sociale')}</Text>
              </View>
              <Text style={styles.socialImpactLevel}>{tt('Lv.')}{' '}{socialImpactLevel}</Text>
            </View>
            <View style={styles.socialImpactBar}>
              <View style={[styles.socialImpactFill, { width: `${socialImpactProgress}%` }]} />
            </View>
            <View style={styles.socialImpactStats}>
              <Text style={styles.socialImpactScore}>{socialImpactScore}{' '}{tt('punti impatto')}</Text>
              <Text style={styles.socialImpactHint}>{tt('+20 per favore • +50 per emergenza')}</Text>
            </View>
          </View>
          
          {/* Ratings */}
          <View style={styles.ratingsContainer}>
            <View style={styles.ratingItem}>
              <Text style={styles.ratingLabel}>{tt('Efficienza')}</Text>
              <View style={styles.starsRow}>{renderStars(Math.round(user?.average_rating || 0))}</View>
            </View>
            <View style={styles.ratingItem}>
              <Text style={styles.ratingLabel}>{tt('Gentilezza')}</Text>
              <View style={styles.starsRow}>{renderStars(Math.round(user?.average_kindness || 0))}</View>
            </View>
            <View style={styles.ratingItem}>
              <Text style={styles.ratingLabel}>{tt('Impatto')}</Text>
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
            <Ionicons name="gift" size={32} color="#B8C868" />
            <Text style={styles.statValue}>{user?.total_favors_given || 0}</Text>
            <Text style={styles.statLabel}>{tt('Donati')}</Text>
          </View>
          <View style={styles.statCard}>
            <Ionicons name="hand-left" size={32} color="#ff6b6b" />
            <Text style={styles.statValue}>{user?.total_favors_received || 0}</Text>
            <Text style={styles.statLabel}>{tt('Ricevuti')}</Text>
          </View>
          <View style={styles.statCard}>
            <Ionicons name="time" size={32} color="#F87828" />
            <Text style={styles.statValue}>{(user?.total_hours_helped || 0).toFixed(1)}h</Text>
            <Text style={styles.statLabel}>{tt('Ore Donate')}</Text>
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
          <Text style={styles.sectionTitle}>{tt('Badge Comunitari')}</Text>
          <Text style={styles.badgeHint}>{tt('Tocca un badge per scoprire come ottenerlo')}</Text>
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
                      color={earned ? '#fff' : '#8FA595'}
                    />
                  </View>
                  <Text style={[styles.badgeName, !earned && styles.badgeNameLocked]}>
                    {tt(badge.name)}
                  </Text>
                  {!earned && <Ionicons name="lock-closed" size={14} color="#8FA595" />}
                </TouchableOpacity>
              );
            })}
          </ScrollView>
        </View>

        {/* Skills/Competenze Section */}
        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <Text style={styles.sectionTitle}>{tt('Le Tue Competenze')}</Text>
            <TouchableOpacity 
              style={styles.editSkillsButton}
              onPress={() => {
                setSelectedSkills(userSkills);
                setShowSkillsModal(true);
              }}
              data-testid="edit-skills-button"
            >
              <Ionicons name="pencil" size={16} color="#B8C868" />
              <Text style={styles.editSkillsText}>{tt('Modifica')}</Text>
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
                      color="#B8C868" 
                    />
                    <Text style={styles.skillTagText}>{skill}</Text>
                  </View>
                );
              })}
            </View>
          ) : (
            <View style={styles.noSkillsCard}>
              <Ionicons name="school-outline" size={40} color="#8FA595" />
              <Text style={styles.noSkillsTitle}>{tt('Nessuna competenza selezionata')}</Text>
              <Text style={styles.noSkillsDescription}>{tt('Seleziona le tue competenze per ricevere notifiche quando qualcuno cerca aiuto nelle tue aree di esperienza!')}</Text>
              <TouchableOpacity 
                style={styles.addSkillsButton}
                onPress={() => {
                  setSelectedSkills([]);
                  setShowSkillsModal(true);
                }}
                data-testid="add-skills-button"
              >
                <Ionicons name="add" size={20} color="#fff" />
                <Text style={styles.addSkillsButtonText}>{tt('Aggiungi Competenze')}</Text>
              </TouchableOpacity>
            </View>
          )}
          
          <Text style={styles.skillsHint}>{tt('Riceverai notifiche quando viene pubblicato un favore nelle tue aree di competenza')}</Text>
        </View>

        {/* Received Reviews Section */}
        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <Text style={styles.sectionTitle}>{tt('Recensioni Ricevute')}</Text>
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
                  <Text style={styles.reviewerName}>{tt('da')}{' '}{review.reviewer_name}</Text>
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
                  +{receivedReviews.length - 5}{' '}{tt('altre recensioni')}</Text>
              )}
            </View>
          ) : (
            <View style={styles.noReviewsCard}>
              <Ionicons name="chatbubble-ellipses-outline" size={40} color="#8FA595" />
              <Text style={styles.noReviewsText}>{tt('Nessuna recensione ricevuta ancora. Completa dei favori per ricevere feedback!')}</Text>
            </View>
          )}
        </View>

        {/* Solidarity Fund */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>{tt('Fondo Solidarietà')}</Text>
          <View style={styles.fundCard}>
            <View style={styles.fundInfo}>
              <Ionicons name="heart" size={32} color="#ff6b6b" />
              <View>
                <Text style={styles.fundAmount}>{solidarityFund} {CURRENCY_NAME}</Text>
                <Text style={styles.fundLabel}>{tt('disponibili per chi ha bisogno')}</Text>
              </View>
            </View>
            <TouchableOpacity
              style={styles.donateButton}
              onPress={() => setShowDonateModal(true)}
            >
              <Ionicons name="gift" size={20} color="#fff" />
              <Text style={styles.donateButtonText}>{tt('Dona')}</Text>
            </TouchableOpacity>
          </View>
          <Text style={styles.fundDescription}>{tt('Il Fondo Solidarietà aiuta anziani e persone fragili a partecipare alla community')}</Text>
        </View>

        {/* Referral Section */}
        <TouchableOpacity
          style={styles.referralCard}
          onPress={() => setShowReferralModal(true)}
        >
          <View style={styles.referralLeft}>
            <Ionicons name="people" size={32} color="#F87828" />
            <View>
              <Text style={styles.referralTitle}>{tt('Invita Amici')}</Text>
              <Text style={styles.referralSubtitle}>
                {referralInfo?.successful_referrals || 0}{' '}{tt('inviti completati')}</Text>
            </View>
          </View>
          <Ionicons name="chevron-forward" size={24} color="#9DB3A4" />
        </TouchableOpacity>

        {/* Supporter Section - "Sostieni il Progetto" (hidden on Android: Google Play Billing policy) */}
        {SUPPORTER_PURCHASE_ENABLED && (
        <TouchableOpacity
          style={styles.supporterCard}
          onPress={() => router.push('/supporter' as any)}
          data-testid="become-supporter-button"
        >
          <View style={styles.referralLeft}>
            <View style={styles.supporterIconWrapper}>
              <Ionicons name="heart" size={32} color="#ffd700" />
            </View>
            <View>
              <Text style={styles.supporterTitle}>{tt('Sostieni il Progetto')}</Text>
              <Text style={styles.supporterSubtitle}>{tt('Diventa un Pilastro della Community')}</Text>
            </View>
          </View>
          <Ionicons name="chevron-forward" size={24} color="#ffd700" />
        </TouchableOpacity>
        )}

        {/* Leaderboard Button */}
        <TouchableOpacity
          style={styles.leaderboardButton}
          onPress={() => setShowLeaderboard(true)}
        >
          <Ionicons name="trophy" size={24} color="#ffd700" />
          <Text style={styles.leaderboardButtonText}>{tt('Classifica Community')}</Text>
          <Ionicons name="chevron-forward" size={24} color="#9DB3A4" />
        </TouchableOpacity>

        {/* Info Cards */}
        <View style={styles.infoSection}>
          <Text style={styles.sectionTitle}>{tt('Come Funzionano i')}{' '}{CURRENCY_NAME}</Text>
          
          <View style={styles.infoCard}>
            <View style={styles.infoItem}>
              <View style={[styles.infoIcon, { backgroundColor: '#B8C86820' }]}>
                <Text style={styles.infoIconText}>{CURRENCY_SYMBOL}</Text>
              </View>
              <View style={styles.infoText}>
                <Text style={styles.infoTitle}>{tt('1 Ora = 1 Granello')}</Text>
                <Text style={styles.infoDescription}>{tt('Un\'ora del tuo aiuto vale 1 Granello: lo guadagni aiutando e lo spendi quando hai bisogno')}</Text>
              </View>
            </View>

            <View style={styles.infoItem}>
              <View style={[styles.infoIcon, { backgroundColor: '#F87828' + '20' }]}>
                <Ionicons name="qr-code" size={20} color="#F87828" />
              </View>
              <View style={styles.infoText}>
                <Text style={styles.infoTitle}>{tt('Check-in QR')}</Text>
                <Text style={styles.infoDescription}>{tt('Valida l\'incontro con il codice QR')}</Text>
              </View>
            </View>
          </View>
        </View>

      </ScrollView>

      {/* Donate Modal */}
      <Modal visible={showDonateModal} transparent animationType="slide">
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <Text style={styles.modalTitle}>{tt('Dona al Fondo Solidarietà')}</Text>
            <Text style={styles.modalDescription}>{tt('I tuoi')}{' '}{CURRENCY_NAME}{' '}{tt('aiuteranno anziani e persone fragili della community')}</Text>
            
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
                <Text style={styles.modalCancelText}>{tt('Annulla')}</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.modalConfirmButton} onPress={handleDonate}>
                <Ionicons name="heart" size={20} color="#fff" />
                <Text style={styles.modalConfirmText}>{tt('Dona')}</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* Referral Modal */}
      <Modal visible={showReferralModal} transparent animationType="slide">
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <Text style={styles.modalTitle}>{tt('Invita i Tuoi Amici')}</Text>
            <Text style={styles.modalDescription}>{tt('Guadagna')}{' '}{referralInfo?.bonus_per_referral || 3} {CURRENCY_NAME}{' '}{tt('quando un amico completa il primo favore')}</Text>
            
            <View style={styles.referralCodeBox}>
              <Text style={styles.referralCodeLabel}>{tt('Il tuo codice:')}</Text>
              <Text style={styles.referralCode}>{referralInfo?.referral_code || '...'}</Text>
            </View>

            <View style={styles.referralStats}>
              <View style={styles.referralStatItem}>
                <Text style={styles.referralStatValue}>{referralInfo?.successful_referrals || 0}</Text>
                <Text style={styles.referralStatLabel}>{tt('Inviti Completati')}</Text>
              </View>
              <View style={styles.referralStatItem}>
                <Text style={styles.referralStatValue}>
                  {(referralInfo?.successful_referrals || 0) * (referralInfo?.bonus_per_referral || 3)}
                </Text>
                <Text style={styles.referralStatLabel}>{CURRENCY_NAME}{' '}{tt('Guadagnati')}</Text>
              </View>
            </View>

            <View style={styles.modalButtons}>
              <TouchableOpacity
                style={styles.modalCancelButton}
                onPress={() => setShowReferralModal(false)}
              >
                <Text style={styles.modalCancelText}>{tt('Chiudi')}</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.modalConfirmButton} onPress={handleShareReferral}>
                <Ionicons name="share-social" size={20} color="#fff" />
                <Text style={styles.modalConfirmText}>{tt('Condividi')}</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* Leaderboard Modal */}
      <Modal visible={showLeaderboard} transparent animationType="slide">
        <View style={styles.modalOverlay}>
          <View style={[styles.modalContent, styles.leaderboardModal]}>
            <Text style={styles.modalTitle}>{tt('Classifica Community')}</Text>
            
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
                    <Text style={styles.leaderboardTitle}>{tt(item.title)}</Text>
                  </View>
                  <View style={styles.leaderboardScore}>
                    <Text style={styles.leaderboardScoreValue}>{item.community_score}</Text>
                    <Text style={styles.leaderboardScoreLabel}>{tt('punti')}</Text>
                  </View>
                </View>
              ))}
            </ScrollView>

            <TouchableOpacity
              style={styles.modalCloseButton}
              onPress={() => setShowLeaderboard(false)}
            >
              <Text style={styles.modalCloseText}>{tt('Chiudi')}</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      {/* Skills Selection Modal */}
      <Modal visible={showSkillsModal} transparent animationType="slide">
        <View style={styles.modalOverlay}>
          <View style={[styles.modalContent, styles.skillsModal]}>
            <Text style={styles.modalTitle}>{tt('Le Tue Competenze')}</Text>
            <Text style={styles.modalDescription}>{tt('Seleziona le categorie in cui puoi aiutare. Riceverai notifiche quando qualcuno cerca aiuto in queste aree.')}</Text>
            
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
                        color={isSelected ? '#fff' : '#9DB3A4'} 
                      />
                    </View>
                    <View style={styles.skillSelectInfo}>
                      <Text style={[styles.skillSelectName, isSelected && styles.skillSelectNameActive]}>
                        {tt(category.name)}
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
                {selectedSkills.length}{' '}{tt('competenze selezionate')}</Text>
            </View>

            <View style={styles.modalButtons}>
              <TouchableOpacity
                style={styles.modalCancelButton}
                onPress={() => setShowSkillsModal(false)}
              >
                <Text style={styles.modalCancelText}>{tt('Annulla')}</Text>
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
                    <Ionicons name="save" size={20} color="#fff" />
                    <Text style={styles.modalConfirmText}>{tt('Salva')}</Text>
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
                    color={selectedBadge.earned ? '#fff' : '#8FA595'}
                  />
                </View>
                <Text style={styles.badgeModalTitle}>{selectedBadge.name}</Text>
                <View style={[styles.badgeModalStatus, selectedBadge.earned ? styles.badgeEarned : styles.badgeLocked]}>
                  <Ionicons name={selectedBadge.earned ? 'checkmark-circle' : 'lock-closed'} size={16} color={selectedBadge.earned ? '#B8C868' : '#8FA595'} />
                  <Text style={[styles.badgeStatusText, selectedBadge.earned && styles.badgeStatusEarned]}>
                    {selectedBadge.earned ? tt('Ottenuto!') : tt('Non ancora ottenuto')}
                  </Text>
                </View>
                <Text style={styles.badgeModalDescription}>
                  {BADGE_INFO[selectedBadge.name]?.description || selectedBadge.description || tt('Badge della community.')}
                </Text>
                <View style={styles.badgeHowToGet}>
                  <Ionicons name="bulb" size={20} color="#FFD700" />
                  <Text style={styles.badgeHowToGetText}>
                    {BADGE_INFO[selectedBadge.name]?.howToGet || tt('Partecipa attivamente alla community.')}
                  </Text>
                </View>
                <TouchableOpacity style={styles.badgeModalClose} onPress={() => setShowBadgeModal(false)}>
                  <Text style={styles.badgeModalCloseText}>{tt('Chiudi')}</Text>
                </TouchableOpacity>
              </>
            )}
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}
