import { Ionicons } from "@expo/vector-icons";
import React, { useEffect, useMemo, useRef } from "react";
import { Pressable, Text, TextInput, View } from "react-native";

import { palette } from "@/constants/theme";
import { useTheme } from "@/hooks/useTheme";
import { GOAL_COPY_BY_PAIN, getGoalSuggestions } from "./data";
import { ScreenShell } from "./shared";
import { ORANGE, makeStyles } from "./theme";

export function GoalInputScreen({
  value,
  onChange,
  onNext,
  focusAreas = [],
  painPoints = [],
}: {
  value: string;
  onChange: (value: string) => void;
  onNext: () => void;
  focusAreas?: string[];
  painPoints?: string[];
}) {
  const C = useTheme();
  const s = makeStyles(C);
  const inputRef = useRef<TextInput>(null);
  const canContinue = value.trim().length > 0;
  const suggestions = useMemo(
    () => getGoalSuggestions(focusAreas, painPoints),
    [focusAreas, painPoints],
  );
  const painPoint = painPoints[0];
  const painCopy = painPoint ? GOAL_COPY_BY_PAIN[painPoint] : undefined;
  const headline = painCopy?.headline ?? "What would make today feel meaningful?";
  const body = painCopy?.body ?? "Your answer becomes your first focus.";
  const suggestionLabel = painCopy?.suggestionLabel ?? "Suggestions";

  useEffect(() => {
    const timer = setTimeout(() => inputRef.current?.focus(), 600);
    return () => clearTimeout(timer);
  }, []);

  return (
    <View style={s.keyboard}>
      <ScreenShell onNext={onNext} disabled={!canContinue} stickyFooter dismissesKeyboard>
        <View style={s.copyBlock}>
          <Text style={s.headline}>{headline}</Text>
          <Text style={s.body}>{body}</Text>
        </View>
        <TextInput
          ref={inputRef}
          value={value}
          onChangeText={onChange}
          placeholder="Type your answer..."
          placeholderTextColor={palette.white55}
          multiline
          style={s.goalInput}
          selectionColor={ORANGE}
        />
        <View style={s.goalSuggestionList}>
          <Text style={s.goalSuggestionLabel}>{suggestionLabel}</Text>
          {suggestions.map((suggestion) => {
            const active = value.trim() === suggestion;
            return (
              <Pressable
                key={suggestion}
                onPress={() => onChange(suggestion)}
                style={[s.goalSuggestion, active && s.goalSuggestionActive]}
              >
                <Text style={[s.goalSuggestionText, active && s.goalSuggestionTextActive]}>
                  {suggestion}
                </Text>
                <Ionicons
                  name={active ? "checkmark-circle" : "ellipse-outline"}
                  size={18}
                  color={active ? ORANGE : palette.white55}
                />
              </Pressable>
            );
          })}
        </View>
      </ScreenShell>
    </View>
  );
}
