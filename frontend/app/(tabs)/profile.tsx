import { GranelloIcon } from '../../src/components/GranelloIcon';
import React, { useState, useCallback, useMemo } from 'react';
import { Alert, View, Text, TouchableOpacity, ScrollView, Share, RefreshControl } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter, useFocusEffect } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useAuth } from '../../src/context/AuthContext';
import { api } from '../../src/services/api';
import { ProfileCompletionBar } from '../../src/components/ProfileCompletionBar';
import { ProfileHero } from '../../src/components/profile/ProfileHero';
import { ProfileStats } from '../../src/components/profile/ProfileStats';
import { TrustCard } from '../../src/components/profile/TrustCard';
import { FundProgress } from '../../src/components/profile/FundProgress';
import { BadgeShelf } from '../../src/components/profile/BadgeShelf';
import { BadgeInfoModal } from '../../src/components/profile/BadgeInfoModal';
import { SkillsSection, SkillsModal } from '../../src/components/profile/SkillsSection';
import { ReviewsSection } from '../../src/components/profile/ReviewsSection';
import { DonateModal } from '../../src/components/profile/DonateModal';
import { ReferralModal } from '../../src/components/profile/ReferralModal';
import { BioCard } from '../../src/components/profile/BioCard';
import { SectionTitle } from '../../src/components/profile/SectionTitle';
import { styles } from '../../src/styles/profile.styles';
import { BrandLogo } from '../../src/components/BrandLogo';
import { SUPPORTER_PURCHASE_ENABLED } from '../../src/utils/features';
import { logger } from '../../src/utils/logger';
import { notify } from '../../src/utils/notify';
import { tt, tx } from '../../src/i18n/tt';
import { granelliWord } from '../../src/utils/granelli';
import { ShelfBadge, sortBadges } from '../../src/utils/profileProgress';
import { useProfileData } from '../../src/hooks/useProfileData';
import { useProfilePhoto } from '../../src/hooks/useProfilePhoto';

const SITE_URL = 'https://scambiofavori.it';

