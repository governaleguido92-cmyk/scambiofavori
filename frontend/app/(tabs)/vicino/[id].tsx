import { avatarColors } from '../../../src/utils/avatarColor';
import React, { useCallback, useState } from 'react';
import { ActivityIndicator, Alert, Image, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLocalSearchParams, useRouter, useFocusEffect } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useAuth } from '../../../src/context/AuthContext';
import { api, PublicProfile } from '../../../src/services/api';
import colors from '../../../src/theme/colors';
import { tt, tx } from '../../../src/i18n/tt';
import { notify, showRefusal } from '../../../src/utils/notify';
import { goBackOrHome } from '../../../src/utils/navigation';
import { badgeIconName } from '../../../src/components/profile/BadgeShelf';
import { ReportModal } from '../../../src/components/ReportModal';
import { GranelloIcon } from '../../../src/components/GranelloIcon';

const MONTHS = ['gennaio', 'febbraio', 'marzo', 'aprile', 'maggio', 'giugno', 'luglio', 'agosto', 'settembre', 'ottobre', 'novembre', 'dicembre'];

function memberSince(value: string | null): string {
  if (!value) return '';
  const [year, month] = value.split('-').map(Number);
  return `${MONTHS[(month || 1) - 1]} ${year}`;
}

/** Come si presenta in parole la puntualità: poche cifre, nessun giudizio brutale. */
function reliabilityText(profile: PublicProfile): string {
  const total = profile.total_favors_given + profile.late_cancellations;
  if (total < 3) return tt('Ancora pochi favori per giudicare la puntualità.');
  if (profile.late_cancellations === 0) return tt('Non ha mai annullato dopo aver accettato.');
  if (profile.cancel_rate <= 0.1) return tt('Quasi mai annulla dopo aver accettato.');
  return tx('Ha annullato {0} volte dopo aver accettato.', [profile.late_cancellations]);
}

function Stars({ value }: { value: number }) {
  return (
    <View style={styles.stars} accessibilityLabel={tx('{0} stelle su 5', [value])}>
      {[1, 2, 3, 4, 5].map((n) => (
        <Ionicons key={n} name={n <= Math.round(value) ? 'star' : 'star-outline'} size={16} color={colors.accent} />
      ))}
    </View>
  );
}

