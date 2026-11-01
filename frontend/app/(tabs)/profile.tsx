import React, { useState, useCallback, useMemo } from 'react';
import { View, Text, TouchableOpacity, ScrollView, Share, RefreshControl } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter, useFocusEffect } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useAuth } from '../../src/context/AuthContext';
import { api, CURRENCY_SYMBOL } from '../../src/services/api';
import { ProfileCompletionBar } from '../../src/components/ProfileCompletionBar';
import { ProfileHero } from '../../src/components/profile/ProfileHero';
import { ProfileStats } from '../../src/components/profile/ProfileStats';
import { BadgeShelf } from '../../src/components/profile/BadgeShelf';
import { BadgeInfoModal } from '../../src/components/profile/BadgeInfoModal';
import { SkillsSection, SkillsModal } from '../../src/components/profile/SkillsSection';
import { ReviewsSection } from '../../src/components/profile/ReviewsSection';
import { DonateModal } from '../../src/components/profile/DonateModal';
import { ReferralModal } from '../../src/components/profile/ReferralModal';
import { LeaderboardModal } from '../../src/components/profile/LeaderboardModal';
import { styles } from '../../src/styles/profile.styles';
import { SUPPORTER_PURCHASE_ENABLED } from '../../src/utils/features';
import { logger } from '../../src/utils/logger';
import { notify } from '../../src/utils/notify';
import { tt, tx } from '../../src/i18n/tt';
import { granelliWord } from '../../src/utils/granelli';
import { ShelfBadge, sortBadges } from '../../src/utils/profileProgress';
import { useProfileData, useLeaderboard } from '../../src/hooks/useProfileData';
import { useProfilePhoto } from '../../src/hooks/useProfilePhoto';

const SITE_URL = 'https://scambiofavori.it';

