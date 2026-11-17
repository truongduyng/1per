import { Ionicons } from "@expo/vector-icons";
import React from "react";
import { Keyboard, Pressable, Text, TextInput, View } from "react-native";

import {
  DEFAULT_KEYSTONE_HABITS,
  KEYSTONE_HABITS_BY_FOCUS,
  type KeystoneHabit,
} from "@/hooks/useOnboarding";
import { useTheme } from "@/hooks/useTheme";
import { PAIN_TO_HABIT } from "./data";
import { ScreenShell } from "./shared";
import { makeStyles } from "./theme";

export const CUSTOM_HABIT_ID = "custom";

export function KeystoneScreen({
  selected,
  onSelect,
  onNext,
  painPoints,
  customHabitTitle,
  onCustomHabitTitleChange,
}: {
  selected: string;
  onSelect: (habit: KeystoneHabit) => void;
  onNext: () => void;
  painPoints: string[];
  customHabitTitle: string;
  onCustomHabitTitleChange: (title: string) => void;
}) {
  const C = useTheme();
  const s = makeStyles(C);
  const customInputRef = React.useRef<TextInput>(null);
  const [customExpanded, setCustomExpanded] = React.useState(selected === CUSTOM_HABIT_ID);

  const allHabits = [...Object.values(KEYSTONE_HABITS_BY_FOCUS).flat(), ...DEFAULT_KEYSTONE_HABITS];
  const seen = new Set<string>();
  const mappedHabits = painPoints.reduce<(KeystoneHabit & { reason?: string })[]>((acc, pain) => {
    const mapping = PAIN_TO_HABIT[pain];
    if (!mapping || seen.has(mapping.id)) return acc;
    const habit = allHabits.find((h) => h.id === mapping.id);
    if (!habit) return acc;
    seen.add(mapping.id);
    return [...acc, { ...habit, reason: mapping.reason }];
  }, []);
  const habits: (KeystoneHabit & { reason?: string })[] = mappedHabits.length > 0
    ? mappedHabits
    : DEFAULT_KEYSTONE_HABITS;

  const handleCustomPress = () => {
    setCustomExpanded(true);
    setTimeout(() => customInputRef.current?.focus(), 80);
    if (customHabitTitle.trim()) {
      onSelect({ id: CUSTOM_HABIT_ID, icon: "star-outline", title: customHabitTitle.trim(), subtitle: "" });
    }
  };

  const handleCustomChange = (text: string) => {
    onCustomHabitTitleChange(text);
    if (text.trim()) {
      onSelect({ id: CUSTOM_HABIT_ID, icon: "star-outline", title: text.trim(), subtitle: "" });
    }
  };

  const isCustomActive = selected === CUSTOM_HABIT_ID;
  const isCustomDim = Boolean(selected) && !isCustomActive;

  return (
    <ScreenShell onNext={onNext} disabled={!selected || (isCustomActive && !customHabitTitle.trim())} scroll>
      <View style={s.copyBlock}>
        <Text style={s.headline}>One habit to fix this</Text>
        {painPoints.length > 0 && (
          <View style={s.painReminder}>
            {painPoints.map((pain) => (
              <View key={pain} style={s.painTag}>
                <Ionicons name="alert-circle-outline" size={12} color={C.accentText} />
                <Text style={s.painTagText}>{pain}</Text>
              </View>
            ))}
          </View>
        )}
        <Text style={s.body}>Pick the one that feels most honest.</Text>
      </View>
      <View style={s.cardList}>
        {habits.map((habit) => {
          const active = selected === habit.id;
          const dim = Boolean(selected) && !active;
          return (
            <Pressable
              key={habit.id}
              onPress={() => onSelect(habit)}
              style={[s.habitCard, active && s.habitCardActive, dim && s.dimmed]}
            >
              <View style={[s.habitIconWrap, active && s.habitIconWrapActive]}>
                <Ionicons name={habit.icon} size={22} color={active ? C.accentText : C.iconSecondary} />
              </View>
              <View style={s.flex}>
                <Text style={[s.habitTitle, active && s.habitTitleActive]}>{habit.title}</Text>
                <Text style={s.habitSubtitle}>{habit.reason ?? habit.subtitle}</Text>
              </View>
              <Ionicons
                name={active ? "checkmark-circle" : "ellipse-outline"}
                size={22}
                color={active ? C.accentText : C.iconTertiary}
              />
            </Pressable>
          );
        })}

        <Pressable
          onPress={handleCustomPress}
          style={[s.habitCard, isCustomActive && s.habitCardActive, isCustomDim && s.dimmed]}
        >
          <View style={[s.habitIconWrap, isCustomActive && s.habitIconWrapActive]}>
            <Ionicons name="create-outline" size={22} color={isCustomActive ? C.accentText : C.iconSecondary} />
          </View>
          <View style={s.flex}>
            {customExpanded ? (
              <TextInput
                ref={customInputRef}
                value={customHabitTitle}
                onChangeText={handleCustomChange}
                placeholder="Type your habit..."
                placeholderTextColor={C.textPlaceholder}
                style={s.customHabitInput}
                selectionColor={C.accentText}
                maxLength={60}
                returnKeyType="done"
                onSubmitEditing={() => Keyboard.dismiss()}
              />
            ) : (
              <>
                <Text style={[s.habitTitle, isCustomActive && s.habitTitleActive]}>
                  {customHabitTitle.trim() || "Create my own"}
                </Text>
                <Text style={s.habitSubtitle}>Name a habit that matters to you</Text>
              </>
            )}
          </View>
          <Ionicons
            name={isCustomActive ? "checkmark-circle" : "ellipse-outline"}
            size={22}
            color={isCustomActive ? C.accentText : C.iconTertiary}
          />
        </Pressable>
      </View>
    </ScreenShell>
  );
}
