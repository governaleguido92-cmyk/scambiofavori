import React, { useState, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Dimensions,
  FlatList,
  TouchableOpacity,
  Animated,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import colors from '../theme/colors';

const { width } = Dimensions.get('window');

interface RegistrationOnboardingProps {
  onComplete: () => void;
}

const SLIDES = [
  {
    id: '1',
    icon: 'heart-circle',
    iconColor: '#ff6b6b',
    title: 'Il Senso Etico',
    subtitle: 'Una community basata sulla reciprocità',
    points: [
      { icon: 'people', text: 'Aiutare chi ci sta accanto rafforza i legami' },
      { icon: 'sync', text: 'Dare e ricevere in equilibrio' },
      { icon: 'shield-checkmark', text: 'No soldi, solo tempo e gentilezza' },
    ],
    quote: '"Non si è mai così ricchi come quando si dona il proprio tempo"',
  },
  {
    id: '2',
    icon: 'diamond',
    iconColor: '#4ecca3',
    title: 'I Granelli',
    subtitle: 'La valuta del tempo',
    points: [
      { icon: 'time', text: '1 Granello = 1 ora del tuo tempo' },
      { icon: 'gift', text: 'Inizi con 3 Granelli di benvenuto' },
      { icon: 'trending-up', text: 'Offrendo aiuto guadagni Granelli' },
    ],
    quote: '"Il tempo è la moneta più preziosa che possiedi"',
  },
  {
    id: '3',
    icon: 'rocket',
    iconColor: '#ffd93d',
    title: 'Come Funziona',
    subtitle: 'Semplice e trasparente',
    points: [
      { icon: 'add-circle', text: 'Offri un favore → Guadagni Granelli' },
      { icon: 'remove-circle', text: 'Chiedi un favore → Spendi Granelli' },
      { icon: 'star', text: 'Le recensioni costruiscono fiducia' },
    ],
    quote: '"Insieme siamo più forti"',
  },
];

export default function RegistrationOnboarding({ onComplete }: RegistrationOnboardingProps) {
  const [currentIndex, setCurrentIndex] = useState(0);
  const flatListRef = useRef<FlatList>(null);
  const scrollX = useRef(new Animated.Value(0)).current;

  const handleNext = () => {
    if (currentIndex < SLIDES.length - 1) {
      flatListRef.current?.scrollToIndex({ index: currentIndex + 1 });
    } else {
      onComplete();
    }
  };

  const handleSkip = () => {
    onComplete();
  };

  const renderSlide = ({ item, index }: { item: typeof SLIDES[0]; index: number }) => (
    <View style={styles.slide}>
      <View style={[styles.iconContainer, { backgroundColor: item.iconColor + '20' }]}>
        <Ionicons name={item.icon as any} size={60} color={item.iconColor} />
      </View>
      
      <Text style={styles.title}>{item.title}</Text>
      <Text style={styles.subtitle}>{item.subtitle}</Text>
      
      <View style={styles.pointsContainer}>
        {item.points.map((point, idx) => (
          <View key={idx} style={styles.pointRow}>
            <View style={styles.pointIcon}>
              <Ionicons name={point.icon as any} size={22} color={colors.accent} />
            </View>
            <Text style={styles.pointText}>{point.text}</Text>
          </View>
        ))}
      </View>
      
      <Text style={styles.quote}>{item.quote}</Text>
    </View>
  );

  const onViewableItemsChanged = useRef(({ viewableItems }: any) => {
    if (viewableItems.length > 0) {
      setCurrentIndex(viewableItems[0].index || 0);
    }
  }).current;

  return (
    <View style={styles.container}>
      <TouchableOpacity style={styles.skipButton} onPress={handleSkip}>
        <Text style={styles.skipText}>Salta</Text>
      </TouchableOpacity>

      <FlatList
        ref={flatListRef}
        data={SLIDES}
        renderItem={renderSlide}
        keyExtractor={(item) => item.id}
        horizontal
        pagingEnabled
        showsHorizontalScrollIndicator={false}
        onViewableItemsChanged={onViewableItemsChanged}
        viewabilityConfig={{ viewAreaCoveragePercentThreshold: 50 }}
        onScroll={Animated.event(
          [{ nativeEvent: { contentOffset: { x: scrollX } } }],
          { useNativeDriver: false }
        )}
      />

      {/* Pagination dots */}
      <View style={styles.pagination}>
        {SLIDES.map((_, index) => {
          const inputRange = [
            (index - 1) * width,
            index * width,
            (index + 1) * width,
          ];
          const scale = scrollX.interpolate({
            inputRange,
            outputRange: [1, 1.4, 1],
            extrapolate: 'clamp',
          });
          const opacity = scrollX.interpolate({
            inputRange,
            outputRange: [0.4, 1, 0.4],
            extrapolate: 'clamp',
          });
          return (
            <Animated.View
              key={index}
              style={[
                styles.dot,
                {
                  transform: [{ scale }],
                  opacity,
                  backgroundColor: currentIndex === index ? colors.accent : '#555',
                },
              ]}
            />
          );
        })}
      </View>

      {/* Next button */}
      <TouchableOpacity style={styles.nextButton} onPress={handleNext}>
        <Text style={styles.nextText}>
          {currentIndex === SLIDES.length - 1 ? 'Iniziamo!' : 'Avanti'}
        </Text>
        <Ionicons
          name={currentIndex === SLIDES.length - 1 ? 'checkmark' : 'arrow-forward'}
          size={20}
          color={colors.background}
        />
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  skipButton: {
    position: 'absolute',
    top: 50,
    right: 20,
    zIndex: 10,
    padding: 10,
  },
  skipText: {
    color: colors.textMuted,
    fontSize: 16,
  },
  slide: {
    width,
    paddingHorizontal: 30,
    paddingTop: 100,
    alignItems: 'center',
  },
  iconContainer: {
    width: 120,
    height: 120,
    borderRadius: 60,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 30,
  },
  title: {
    fontSize: 28,
    fontWeight: 'bold',
    color: colors.textPrimary,
    textAlign: 'center',
    marginBottom: 10,
  },
  subtitle: {
    fontSize: 16,
    color: colors.textMuted,
    textAlign: 'center',
    marginBottom: 30,
  },
  pointsContainer: {
    width: '100%',
    marginBottom: 30,
  },
  pointRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 16,
    paddingHorizontal: 10,
  },
  pointIcon: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: colors.accent + '15',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 14,
  },
  pointText: {
    flex: 1,
    fontSize: 15,
    color: colors.textPrimary,
    lineHeight: 22,
  },
  quote: {
    fontSize: 14,
    fontStyle: 'italic',
    color: colors.textMuted,
    textAlign: 'center',
    paddingHorizontal: 20,
  },
  pagination: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 20,
  },
  dot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    marginHorizontal: 5,
  },
  nextButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.accent,
    marginHorizontal: 30,
    marginBottom: 40,
    paddingVertical: 16,
    borderRadius: 14,
    gap: 8,
  },
  nextText: {
    fontSize: 18,
    fontWeight: '600',
    color: colors.background,
  },
});
