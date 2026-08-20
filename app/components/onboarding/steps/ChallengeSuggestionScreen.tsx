import { Ionicons } from "@expo/vector-icons";
import React from "react";
import { Pressable, Text, View } from "react-native";

import { palette } from "@/constants/theme";
import { useTheme } from "@/hooks/useTheme";
import { PRESET_CHALLENGES } from "@/lib/presetChallenges";
import { ScreenShell } from "./shared";
import { ORANGE, SOFT_ORANGE, makeStyles } from "./theme";

const RECOMMENDATIONS_BY_FOCUS: Record<string, string[]> = {
  health: ["30-day-reset", "75-soft"],
  mindset: ["21-day-habit-builder", "75-soft"],
  work: ["digital-detox-week", "21-day-habit-builder"],
  relations: ["21-day-habit-builder", "digital-detox-week"],
  creative: ["21-day-habit-builder", "digital-detox-week"],
  finance: ["21-day-habit-builder", "75-soft"],
};

const RECOMMENDATION_REASONS: Record<string, string> = {
  health: "Builds a repeatable foundation around energy, movement, and recovery.",
  mindset: "Adds enough structure to create momentum without making your routine feel heavy.",
  work: "Protects your attention and turns intention into a daily execution rhythm.",
  relations: "Creates more space to be present and consistent with the people around you.",
  creative: "Gives your ideas a dependable place in the day instead of waiting for inspiration.",
  finance: "Strengthens consistency first-the skill that makes any money system easier to maintain.",
};

export function ChallengeSuggestionScreen({
  focusAreas,
  selected,
  onSelect,
  onNext,
}: {
  focusAreas: string[];
  selected: string;
  onSelect: (challengeId: string) => void;
  onNext: () => void;
}) {
  const C = useTheme();
  const s = makeStyles(C);
  const recommendationIds = RECOMMENDATIONS_BY_FOCUS[focusAreas[0]] ?? [
    "21-day-habit-builder",
    "30-day-reset",
  ];
  const recommendations = recommendationIds
    .map((id) => PRESET_CHALLENGES.find((preset) => preset.id === id))
    .filter((preset) => preset !== undefined);
  const recommendationReason = RECOMMENDATION_REASONS[focusAreas[0]] ??
    "Gives your first habit a clear structure and a finish line you can work toward.";

  return (
    <ScreenShell
      onNext={onNext}
      cta={selected ? "Add challenge to my plan" : "Skip for now"}
      scroll
    >
      <View style={s.copyBlock}>
        <Text style={s.headline}>Want a clearer finish line?</Text>
        <Text style={s.body}>
          Based on your focus, these challenges can turn your first habit into a simple plan.
          This is optional.
        </Text>
      </View>

      <View style={s.cardList}>
        {recommendations.map((preset, index) => {
          const active = selected === preset.id;
          return (
            <Pressable
              key={preset.id}
              onPress={() => onSelect(active ? "" : preset.id)}
              style={[s.challengeSuggestionCard, active && s.challengeSuggestionCardActive]}
              accessibilityRole="button"
              accessibilityState={{ selected: active }}
              accessibilityLabel={`${preset.title}, ${preset.durationDays} days, ${preset.rules.length} daily rules`}
            >
              <View style={s.challengeSuggestionHeader}>
                <View style={[s.habitIconWrap, active && s.habitIconWrapActive]}>
                  <Ionicons
                    name={preset.icon}
                    size={22}
                    color={active ? ORANGE : palette.white70}
                  />
                </View>
                <View style={s.flex}>
                  {index === 0 && <Text style={s.recommendedEyebrow}>BEST MATCH</Text>}
                  <Text style={[s.habitTitle, active && s.habitTitleActive]}>{preset.title}</Text>
                  <Text style={s.habitSubtitle}>{preset.subtitle}</Text>
                </View>
                <Ionicons
                  name={active ? "checkmark-circle" : "ellipse-outline"}
                  size={22}
                  color={active ? ORANGE : palette.white25}
                />
              </View>

              <View style={s.challengeMetaRow}>
                <View style={s.challengeMetaItem}>
                  <Ionicons name="calendar-outline" size={13} color={palette.white55} />
                  <Text style={s.challengeMetaText}>{preset.durationDays} days</Text>
                </View>
                <View style={s.challengeMetaDot} />
                <View style={s.challengeMetaItem}>
                  <Ionicons name="repeat-outline" size={13} color={palette.white55} />
                  <Text style={s.challengeMetaText}>{preset.rules.length} daily rules</Text>
                </View>
              </View>

              {index === 0 && (
                <View style={s.challengeWhyCard}>
                  <Ionicons name="sparkles" size={15} color={SOFT_ORANGE} />
                  <View style={s.flex}>
                    <Text style={s.challengeWhyLabel}>WHY IT FITS YOU</Text>
                    <Text style={s.challengeWhyText}>{recommendationReason}</Text>
                  </View>
                </View>
              )}

              <View style={s.challengeRulesSection}>
                <Text style={s.challengeRulesLabel}>WHAT YOU&apos;LL DO EACH DAY</Text>
                <View style={s.challengeRulesList}>
                  {preset.rules.map((rule) => (
                    <View key={rule.title} style={s.challengeRuleRow}>
                      <View style={s.challengeRuleIcon}>
                        <Ionicons name={rule.icon} size={14} color={palette.white70} />
                      </View>
                      <View style={s.flex}>
                        <Text style={s.challengeRuleTitle}>{rule.title}</Text>
                        {rule.subtitle && (
                          <Text style={s.challengeRuleSubtitle}>{rule.subtitle}</Text>
                        )}
                      </View>
                    </View>
                  ))}
                </View>
              </View>
            </Pressable>
          );
        })}
      </View>

      <View style={s.challengeStartNote}>
        <Ionicons name="information-circle-outline" size={16} color={palette.white55} />
        <Text style={s.challengeStartNoteText}>
          If selected, these habits will be added when you finish setup. You can end the challenge
          anytime.
        </Text>
      </View>
    </ScreenShell>
  );
}
