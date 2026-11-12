import React from 'react';
import { View, Text, TouchableOpacity, Modal, ScrollView, ActivityIndicator, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import type { Category } from '../../services/api';
import { styles } from '../../styles/profile.styles';
import { tt, tx } from '../../i18n/tt';
import { getCategoryVisual } from '../../utils/favorVisual';
import { modalAnimation } from '../../utils/reducedMotion';
import colors from '../../theme/colors';

interface SkillsSectionProps {
  skills: string[];
  onEdit: () => void;
}

/** Le competenze scelte, con emoji e colore della categoria. Senza competenze, un invito compatto ad aggiungerle. */
export function SkillsSection({ skills, onEdit }: SkillsSectionProps) {
  return (
    <View style={styles.section}>
      <View style={styles.sectionHeader}>
        <Text style={styles.sectionTitle}>{tt('Le Tue Competenze')}</Text>
        {skills.length > 0 && (
          <TouchableOpacity
            style={styles.editSkillsButton}
            onPress={onEdit}
            accessibilityRole="button"
            accessibilityLabel={tt('Modifica le competenze')}
            data-testid="edit-skills-button"
          >
            <Ionicons name="pencil" size={16} color={colors.primary} />
            <Text style={styles.editSkillsText}>{tt('Modifica')}</Text>
          </TouchableOpacity>
        )}
      </View>

      {skills.length > 0 ? (
        <View style={styles.skillsContainer}>
          {skills.map((skill) => {
            const visual = getCategoryVisual(skill);
            return (
              <View key={skill} style={[styles.skillTag, { backgroundColor: `${visual.color}33`, borderColor: visual.color }]} data-testid={`skill-tag-${skill}`}>
                <Text style={local.emoji}>{visual.emoji}</Text>
                <Text style={styles.skillTagText}>{tt(skill)}</Text>
              </View>
            );
          })}
        </View>
      ) : (
        <TouchableOpacity style={local.emptyCard} onPress={onEdit} accessibilityRole="button" data-testid="add-skills-button">
          <Ionicons name="school-outline" size={28} color={colors.textMuted} />
          <View style={local.emptyText}>
            <Text style={styles.noSkillsTitle}>{tt('Nessuna competenza selezionata')}</Text>
            <Text style={local.emptyHint}>{tt('Scegli in cosa sai aiutare: ti avvisiamo quando qualcuno cerca proprio quello.')}</Text>
          </View>
          <Ionicons name="add-circle" size={28} color={colors.primary} />
        </TouchableOpacity>
      )}
    </View>
  );
}

interface SkillsModalProps {
  visible: boolean;
  categories: Category[];
  selected: string[];
  saving: boolean;
  onToggle: (name: string) => void;
  onSave: () => void;
  onClose: () => void;
}

export function SkillsModal({ visible, categories, selected, saving, onToggle, onSave, onClose }: SkillsModalProps) {
  return (
    <Modal visible={visible} transparent animationType={modalAnimation()} onRequestClose={onClose}>
      <View style={styles.modalOverlay}>
        <View style={[styles.modalContent, styles.skillsModal]}>
          <Text style={styles.modalTitle}>{tt('Le Tue Competenze')}</Text>
          <Text style={styles.modalDescription}>{tt('Seleziona le categorie in cui puoi aiutare. Riceverai notifiche quando qualcuno cerca aiuto in queste aree.')}</Text>

          <ScrollView style={styles.skillsList} showsVerticalScrollIndicator={false}>
            {categories.map((category) => {
              const isSelected = selected.includes(category.name);
              const visual = getCategoryVisual(category.name);
              return (
                <TouchableOpacity
                  key={category.name}
                  style={[styles.skillSelectItem, isSelected && styles.skillSelectItemActive]}
                  onPress={() => onToggle(category.name)}
                  accessibilityRole="checkbox"
                  accessibilityState={{ checked: isSelected }}
                  data-testid={`skill-select-${category.name}`}
                >
                  <View style={[styles.skillSelectIcon, isSelected && { backgroundColor: visual.color }]}>
                    <Text style={local.emojiBig}>{visual.emoji}</Text>
                  </View>
                  <View style={styles.skillSelectInfo}>
                    <Text style={[styles.skillSelectName, isSelected && styles.skillSelectNameActive]}>{tt(category.name)}</Text>
                  </View>
                  <View style={[styles.skillCheckbox, isSelected && styles.skillCheckboxActive]}>
                    {isSelected && <Ionicons name="checkmark" size={16} color={colors.white} />}
                  </View>
                </TouchableOpacity>
              );
            })}
          </ScrollView>

          <View style={styles.selectedCount}>
            <Text style={styles.selectedCountText}>{tx('{0} competenze selezionate', [selected.length])}</Text>
          </View>

          <View style={styles.modalButtons}>
            <TouchableOpacity style={styles.modalCancelButton} onPress={onClose} accessibilityRole="button">
              <Text style={styles.modalCancelText}>{tt('Annulla')}</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.modalConfirmButton, saving && styles.modalConfirmButtonDisabled]}
              onPress={onSave}
              disabled={saving}
              accessibilityRole="button"
            >
              {saving ? (
                <ActivityIndicator size="small" color={colors.background} />
              ) : (
                <>
                  <Ionicons name="save" size={20} color={colors.background} />
                  <Text style={styles.modalConfirmText}>{tt('Salva')}</Text>
                </>
              )}
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  );
}

const local = StyleSheet.create({
  emoji: { fontSize: 15 },
  emojiBig: { fontSize: 20 },
  emptyCard: {
    flexDirection: 'row', alignItems: 'center', gap: 12, padding: 14, borderRadius: 14,
    backgroundColor: colors.backgroundCard, borderWidth: 1, borderColor: colors.border,
  },
  emptyText: { flex: 1 },
  emptyHint: { color: colors.textMuted, fontSize: 12.5, lineHeight: 17, marginTop: 2 },
});