export default function ProfileScreen() {
  const { user, token, refreshUser } = useAuth();
  const router = useRouter();
  const data = useProfileData(token, user?.user_id);
  const [refreshing, setRefreshing] = useState(false);
  const [showDonate, setShowDonate] = useState(false);
  const [showReferral, setShowReferral] = useState(false);
  const [isModerator, setIsModerator] = useState(false);
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
      if (token) api.getModerationMe(token).then((r) => setIsModerator(r.moderator)).catch(() => setIsModerator(false));
    }, [load, refreshUser, token])
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

  const handleSaveBio = async (bio: string) => {
    if (!token) return;
    await api.updateUserBio(bio, token);
    await refreshUser();
  };

  const askFundGift = () => {
    if (!token) return;
    Alert.alert(
      tt('Chiedi un dono al Fondo'),
      tt('Il Fondo Solidarietà ti dona fino a 3 Granelli per tornare in pari. Si chiede una volta, dopo aver aiutato almeno una volta.'),
      [
        { text: tt('Annulla'), style: 'cancel' },
        {
          text: tt('Chiedi il dono'),
          onPress: async () => {
            try {
              const result = await api.requestDebtRecovery(token);
              await Promise.all([refreshUser(), load()]);
              notify(tt('Dono ricevuto'), result.message);
            } catch (error: any) {
              notify(tt('Errore'), error.message || tt('Impossibile chiedere il dono'));
            }
          },
        },
      ]
    );
  };

  const explainGranelli = () =>
    Alert.alert(
      tt('Come Funzionano i Granelli'),
      `${tt('1 Ora = 1 Granello')}\n${tt("Un'ora del tuo aiuto vale 1 Granello: lo guadagni aiutando e lo spendi quando hai bisogno")}\n\n${tt('Check-in QR')}\n${tt("Valida l'incontro con il codice QR")}`,
      [{ text: tt('Ho capito') }]
    );

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView
        contentContainerStyle={styles.scrollContent}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#98AA4A" />}
      >
        <View style={styles.header}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
            <BrandLogo />
            <Text style={styles.title}>{tt('Profilo')}</Text>
          </View>
          <TouchableOpacity
            onPress={() => router.push('/settings' as any)}
            accessibilityRole="button"
            accessibilityLabel={tt('Impostazioni')}
            hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
            data-testid="open-settings"
          >
            <Ionicons name="settings-outline" size={24} color="#fff" />
          </TouchableOpacity>
        </View>

        {data.failed && (
          <Text style={styles.skillsHint} accessibilityLiveRegion="polite">
            {tt('Alcuni dati non si sono aggiornati. Tira giù per riprovare.')}
          </Text>
        )}

        {isModerator && (
          <TouchableOpacity
            style={{ flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: '#F87828', borderRadius: 14, padding: 14, marginBottom: 12 }}
            onPress={() => router.push('/moderazione' as any)}
            accessibilityRole="button"
            accessibilityLabel={tt('Apri il pannello di moderazione')}
            data-testid="open-moderation-panel"
          >
            <Ionicons name="shield-checkmark" size={26} color="#0C0E09" />
            <View style={{ flex: 1 }}>
              <Text style={{ color: '#0C0E09', fontSize: 16, fontWeight: '800' }}>{tt('Pannello di moderazione')}</Text>
              <Text style={{ color: '#0C0E09', fontSize: 13 }}>{tt('Segnalazioni da gestire e account in revisione')}</Text>
            </View>
            <Ionicons name="chevron-forward" size={22} color="#0C0E09" />
          </TouchableOpacity>
        )}

        {/* IO: chi sono per gli altri */}
        <SectionTitle>{tt('Il mio profilo')}</SectionTitle>
        <ProfileHero
          user={user}
          profileImage={photo.profileImage}
          uploadingImage={photo.uploadingImage}
          onPickImage={photo.pickImage}
          onSaveName={handleSaveName}
        />
        <BioCard bio={user?.bio} onSave={handleSaveBio} />
        <ProfileStats user={user} />
        <TouchableOpacity
          style={styles.leaderboardButton}
          onPress={() => user && router.push(`/vicino/${user.user_id}` as any)}
          accessibilityRole="button"
          accessibilityLabel={tt('Come ti vedono gli altri')}
          data-testid="view-as-others"
        >
          <Ionicons name="eye-outline" size={24} color="#98AA4A" />
          <Text style={styles.leaderboardButtonText}>{tt('Come ti vedono gli altri')}</Text>
          <Ionicons name="chevron-forward" size={24} color="#A5A89B" />
        </TouchableOpacity>

        {/* IL MIO PERCORSO: fiducia, profilo, badge, competenze, recensioni */}
        <SectionTitle>{tt('Il mio percorso')}</SectionTitle>
        {token && <TrustCard token={token} />}
        <FundProgress
          done={user?.total_favors_given ?? 0}
          unlocked={!!user?.badges?.includes('eroe_quartiere')}
        />
        {token && <ProfileCompletionBar token={token} refreshKey={completionKey} onItemPress={(itemId) => itemId === 'skills' && openSkills()} />}
        <BadgeShelf badges={shelfBadges} onPress={setSelectedBadge} progress={data.badgeProgress} />
        <SkillsSection skills={data.skills} onEdit={openSkills} />
        <ReviewsSection reviews={data.reviews} />

        {/* LA MIA COMUNITÀ: Fondo, inviti, sostegno */}
        <SectionTitle>{tt('La mia comunità')}</SectionTitle>
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>{tt('Fondo Solidarietà')}</Text>
          <View style={styles.fundCard}>
            <View style={styles.fundInfo}>
              <Ionicons name="heart" size={32} color="#F87828" />
              <View>
                <Text style={styles.fundAmount}>{data.fund} {granelliWord(data.fund)}</Text>
                <Text style={styles.fundLabel}>{tt('disponibili per chi ha bisogno')}</Text>
              </View>
            </View>
            <TouchableOpacity style={styles.donateButton} onPress={() => setShowDonate(true)} accessibilityRole="button" accessibilityLabel={tt('Dona al Fondo Solidarietà')}>
              <Ionicons name="gift" size={20} color="#0C0E09" />
              <Text style={styles.donateButtonText}>{tt('Dona')}</Text>
            </TouchableOpacity>
          </View>
          <Text style={styles.fundDescription}>{tt('Il Fondo si riempie con i Granelli donati dai vicini. Chi è in debito, dopo aver aiutato almeno una volta, può chiedere un dono di fino a 3 Granelli.')}</Text>
          {balance < 0 && (
            <TouchableOpacity style={[styles.donateButton, { marginTop: 10, alignSelf: 'flex-start' }]} onPress={askFundGift} accessibilityRole="button" data-testid="ask-fund-gift">
              <Ionicons name="hand-left" size={20} color="#0C0E09" />
              <Text style={styles.donateButtonText}>{tt('Chiedi un dono al Fondo')}</Text>
            </TouchableOpacity>
          )}
        </View>

        <TouchableOpacity style={styles.referralCard} onPress={() => setShowReferral(true)} accessibilityRole="button">
          <View style={styles.referralLeft}>
            <Ionicons name="people" size={32} color="#F87828" />
            <View>
              <Text style={styles.referralTitle}>{tt('Invita Amici')}</Text>
              <Text style={styles.referralSubtitle}>{data.referral?.successful_referrals || 0}{' '}{tt('inviti completati')}</Text>
            </View>
          </View>
          <Ionicons name="chevron-forward" size={24} color="#A5A89B" />
        </TouchableOpacity>

        {/* "Sostieni il Progetto" è nascosto su Android (norme di Google Play Billing) */}
        {SUPPORTER_PURCHASE_ENABLED && (
          <TouchableOpacity style={styles.supporterCard} onPress={() => router.push('/supporter' as any)} accessibilityRole="button" data-testid="become-supporter-button">
            <View style={styles.referralLeft}>
              <View style={styles.supporterIconWrapper}>
                <Ionicons name="heart" size={32} color="#98AA4A" />
              </View>
              <View>
                <Text style={styles.supporterTitle}>{user?.is_supporter ? tt('Sei un Pilastro della Community') : tt('Sostieni il Progetto')}</Text>
                <Text style={styles.supporterSubtitle}>{user?.is_supporter ? tt('Grazie! Gestisci il tuo contributo') : tt('Diventa un Pilastro della Community')}</Text>
              </View>
            </View>
            <Ionicons name="chevron-forward" size={24} color="#98AA4A" />
          </TouchableOpacity>
        )}

        <TouchableOpacity style={styles.leaderboardButton} onPress={explainGranelli} accessibilityRole="button" data-testid="explain-granelli">
          <Ionicons name="help-circle-outline" size={24} color="#98AA4A" />
          <Text style={styles.leaderboardButtonText}>{tt('Come Funzionano i Granelli')}</Text>
          <Ionicons name="chevron-forward" size={24} color="#A5A89B" />
        </TouchableOpacity>
      </ScrollView>

      <DonateModal visible={showDonate} balance={balance} onClose={() => setShowDonate(false)} onDonate={handleDonate} />
      <ReferralModal visible={showReferral} info={data.referral} onClose={() => setShowReferral(false)} onShare={handleShareReferral} />
      <SkillsModal
        visible={showSkills}
        categories={data.categories}
        selected={selectedSkills}
        saving={savingSkills}
        onToggle={toggleSkill}
        onSave={handleSaveSkills}
        onClose={() => setShowSkills(false)}
      />
      <BadgeInfoModal badge={selectedBadge} onClose={() => setSelectedBadge(null)} progress={selectedBadge ? data.badgeProgress[selectedBadge.id] : undefined} />
    </SafeAreaView>
  );
}