export default function ProfileScreen() {
  const { user, token, refreshUser } = useAuth();
  const router = useRouter();
  const data = useProfileData(token, user?.user_id);
  const leaderboard = useLeaderboard(token);
  const [refreshing, setRefreshing] = useState(false);
  const [showDonate, setShowDonate] = useState(false);
  const [showReferral, setShowReferral] = useState(false);
  const [showLeaderboard, setShowLeaderboard] = useState(false);
  const [showSkills, setShowSkills] = useState(false);
  const [selectedSkills, setSelectedSkills] = useState<string[]>([]);
  const [savingSkills, setSavingSkills] = useState(false);
  const [selectedBadge, setSelectedBadge] = useState<ShelfBadge | null>(null);
  // Fa ricaricare la barra "Completa il tuo profilo" quando cambia qualcosa che conta (foto, competenze)
  const [completionKey, setCompletionKey] = useState(0);

  const { load, setSkills } = data;
  const photo = useProfilePhoto(token, async () => {
    await refreshUser();
    setCompletionKey((key) => key + 1);
  });

  useFocusEffect(
    useCallback(() => {
      refreshUser();
      load();
    }, [load, refreshUser])
  );

  const shelfBadges = useMemo(() => sortBadges(data.allBadges, data.earnedBadges), [data.allBadges, data.earnedBadges]);
  const balance = user?.granelli || 0;

  const onRefresh = async () => {
    setRefreshing(true);
    await Promise.all([refreshUser(), load()]);
    setRefreshing(false);
  };

  const handleSaveName = async (name: string): Promise<boolean> => {
    if (!token) return false;
    try {
      await api.updateUserName(name, token);
      await refreshUser();
      notify(tt('Successo'), tt('Nome aggiornato!'));
      return true;
    } catch (error: any) {
      notify(tt('Errore'), error.message || tt('Impossibile aggiornare il nome'));
      return false;
    }
  };

  const handleDonate = async (amount: number): Promise<boolean> => {
    if (!token) return false;
    try {
      await api.createDonation(amount, undefined, 'Donazione al Fondo Solidarietà', token);
      await Promise.all([refreshUser(), load()]);
      setShowDonate(false);
      notify(tt('Grazie!'), tx('Hai donato {0} {1} al Fondo Solidarietà', [amount, granelliWord(amount)]));
      return true;
    } catch (error: any) {
      notify(tt('Errore'), error.message);
      return false;
    }
  };

  const handleShareReferral = async () => {
    if (!data.referral) return;
    try {
      await Share.share({
        message: tx(
          "Unisciti a Scambio Favori, l'app per scambiarsi favori tra vicini! Usa il mio codice {0} quando ti registri e parti con dei Granelli in più. {1}",
          [data.referral.referral_code, SITE_URL]
        ),
      });
    } catch (error) {
      logger.debug('Error sharing:', error);
    }
  };

  const openSkills = () => {
    setSelectedSkills(data.skills);
    setShowSkills(true);
  };

  const toggleSkill = (name: string) =>
    setSelectedSkills((previous) => (previous.includes(name) ? previous.filter((skill) => skill !== name) : [...previous, name]));

  const handleSaveSkills = async () => {
    if (!token) return;
    setSavingSkills(true);
    try {
      const result = await api.updateUserSkills(selectedSkills, token);
      setSkills(result.skills);
      setShowSkills(false);
      setCompletionKey((key) => key + 1);
      notify(tt('Successo'), tt('Competenze aggiornate! Riceverai notifiche per favori in queste categorie.'));
    } catch (error: any) {
      notify(tt('Errore'), error.message || tt('Impossibile salvare le competenze'));
    } finally {
      setSavingSkills(false);
    }
  };

  const openLeaderboard = () => {
    setShowLeaderboard(true);
    leaderboard.load();
  };

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView
        contentContainerStyle={styles.scrollContent}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#B8C868" />}
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

        {data.failed && (
          <Text style={styles.skillsHint} accessibilityLiveRegion="polite">
            {tt('Alcuni dati non si sono aggiornati. Tira giù per riprovare.')}
          </Text>
        )}

        <ProfileHero
          user={user}
          profileImage={photo.profileImage}
          uploadingImage={photo.uploadingImage}
          onPickImage={photo.pickImage}
          onSaveName={handleSaveName}
        />
        <ProfileStats user={user} />

        {token && <ProfileCompletionBar token={token} refreshKey={completionKey} onItemPress={(itemId) => itemId === 'skills' && openSkills()} />}

        <BadgeShelf badges={shelfBadges} onPress={setSelectedBadge} />
        <SkillsSection skills={data.skills} onEdit={openSkills} />
        <ReviewsSection reviews={data.reviews} />

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>{tt('Fondo Solidarietà')}</Text>
          <View style={styles.fundCard}>
            <View style={styles.fundInfo}>
              <Ionicons name="heart" size={32} color="#ff6b6b" />
              <View>
                <Text style={styles.fundAmount}>{data.fund} {granelliWord(data.fund)}</Text>
                <Text style={styles.fundLabel}>{tt('disponibili per chi ha bisogno')}</Text>
              </View>
            </View>
            <TouchableOpacity style={styles.donateButton} onPress={() => setShowDonate(true)} accessibilityRole="button" accessibilityLabel={tt('Dona al Fondo Solidarietà')}>
              <Ionicons name="gift" size={20} color="#fff" />
              <Text style={styles.donateButtonText}>{tt('Dona')}</Text>
            </TouchableOpacity>
          </View>
          <Text style={styles.fundDescription}>{tt('Il Fondo Solidarietà aiuta anziani e persone fragili a partecipare alla community')}</Text>
        </View>

        <TouchableOpacity style={styles.referralCard} onPress={() => setShowReferral(true)} accessibilityRole="button">
          <View style={styles.referralLeft}>
            <Ionicons name="people" size={32} color="#F87828" />
            <View>
              <Text style={styles.referralTitle}>{tt('Invita Amici')}</Text>
              <Text style={styles.referralSubtitle}>{data.referral?.successful_referrals || 0}{' '}{tt('inviti completati')}</Text>
            </View>
          </View>
          <Ionicons name="chevron-forward" size={24} color="#9DB3A4" />
        </TouchableOpacity>

        {/* "Sostieni il Progetto" è nascosto su Android (norme di Google Play Billing) */}
        {SUPPORTER_PURCHASE_ENABLED && (
          <TouchableOpacity style={styles.supporterCard} onPress={() => router.push('/supporter' as any)} accessibilityRole="button" data-testid="become-supporter-button">
            <View style={styles.referralLeft}>
              <View style={styles.supporterIconWrapper}>
                <Ionicons name="heart" size={32} color="#ffd700" />
              </View>
              <View>
                <Text style={styles.supporterTitle}>{user?.is_supporter ? tt('Sei un Pilastro della Community') : tt('Sostieni il Progetto')}</Text>
                <Text style={styles.supporterSubtitle}>{user?.is_supporter ? tt('Grazie! Gestisci il tuo contributo') : tt('Diventa un Pilastro della Community')}</Text>
              </View>
            </View>
            <Ionicons name="chevron-forward" size={24} color="#ffd700" />
          </TouchableOpacity>
        )}

        <TouchableOpacity style={styles.leaderboardButton} onPress={openLeaderboard} accessibilityRole="button">
          <Ionicons name="trophy" size={24} color="#ffd700" />
          <Text style={styles.leaderboardButtonText}>{tt('Classifica Community')}</Text>
          <Ionicons name="chevron-forward" size={24} color="#9DB3A4" />
        </TouchableOpacity>

        <View style={styles.infoSection}>
          <Text style={styles.sectionTitle}>{tt('Come Funzionano i Granelli')}</Text>
          <View style={styles.infoCard}>
            <View style={styles.infoItem}>
              <View style={[styles.infoIcon, { backgroundColor: '#B8C86820' }]}>
                <Text style={styles.infoIconText}>{CURRENCY_SYMBOL}</Text>
              </View>
              <View style={styles.infoText}>
                <Text style={styles.infoTitle}>{tt('1 Ora = 1 Granello')}</Text>
                <Text style={styles.infoDescription}>{tt("Un'ora del tuo aiuto vale 1 Granello: lo guadagni aiutando e lo spendi quando hai bisogno")}</Text>
              </View>
            </View>
            <View style={styles.infoItem}>
              <View style={[styles.infoIcon, { backgroundColor: '#F8782820' }]}>
                <Ionicons name="qr-code" size={20} color="#F87828" />
              </View>
              <View style={styles.infoText}>
                <Text style={styles.infoTitle}>{tt('Check-in QR')}</Text>
                <Text style={styles.infoDescription}>{tt("Valida l'incontro con il codice QR")}</Text>
              </View>
            </View>
          </View>
        </View>
      </ScrollView>

      <DonateModal visible={showDonate} balance={balance} onClose={() => setShowDonate(false)} onDonate={handleDonate} />
      <ReferralModal visible={showReferral} info={data.referral} onClose={() => setShowReferral(false)} onShare={handleShareReferral} />
      <LeaderboardModal
        visible={showLeaderboard}
        loading={leaderboard.loading}
        failed={leaderboard.failed}
        users={leaderboard.users}
        currentUserId={user?.user_id}
        onClose={() => setShowLeaderboard(false)}
      />
      <SkillsModal
        visible={showSkills}
        categories={data.categories}
        selected={selectedSkills}
        saving={savingSkills}
        onToggle={toggleSkill}
        onSave={handleSaveSkills}
        onClose={() => setShowSkills(false)}
      />
      <BadgeInfoModal badge={selectedBadge} onClose={() => setSelectedBadge(null)} />
    </SafeAreaView>
  );
}
