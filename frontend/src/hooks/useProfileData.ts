import { useCallback, useRef, useState } from 'react';
import { api, Badge, Category, LeaderboardUser } from '../services/api';
import type { ReferralInfo } from '../components/profile/ReferralModal';
import type { ReceivedReview } from '../components/profile/ReviewsSection';
import { logger } from '../utils/logger';

interface ProfileData {
  earnedBadges: Badge[];
  allBadges: Badge[];
  categories: Category[];
  skills: string[];
  reviews: ReceivedReview[];
  fund: number;
  referral: ReferralInfo | null;
}

const EMPTY: ProfileData = { earnedBadges: [], allBadges: [], categories: [], skills: [], reviews: [], fund: 0, referral: null };

const valueOf = <T,>(result: PromiseSettledResult<T>): T | undefined => (result.status === 'fulfilled' ? result.value : undefined);

/**
 * I dati del profilo. Le richieste partono insieme e una che fallisce non cancella le altre.
 * L'elenco dei badge e le categorie non cambiano: si chiedono una volta sola.
 */
export function useProfileData(token: string | null, userId: string | undefined) {
  const [data, setData] = useState<ProfileData>(EMPTY);
  const [failed, setFailed] = useState(false);
  const staticLoaded = useRef({ badges: false, categories: false });

  const load = useCallback(async () => {
    if (!token) return;
    const needBadges = !staticLoaded.current.badges;
    const needCategories = !staticLoaded.current.categories;
    const results = await Promise.allSettled([
      api.getMyBadges(token),
      api.getSolidarityFund(),
      api.getReferralCode(token),
      api.getUserSkills(token),
      userId ? api.getUserReviews(userId, token) : Promise.resolve([] as ReceivedReview[]),
      needBadges ? api.getAllBadges() : Promise.resolve(undefined),
      needCategories ? api.getCategories() : Promise.resolve(undefined),
    ]);
    const [earned, fund, referral, skills, reviews, allBadges, categories] = results;
    if (allBadges.status === 'fulfilled' && allBadges.value) staticLoaded.current.badges = true;
    if (categories.status === 'fulfilled' && categories.value) staticLoaded.current.categories = true;

    setData((previous) => ({
      earnedBadges: valueOf(earned) ?? previous.earnedBadges,
      fund: valueOf(fund)?.solidarity_fund_total ?? previous.fund,
      referral: valueOf(referral) ?? previous.referral,
      skills: valueOf(skills)?.skills ?? previous.skills,
      reviews: (valueOf(reviews) as ReceivedReview[] | undefined) ?? previous.reviews,
      allBadges: valueOf(allBadges) ?? previous.allBadges,
      categories: valueOf(categories) ?? previous.categories,
    }));
    const anyFailed = results.some((result) => result.status === 'rejected');
    if (anyFailed) logger.debug('Alcuni dati del profilo non si sono caricati');
    setFailed(anyFailed);
  }, [token, userId]);

  const setSkills = useCallback((skills: string[]) => setData((previous) => ({ ...previous, skills })), []);

  return { ...data, failed, load, setSkills };
}

/** La classifica si chiede solo quando serve (si apre il pannello). */
export function useLeaderboard(token: string | null) {
  const [users, setUsers] = useState<LeaderboardUser[]>([]);
  const [loading, setLoading] = useState(false);
  const [failed, setFailed] = useState(false);

  const load = useCallback(async () => {
    if (!token) return;
    setLoading(true);
    setFailed(false);
    try {
      setUsers(await api.getLeaderboard(token));
    } catch (error) {
      logger.debug('Errore nel caricare la classifica:', error);
      setFailed(true);
    } finally {
      setLoading(false);
    }
  }, [token]);

  return { users, loading, failed, load };
}
