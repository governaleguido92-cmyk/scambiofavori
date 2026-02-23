import React, { useState, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Dimensions,
  TouchableOpacity,
  FlatList,
  Animated,
  Modal,
} from 'react-native';
import { colors } from '../theme/colors';
import { Ionicons } from '@expo/vector-icons';

const { width, height } = Dimensions.get('window');

interface Slide {
  id: string;
  icon: keyof typeof Ionicons.glyphMap;
  title: string;
  description: string;
  highlight: string;
}

const slides: Slide[] = [
  {
    id: '1',
    icon: 'heart-circle',
    title: 'Scambia Favori',
    description: 'Offri e richiedi aiuto nella tua comunità. Dalla spesa al babysitting, dal giardinaggio alle ripetizioni.',
    highlight: 'Costruisci relazioni vere con i tuoi vicini',
  },
  {
    id: '2',
    icon: 'leaf',
    title: 'Guadagna Granelli',
    description: 'Ogni favore completato ti fa guadagnare Granelli, la valuta della comunità. Più aiuti, più puoi chiedere aiuto.',
    highlight: 'Un sistema equo basato sulla reciprocità',
  },
  {
    id: '3',
    icon: 'people-circle',
    title: 'Cresci Insieme',
    description: 'Sblocca badge, scala la classifica e diventa un pilastro della tua comunità. Il tuo impatto sociale conta!',
    highlight: 'Fai la differenza nel tuo quartiere',
  },
];

interface OnboardingSlidesProps {
  visible: boolean;
  onComplete: () => void;
}

export default function OnboardingSlides({ visible, onComplete }: OnboardingSlidesProps) {
  const [currentIndex, setCurrentIndex] = useState(0);
  const flatListRef = useRef<FlatList>(null);
  const scrollX = useRef(new Animated.Value(0)).current;

  const handleNext = () => {
    if (currentIndex < slides.length - 1) {
      flatListRef.current?.scrollToIndex({ index: currentIndex + 1 });
      setCurrentIndex(currentIndex + 1);
    } else {
      onComplete();
    }
  };

  const handleSkip = () => {
    onComplete();
  };

  const renderSlide = ({ item, index }: { item: Slide; index: number }) => (
    <View style={styles.slide}>
      {/* Icon Container */}
      <View style={styles.iconContainer}>
        <View style={styles.iconCircle}>
          <Ionicons name={item.icon} size={80} color={colors.accent} />
        </View>
        <View style={styles.iconGlow} />
      </View>

      {/* Content */}
      <View style={styles.content}>
        <Text style={styles.title}>{item.title}</Text>
        <Text style={styles.description}>{item.description}</Text>
        <View style={styles.highlightContainer}>
          <Ionicons name="sparkles" size={16} color={colors.accent} />
          <Text style={styles.highlight}>{item.highlight}</Text>
        </View>
      </View>
    </View>
  );

  const renderDots = () => (
    <View style={styles.dotsContainer}>
      {slides.map((_, index) => {
        const inputRange = [
          (index - 1) * width,
          index * width,
          (index + 1) * width,
        ];

        const dotWidth = scrollX.interpolate({
          inputRange,
          outputRange: [8, 24, 8],
          extrapolate: 'clamp',
        });

        const opacity = scrollX.interpolate({
          inputRange,
          outputRange: [0.3, 1, 0.3],
          extrapolate: 'clamp',
        });

        return (
          <Animated.View
            key={index}
            style={[
              styles.dot,
              {
                width: dotWidth,
                opacity,
                backgroundColor: index === currentIndex ? colors.accent : colors.textMuted,
              },
            ]}
          />
        );
      })}
    </View>
  );

  return (
    <Modal
      visible={visible}
      animationType="fade"
      transparent={false}
      statusBarTranslucent
    >
      <View style={styles.container}>
        {/* Skip Button */}
        <TouchableOpacity 
          style={styles.skipButton} 
          onPress={handleSkip}
          testID="onboarding-skip-btn"
        >
          <Text style={styles.skipText}>Salta</Text>
        </TouchableOpacity>

        {/* Slides */}
        <Animated.FlatList
          ref={flatListRef}
          data={slides}
          renderItem={renderSlide}
          keyExtractor={(item) => item.id}
          horizontal
          pagingEnabled
          showsHorizontalScrollIndicator={false}
          bounces={false}
          onScroll={Animated.event(
            [{ nativeEvent: { contentOffset: { x: scrollX } } }],
            { useNativeDriver: false }
          )}
          onMomentumScrollEnd={(event) => {
            const index = Math.round(event.nativeEvent.contentOffset.x / width);
            setCurrentIndex(index);
          }}
          scrollEventThrottle={16}
        />

        {/* Bottom Section */}
        <View style={styles.bottomSection}>
          {renderDots()}

          {/* Next/Start Button */}
          <TouchableOpacity
            style={styles.nextButton}
            onPress={handleNext}
            testID="onboarding-next-btn"
          >
            <Text style={styles.nextButtonText}>
              {currentIndex === slides.length - 1 ? 'Inizia!' : 'Avanti'}
            </Text>
            <Ionicons
              name={currentIndex === slides.length - 1 ? 'checkmark-circle' : 'arrow-forward'}
              size={24}
              color={colors.background}
            />
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  skipButton: {
    position: 'absolute',
    top: 60,
    right: 24,
    zIndex: 10,
    paddingVertical: 8,
    paddingHorizontal: 16,
  },
  skipText: {
    color: colors.textMuted,
    fontSize: 16,
    fontWeight: '500',
  },
  slide: {
    width,
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 32,
  },
  iconContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 48,
  },
  iconCircle: {
    width: 160,
    height: 160,
    borderRadius: 80,
    backgroundColor: colors.primaryMuted,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: colors.primary,
  },
  iconGlow: {
    position: 'absolute',
    width: 200,
    height: 200,
    borderRadius: 100,
    backgroundColor: colors.accentMuted,
    opacity: 0.3,
    zIndex: -1,
  },
  content: {
    alignItems: 'center',
  },
  title: {
    fontSize: 32,
    fontWeight: 'bold',
    color: colors.textPrimary,
    textAlign: 'center',
    marginBottom: 16,
  },
  description: {
    fontSize: 17,
    color: colors.textSecondary,
    textAlign: 'center',
    lineHeight: 26,
    marginBottom: 24,
    paddingHorizontal: 16,
  },
  highlightContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.accentMuted,
    paddingVertical: 12,
    paddingHorizontal: 20,
    borderRadius: 24,
    gap: 8,
  },
  highlight: {
    fontSize: 15,
    fontWeight: '600',
    color: colors.accent,
  },
  bottomSection: {
    paddingBottom: 60,
    paddingHorizontal: 32,
    alignItems: 'center',
  },
  dotsContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 32,
    gap: 8,
  },
  dot: {
    height: 8,
    borderRadius: 4,
  },
  nextButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.accent,
    paddingVertical: 18,
    paddingHorizontal: 48,
    borderRadius: 30,
    gap: 12,
    width: '100%',
    shadowColor: colors.accent,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 5,
  },
  nextButtonText: {
    fontSize: 18,
    fontWeight: 'bold',
    color: colors.background,
  },
});