/** Il profilo di un vicino: per capire con chi si sta per scambiare un favore. Nessun dato privato. */
export default function NeighborProfileScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const { token, user } = useAuth();
  const [profile, setProfile] = useState<PublicProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState(false);
  const [showReport, setShowReport] = useState(false);
  const mine = !!user && user.user_id === id;

  const load = useCallback(async () => {
    if (!token || !id) return;
    try {
      setProfile(await api.getUserPublicProfile(id, token));
      setFailed(false);
    } catch {
      setFailed(true);
    } finally {
      setLoading(false);
    }
  }, [token, id]);

  useFocusEffect(
    useCallback(() => {
      setLoading(true);
      load();
      return undefined;
    }, [load])
  );

  const openMenu = () => {
    if (!token || !profile || mine) return;
    Alert.alert(profile.name, undefined, [
      { text: tt('Annulla'), style: 'cancel' },
      { text: tt('Segnala questa persona'), onPress: () => setShowReport(true) },
      {
        text: tx('Blocca {0}', [profile.name]),
        style: 'destructive',
        onPress: async () => {
          try {
            await api.blockUser(profile.user_id, undefined, token);
            notify(tt('Utente bloccato'), profile.name);
            goBackOrHome(router);
          } catch (error: any) {
            showRefusal(tt('Errore'), error?.message || tt('Impossibile bloccare l\'utente'), tt('Ho capito'));
          }
        },
      },
    ]);
  };

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => goBackOrHome(router)} accessibilityRole="button" accessibilityLabel={tt('Indietro')} hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}>
          <Ionicons name="arrow-back" size={24} color={colors.textPrimary} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>{tt('Profilo')}</Text>
        {!mine && profile ? (
          <TouchableOpacity onPress={openMenu} accessibilityRole="button" accessibilityLabel={tt('Altre azioni')} hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}>
            <Ionicons name="ellipsis-vertical" size={22} color={colors.textPrimary} />
          </TouchableOpacity>
        ) : <View style={{ width: 22 }} />}
      </View>

      {loading ? (
        <ActivityIndicator size="large" color={colors.accent} style={{ marginTop: 40 }} />
      ) : failed || !profile ? (
        <View style={styles.center}>
          <Ionicons name="person-outline" size={40} color={colors.textMuted} />
          <Text style={styles.emptyTitle}>{tt('Profilo non disponibile')}</Text>
        </View>
      ) : (
        <ScrollView contentContainerStyle={styles.content} data-testid="neighbor-profile">
          <View style={styles.hero}>
            {profile.picture ? (
              <Image source={{ uri: profile.picture }} style={styles.avatar} />
            ) : (
              <View style={[styles.avatar, styles.avatarFallback, { backgroundColor: avatarColors(profile.name).backgroundColor }]}>
                <Text style={[styles.avatarInitial, { color: avatarColors(profile.name).color }]}>{profile.name.charAt(0).toUpperCase()}</Text>
              </View>
            )}
            <Text style={styles.name}>{profile.name}</Text>
            <Text style={styles.title}>{tt(profile.title)}</Text>
            {!!profile.member_since && <Text style={styles.meta}>{tx('Nel quartiere da {0}', [memberSince(profile.member_since)])}</Text>}
            <View style={styles.chips}>
              {profile.phone_verified && (
                <View style={styles.chip}><Ionicons name="call" size={13} color={colors.lime} /><Text style={styles.chipText}>{tt('Telefono verificato')}</Text></View>
              )}
              {profile.identity_verified && (
                <View style={styles.chip}><Ionicons name="shield-checkmark" size={13} color={colors.lime} /><Text style={styles.chipText}>{tt('Identità verificata')}</Text></View>
              )}
              {profile.vouch_count > 0 && (
                <View style={styles.chip}><Ionicons name="people" size={13} color={colors.lime} /><Text style={styles.chipText}>{tx('Garantito da {0}', [profile.vouch_count])}</Text></View>
              )}
              {profile.is_supporter && (
                <View style={styles.chip}><GranelloIcon size={13} /><Text style={styles.chipText}>{tt('Sostenitore')}</Text></View>
              )}
            </View>
          </View>

          {!!profile.bio && (
            <View style={styles.box}>
              <Text style={styles.boxTitle}>{tt('Chi è')}</Text>
              <Text style={styles.boxText}>{profile.bio}</Text>
            </View>
          )}

          <View style={styles.statsRow}>
            <View style={styles.stat}>
              <Text style={styles.statValue}>{profile.total_favors_given}</Text>
              <Text style={styles.statLabel}>{tt('Ha aiutato')}</Text>
            </View>
            <View style={styles.stat}>
              <Text style={styles.statValue}>{profile.total_favors_received}</Text>
              <Text style={styles.statLabel}>{tt('Ha ricevuto aiuto')}</Text>
            </View>
            <View style={styles.stat}>
              <Text style={styles.statValue}>{profile.reviews_count > 0 ? profile.average_rating.toFixed(1) : '–'}</Text>
              <Text style={styles.statLabel}>{tx('{0} recensioni', [profile.reviews_count])}</Text>
            </View>
          </View>

          <View style={styles.box}>
            <Text style={styles.boxTitle}>{tt('Affidabilità')}</Text>
            <Text style={styles.boxText}>{reliabilityText(profile)}</Text>
          </View>

          {profile.skills.length > 0 && (
            <View style={styles.box}>
              <Text style={styles.boxTitle}>{tt('In cosa può aiutare')}</Text>
              <View style={styles.chips}>
                {profile.skills.map((skill) => (
                  <View key={skill} style={styles.skillChip}><Text style={styles.skillText}>{tt(skill)}</Text></View>
                ))}
              </View>
            </View>
          )}

          {profile.badge_details.length > 0 && (
            <View style={styles.box}>
              <Text style={styles.boxTitle}>{tx('Badge ({0})', [profile.badge_details.length])}</Text>
              <View style={styles.badges}>
                {profile.badge_details.map((badge) => (
                  <View key={badge.id} style={styles.badge}>
                    <View style={[styles.badgeIcon, { backgroundColor: badge.color }]}>
                      <Ionicons name={badgeIconName(badge.icon) as any} size={22} color={colors.background} />
                    </View>
                    <Text style={styles.badgeName} numberOfLines={2}>{tt(badge.name)}</Text>
                  </View>
                ))}
              </View>
            </View>
          )}

          <View style={styles.box}>
            <Text style={styles.boxTitle}>{tt('Cosa dicono di lui o di lei')}</Text>
            {profile.recent_reviews.length === 0 ? (
              <Text style={styles.boxText}>{tt('Ancora nessuna recensione.')}</Text>
            ) : (
              profile.recent_reviews.map((review, index) => (
                <View key={index} style={styles.review}>
                  <View style={styles.reviewHead}>
                    <Text style={styles.reviewer}>{review.reviewer_name}</Text>
                    <Stars value={review.rating} />
                  </View>
                  {!!review.comment && <Text style={styles.boxText}>{review.comment}</Text>}
                </View>
              ))
            )}
          </View>

          <Text style={styles.privacy}>{tt('Qui vedi solo ciò che serve a conoscersi: niente telefono, email o posizione.')}</Text>
        </ScrollView>
      )}

      {profile && token && (
        <ReportModal visible={showReport} onClose={() => setShowReport(false)} targetId={profile.user_id} reportType="user" targetName={profile.name} token={token} />
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingVertical: 12 },
  headerTitle: { color: colors.textPrimary, fontSize: 18, fontWeight: '800' },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 8 },
  emptyTitle: { color: colors.textPrimary, fontSize: 16, fontWeight: '800' },
  content: { paddingHorizontal: 16, paddingBottom: 40, gap: 12 },
  hero: { alignItems: 'center', gap: 4, paddingVertical: 8 },
  avatar: { width: 96, height: 96, borderRadius: 48 },
  avatarFallback: { backgroundColor: colors.backgroundLight, alignItems: 'center', justifyContent: 'center' },
  avatarInitial: { color: colors.lime, fontSize: 40, fontWeight: '800' },
  name: { color: colors.textPrimary, fontSize: 22, fontWeight: '800', marginTop: 8 },
  title: { color: colors.lime, fontSize: 14, fontWeight: '700' },
  meta: { color: colors.textMuted, fontSize: 13 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, justifyContent: 'center', marginTop: 8 },
  chip: { flexDirection: 'row', alignItems: 'center', gap: 5, backgroundColor: colors.backgroundCard, paddingHorizontal: 10, paddingVertical: 5, borderRadius: 999 },
  chipText: { color: colors.textSecondary, fontSize: 12.5, fontWeight: '600' },
  statsRow: { flexDirection: 'row', gap: 8 },
  stat: { flex: 1, backgroundColor: colors.backgroundCard, borderRadius: 12, padding: 12, alignItems: 'center', gap: 2 },
  statValue: { color: colors.textPrimary, fontSize: 22, fontWeight: '800' },
  statLabel: { color: colors.textMuted, fontSize: 12, textAlign: 'center' },
  box: { backgroundColor: colors.backgroundCard, borderRadius: 12, padding: 14, gap: 8 },
  boxTitle: { color: colors.textPrimary, fontSize: 15, fontWeight: '800' },
  boxText: { color: colors.textSecondary, fontSize: 14, lineHeight: 20 },
  skillChip: { backgroundColor: colors.limeMuted, paddingHorizontal: 10, paddingVertical: 5, borderRadius: 999 },
  skillText: { color: colors.lime, fontSize: 13, fontWeight: '600' },
  badges: { flexDirection: 'row', flexWrap: 'wrap', gap: 12 },
  badge: { width: 72, alignItems: 'center', gap: 4 },
  badgeIcon: { width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center' },
  badgeName: { color: colors.textSecondary, fontSize: 11, textAlign: 'center' },
  review: { gap: 4, borderTopWidth: 1, borderTopColor: colors.border, paddingTop: 8 },
  reviewHead: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  reviewer: { color: colors.textPrimary, fontSize: 14, fontWeight: '700' },
  stars: { flexDirection: 'row', gap: 1 },
  privacy: { color: colors.textMuted, fontSize: 12, textAlign: 'center', marginTop: 4 },
});
