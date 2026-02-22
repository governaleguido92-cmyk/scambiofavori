import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  Alert,
  TextInput,
  Modal,
  Share,
  RefreshControl,
  ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter, useFocusEffect } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useAuth } from '../../src/context/AuthContext';
import { api, Badge, LeaderboardUser, Category, CURRENCY_NAME, CURRENCY_SYMBOL } from '../../src/services/api';
import { ProfileCompletionBar } from '../../src/components/ProfileCompletionBar';
import { SupporterProfileBorder, SupporterBadge } from '../../src/components/SupporterBadge';

const BADGE_ICONS: Record<string, string> = {
  'heart': 'heart',
  'home': 'home',
  'school': 'school',
  'people': 'people',
  'flash': 'flash',
  'footsteps': 'footsteps',
  'sunny': 'sunny',
  'ribbon': 'ribbon',
};

export default function ProfileScreen() {
  const { user, token, logout, refreshUser } = useAuth();
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
    } catch (error) {
      console.log('Error loading profile data:', error);
    }
  }, [token]);

  useFocusEffect(
    useCallback(() => {
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
            router.replace('/(auth)/login');
          },
        },
      ]
    );
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
      console.log('Error sharing:', error);
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
            <SupporterProfileBorder isSupporter={user?.is_supporter || false} size={80}>
              <View style={styles.avatar}>
                <Text style={styles.avatarText}>
                  {user?.name?.charAt(0).toUpperCase() || 'U'}
                </Text>
              </View>
            </SupporterProfileBorder>
            <View style={styles.levelBadge}>
              <Text style={styles.levelText}>Lv.{currentLevel}</Text>
            </View>
          </View>
          <View style={styles.nameContainer}>
            <Text style={styles.userName}>{user?.name}</Text>
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
          <ScrollView horizontal showsHorizontalScrollIndicator={false}>
            {allBadges.map((badge) => {
              const earned = badges.some(b => b.id === badge.id);
              return (
                <View
                  key={badge.id}
                  style={[styles.badgeCard, !earned && styles.badgeCardLocked]}
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
                </View>
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
              <View style={[styles.infoIcon, { backgroundColor: '#ff9800' + '20' }]}>
                <Ionicons name="flash" size={20} color="#ff9800" />
              </View>
              <View style={styles.infoText}>
                <Text style={styles.infoTitle}>Micro-Favori</Text>
                <Text style={styles.infoDescription}>
                  Consigli e info rapide per uso quotidiano
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

        {/* Logout Button */}
        <TouchableOpacity style={styles.logoutButton} onPress={handleLogout}>
          <Ionicons name="log-out" size={20} color="#ff6b6b" />
          <Text style={styles.logoutText}>Esci</Text>
        </TouchableOpacity>
      </ScrollView>

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
                      {category.is_micro && (
                        <View style={styles.microBadge}>
                          <Ionicons name="flash" size={10} color="#ff9800" />
                          <Text style={styles.microBadgeText}>Micro</Text>
                        </View>
                      )}
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
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#1a1a2e',
  },
  scrollContent: {
    padding: 20,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 20,
  },
  title: {
    fontSize: 28,
    fontWeight: 'bold',
    color: '#fff',
  },
  verifiedBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#4ecca320',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
    gap: 4,
  },
  verifiedText: {
    color: '#4ecca3',
    fontSize: 12,
    fontWeight: '600',
  },
  profileCard: {
    backgroundColor: '#16213e',
    borderRadius: 20,
    padding: 24,
    alignItems: 'center',
    marginBottom: 16,
  },
  avatarContainer: {
    position: 'relative',
    marginBottom: 12,
  },
  avatar: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: '#1a1a2e',
    justifyContent: 'center',
    alignItems: 'center',
  },
  avatarText: {
    fontSize: 32,
    fontWeight: 'bold',
    color: '#4ecca3',
  },
  levelBadge: {
    position: 'absolute',
    bottom: -4,
    right: -4,
    backgroundColor: '#ffd700',
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 10,
  },
  levelText: {
    color: '#1a1a2e',
    fontSize: 12,
    fontWeight: 'bold',
  },
  userName: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#fff',
    marginBottom: 2,
  },
  userTitle: {
    fontSize: 14,
    color: '#4ecca3',
    fontWeight: '600',
    marginBottom: 4,
  },
  userEmail: {
    fontSize: 14,
    color: '#888',
    marginBottom: 16,
  },
  progressSection: {
    width: '100%',
    marginBottom: 16,
  },
  progressHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 8,
  },
  progressLabel: {
    color: '#888',
    fontSize: 14,
  },
  progressValue: {
    color: '#4ecca3',
    fontSize: 14,
    fontWeight: '600',
  },
  progressBar: {
    height: 8,
    backgroundColor: '#1a1a2e',
    borderRadius: 4,
    overflow: 'hidden',
  },
  progressFill: {
    height: '100%',
    backgroundColor: '#4ecca3',
    borderRadius: 4,
  },
  progressHint: {
    color: '#666',
    fontSize: 12,
    marginTop: 4,
    textAlign: 'center',
  },
  // Social Impact Bar Styles
  socialImpactSection: {
    width: '100%',
    marginTop: 16,
    backgroundColor: '#1a1a2e',
    borderRadius: 12,
    padding: 12,
  },
  socialImpactHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  socialImpactTitle: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  socialImpactLabel: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '600',
  },
  socialImpactLevel: {
    color: '#ff6b6b',
    fontSize: 14,
    fontWeight: 'bold',
  },
  socialImpactBar: {
    height: 10,
    backgroundColor: '#333',
    borderRadius: 5,
    overflow: 'hidden',
  },
  socialImpactFill: {
    height: '100%',
    backgroundColor: '#ff6b6b',
    borderRadius: 5,
  },
  socialImpactStats: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: 8,
  },
  socialImpactScore: {
    color: '#ff6b6b',
    fontSize: 14,
    fontWeight: '600',
  },
  socialImpactHint: {
    color: '#666',
    fontSize: 10,
  },
  ratingsContainer: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    width: '100%',
  },
  ratingItem: {
    alignItems: 'center',
  },
  ratingLabel: {
    color: '#888',
    fontSize: 12,
    marginBottom: 4,
  },
  starsRow: {
    flexDirection: 'row',
  },
  statsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
    marginBottom: 20,
  },
  statCard: {
    flex: 1,
    minWidth: '45%',
    backgroundColor: '#16213e',
    borderRadius: 16,
    padding: 16,
    alignItems: 'center',
  },
  statSymbol: {
    fontSize: 28,
  },
  statValue: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#fff',
    marginTop: 8,
  },
  statLabel: {
    fontSize: 12,
    color: '#888',
    marginTop: 4,
  },
  section: {
    marginBottom: 20,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#fff',
    marginBottom: 12,
  },
  badgeCard: {
    backgroundColor: '#16213e',
    borderRadius: 12,
    padding: 12,
    alignItems: 'center',
    marginRight: 12,
    width: 100,
  },
  badgeCardLocked: {
    opacity: 0.5,
  },
  badgeIcon: {
    width: 48,
    height: 48,
    borderRadius: 24,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 8,
  },
  badgeName: {
    color: '#fff',
    fontSize: 11,
    textAlign: 'center',
    fontWeight: '600',
  },
  badgeNameLocked: {
    color: '#666',
  },
  fundCard: {
    backgroundColor: '#16213e',
    borderRadius: 16,
    padding: 16,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  fundInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  fundAmount: {
    color: '#fff',
    fontSize: 20,
    fontWeight: 'bold',
  },
  fundLabel: {
    color: '#888',
    fontSize: 12,
  },
  donateButton: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#ff6b6b',
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 12,
    gap: 6,
  },
  donateButtonText: {
    color: '#fff',
    fontWeight: '600',
  },
  fundDescription: {
    color: '#666',
    fontSize: 12,
    marginTop: 8,
    textAlign: 'center',
  },
  referralCard: {
    backgroundColor: '#16213e',
    borderRadius: 16,
    padding: 16,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  referralLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  referralTitle: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
  referralSubtitle: {
    color: '#888',
    fontSize: 12,
  },
  supporterCard: {
    backgroundColor: '#ffd70010',
    borderRadius: 16,
    padding: 16,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
    borderWidth: 1,
    borderColor: '#ffd70040',
  },
  supporterIconWrapper: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: '#ffd70020',
    justifyContent: 'center',
    alignItems: 'center',
  },
  supporterTitle: {
    color: '#ffd700',
    fontSize: 16,
    fontWeight: '700',
  },
  supporterSubtitle: {
    color: '#888',
    fontSize: 12,
  },
  leaderboardButton: {
    backgroundColor: '#16213e',
    borderRadius: 16,
    padding: 16,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginBottom: 12,
  },
  leaderboardButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
    flex: 1,
  },
  oggettotecaButton: {
    backgroundColor: '#16213e',
    borderRadius: 16,
    padding: 16,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginBottom: 20,
  },
  oggettotecaButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
  oggettotecaBadge: {
    backgroundColor: '#9c27b020',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 8,
    flex: 1,
  },
  oggettotecaBadgeText: {
    color: '#9c27b0',
    fontSize: 11,
    fontWeight: '600',
  },
  infoSection: {
    marginBottom: 20,
  },
  infoCard: {
    backgroundColor: '#16213e',
    borderRadius: 16,
    padding: 16,
  },
  infoItem: {
    flexDirection: 'row',
    marginBottom: 16,
  },
  infoIcon: {
    width: 40,
    height: 40,
    borderRadius: 20,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },
  infoIconText: {
    fontSize: 20,
  },
  infoText: {
    flex: 1,
  },
  infoTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: '#fff',
    marginBottom: 2,
  },
  infoDescription: {
    fontSize: 12,
    color: '#888',
  },
  logoutButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255, 107, 107, 0.1)',
    borderWidth: 1,
    borderColor: '#ff6b6b',
    borderRadius: 12,
    padding: 16,
    gap: 8,
    marginBottom: 20,
  },
  logoutText: {
    color: '#ff6b6b',
    fontSize: 16,
    fontWeight: '600',
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.7)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  modalContent: {
    backgroundColor: '#16213e',
    borderRadius: 20,
    padding: 24,
    width: '100%',
    maxWidth: 400,
  },
  modalTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#fff',
    textAlign: 'center',
    marginBottom: 8,
  },
  modalDescription: {
    color: '#888',
    textAlign: 'center',
    marginBottom: 24,
  },
  donateInputContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 20,
  },
  donateAdjust: {
    backgroundColor: '#1a1a2e',
    width: 44,
    height: 44,
    borderRadius: 22,
    justifyContent: 'center',
    alignItems: 'center',
  },
  donateInput: {
    backgroundColor: '#1a1a2e',
    color: '#ffd700',
    fontSize: 32,
    fontWeight: 'bold',
    textAlign: 'center',
    width: 100,
    paddingVertical: 12,
    borderRadius: 12,
  },
  donateCreditsLabel: {
    color: '#888',
    textAlign: 'center',
    marginTop: 8,
    marginBottom: 24,
  },
  modalButtons: {
    flexDirection: 'row',
    gap: 12,
  },
  modalCancelButton: {
    flex: 1,
    padding: 14,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#888',
    alignItems: 'center',
  },
  modalCancelText: {
    color: '#888',
    fontWeight: '600',
  },
  modalConfirmButton: {
    flex: 1,
    flexDirection: 'row',
    padding: 14,
    borderRadius: 12,
    backgroundColor: '#4ecca3',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  modalConfirmText: {
    color: '#fff',
    fontWeight: '600',
  },
  referralCodeBox: {
    backgroundColor: '#1a1a2e',
    padding: 20,
    borderRadius: 12,
    alignItems: 'center',
    marginBottom: 20,
  },
  referralCodeLabel: {
    color: '#888',
    fontSize: 14,
    marginBottom: 8,
  },
  referralCode: {
    color: '#4ecca3',
    fontSize: 28,
    fontWeight: 'bold',
    letterSpacing: 4,
  },
  referralStats: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    marginBottom: 24,
  },
  referralStatItem: {
    alignItems: 'center',
  },
  referralStatValue: {
    color: '#fff',
    fontSize: 24,
    fontWeight: 'bold',
  },
  referralStatLabel: {
    color: '#888',
    fontSize: 12,
  },
  leaderboardModal: {
    maxHeight: '80%',
  },
  leaderboardList: {
    maxHeight: 400,
  },
  leaderboardItem: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#1a1a2e',
    padding: 12,
    borderRadius: 12,
    marginBottom: 8,
  },
  leaderboardItemMe: {
    borderWidth: 2,
    borderColor: '#4ecca3',
  },
  leaderboardRank: {
    width: 40,
    alignItems: 'center',
  },
  leaderboardRankText: {
    color: '#888',
    fontSize: 18,
    fontWeight: 'bold',
  },
  leaderboardInfo: {
    flex: 1,
    marginLeft: 12,
  },
  leaderboardName: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
  leaderboardTitle: {
    color: '#4ecca3',
    fontSize: 12,
  },
  leaderboardScore: {
    alignItems: 'flex-end',
  },
  leaderboardScoreValue: {
    color: '#ffd700',
    fontSize: 18,
    fontWeight: 'bold',
  },
  leaderboardScoreLabel: {
    color: '#888',
    fontSize: 10,
  },
  modalCloseButton: {
    padding: 14,
    borderRadius: 12,
    backgroundColor: '#1a1a2e',
    alignItems: 'center',
    marginTop: 16,
  },
  modalCloseText: {
    color: '#fff',
    fontWeight: '600',
  },
  // Skills Section Styles
  sectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  editSkillsButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: '#4ecca320',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 8,
  },
  editSkillsText: {
    color: '#4ecca3',
    fontSize: 13,
    fontWeight: '600',
  },
  skillsContainer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginBottom: 8,
  },
  skillTag: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: '#16213e',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: '#4ecca340',
  },
  skillTagText: {
    color: '#fff',
    fontSize: 13,
    fontWeight: '500',
  },
  noSkillsCard: {
    backgroundColor: '#16213e',
    borderRadius: 16,
    padding: 24,
    alignItems: 'center',
  },
  noSkillsTitle: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
    marginTop: 12,
    marginBottom: 8,
  },
  noSkillsDescription: {
    color: '#888',
    fontSize: 13,
    textAlign: 'center',
    marginBottom: 16,
    lineHeight: 20,
  },
  addSkillsButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: '#4ecca3',
    paddingHorizontal: 20,
    paddingVertical: 12,
    borderRadius: 12,
  },
  addSkillsButtonText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '600',
  },
  skillsHint: {
    color: '#666',
    fontSize: 11,
    textAlign: 'center',
    marginTop: 8,
  },
  // Skills Modal Styles
  skillsModal: {
    maxHeight: '80%',
  },
  skillsList: {
    maxHeight: 350,
    marginBottom: 12,
  },
  skillSelectItem: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#1a1a2e',
    padding: 14,
    borderRadius: 12,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: 'transparent',
  },
  skillSelectItemActive: {
    borderColor: '#4ecca3',
    backgroundColor: '#4ecca310',
  },
  skillSelectIcon: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#333',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },
  skillSelectIconActive: {
    backgroundColor: '#4ecca3',
  },
  skillSelectInfo: {
    flex: 1,
  },
  skillSelectName: {
    color: '#fff',
    fontSize: 15,
    fontWeight: '600',
  },
  skillSelectNameActive: {
    color: '#4ecca3',
  },
  microBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginTop: 4,
  },
  microBadgeText: {
    color: '#ff9800',
    fontSize: 11,
    fontWeight: '500',
  },
  skillCheckbox: {
    width: 24,
    height: 24,
    borderRadius: 12,
    borderWidth: 2,
    borderColor: '#555',
    justifyContent: 'center',
    alignItems: 'center',
  },
  skillCheckboxActive: {
    backgroundColor: '#4ecca3',
    borderColor: '#4ecca3',
  },
  selectedCount: {
    alignItems: 'center',
    marginBottom: 16,
  },
  selectedCountText: {
    color: '#888',
    fontSize: 13,
  },
  modalConfirmButtonDisabled: {
    opacity: 0.6,
  },
});
