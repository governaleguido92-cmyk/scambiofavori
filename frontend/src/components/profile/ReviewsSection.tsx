import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { styles } from '../../styles/profile.styles';
import { tt, tx } from '../../i18n/tt';
import i18n from '../../i18n';
import { averageReviewRating } from '../../utils/profileProgress';
import { serverDate } from '../../utils/serverDate';
import colors from '../../theme/colors';

export interface ReceivedReview {
  review_id: string;
  rating: number;
  created_at: string;
  reviewer_name: string;
  comment?: string | null;
  public_thanks?: string | null;
}

const VISIBLE_REVIEWS = 5;

interface ReviewsSectionProps {
  reviews: ReceivedReview[];
}

/** Le recensioni ricevute, con la media in testa: "★ 4,8 · 12". */
export function ReviewsSection({ reviews }: ReviewsSectionProps) {
  const locale = i18n.language === 'en' ? 'en-GB' : 'it-IT';
  const average = averageReviewRating(reviews);
  return (
    <View style={styles.section}>
      <View style={styles.sectionHeader}>
        <Text style={styles.sectionTitle}>{tt('Recensioni Ricevute')}</Text>
        <View
          style={styles.reviewsCount}
          accessible
          accessibilityLabel={average === null ? tt('Nessuna recensione') : tx('Media {0} su {1} recensioni', [average.toLocaleString(locale), reviews.length])}
        >
          <Ionicons name="star" size={16} color={colors.primary} />
          <Text style={styles.reviewsCountText}>
            {average === null ? '0' : `${average.toLocaleString(locale)} · ${reviews.length}`}
          </Text>
        </View>
      </View>

      {reviews.length > 0 ? (
        <View style={styles.reviewsList}>
          {reviews.slice(0, VISIBLE_REVIEWS).map((review) => (
            <View key={review.review_id} style={styles.reviewCard}>
              <View style={styles.reviewHeader}>
                <View style={styles.reviewStars}>
                  {[1, 2, 3, 4, 5].map((star) => (
                    <Ionicons key={star} name={star <= review.rating ? 'star' : 'star-outline'} size={16} color={colors.primary} />
                  ))}
                </View>
                <Text style={styles.reviewDate}>{serverDate(review.created_at).toLocaleDateString(locale)}</Text>
              </View>
              <Text style={styles.reviewerName}>{tt('da')}{' '}{review.reviewer_name}</Text>
              {review.comment ? <Text style={styles.reviewComment}>{`"${review.comment}"`}</Text> : null}
              {review.public_thanks ? (
                <View style={styles.publicThanksContainer}>
                  <Ionicons name="heart" size={14} color={colors.accent} />
                  <Text style={styles.publicThanksText}>{review.public_thanks}</Text>
                </View>
              ) : null}
            </View>
          ))}
          {reviews.length > VISIBLE_REVIEWS && (
            <Text style={styles.moreReviewsText}>+{reviews.length - VISIBLE_REVIEWS}{' '}{tt('altre recensioni')}</Text>
          )}
        </View>
      ) : (
        <View style={local.empty}>
          <Ionicons name="chatbubble-ellipses-outline" size={26} color={colors.textMuted} />
          <Text style={local.emptyText}>{tt('Nessuna recensione ricevuta ancora. Completa dei favori per ricevere feedback!')}</Text>
        </View>
      )}
    </View>
  );
}

const local = StyleSheet.create({
  empty: {
    flexDirection: 'row', alignItems: 'center', gap: 12, padding: 14, borderRadius: 14,
    backgroundColor: colors.backgroundCard, borderWidth: 1, borderColor: colors.border,
  },
  emptyText: { flex: 1, color: colors.textMuted, fontSize: 13, lineHeight: 18 },
});
