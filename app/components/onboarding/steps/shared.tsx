import React from "react";
import {
  Keyboard,
  Pressable,
  ScrollView,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { KeyboardStickyView } from "react-native-keyboard-controller";
import Svg, { Circle, Defs, Line, LinearGradient, Path, Stop } from "react-native-svg";

import { useTheme } from "@/hooks/useTheme";
import { makeStyles } from "./theme";

export function ScreenShell({
  children,
  cta = "Continue",
  disabled = false,
  onNext,
  scroll = false,
  stickyFooter = false,
  dismissesKeyboard = false,
}: {
  children: React.ReactNode;
  cta?: string;
  disabled?: boolean;
  onNext: () => void;
  scroll?: boolean;
  stickyFooter?: boolean;
  dismissesKeyboard?: boolean;
}) {
  const C = useTheme();
  const s = makeStyles(C);
  const content = (
    <Pressable style={s.screenContent} onPress={dismissesKeyboard ? Keyboard.dismiss : undefined}>
      {children}
    </Pressable>
  );
  const footer = (
    <TouchableOpacity
      style={[s.primaryButton, disabled && s.primaryButtonDisabled]}
      onPress={disabled ? undefined : onNext}
      disabled={disabled}
      activeOpacity={0.86}
    >
      <Text style={[s.primaryButtonText, disabled && s.primaryButtonTextDisabled]}>
        {cta}
      </Text>
    </TouchableOpacity>
  );

  return (
    <View style={[s.screen, stickyFooter && s.screenSticky]}>
      {scroll ? (
        <ScrollView
          contentContainerStyle={s.scrollContent}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
          style={s.flex}
        >
          {children}
        </ScrollView>
      ) : (
        content
      )}
      {stickyFooter ? (
        <KeyboardStickyView offset={{ closed: 0, opened: 46 }}>
          {footer}
        </KeyboardStickyView>
      ) : (
        footer
      )}
    </View>
  );
}

export function ChartCard() {
  const C = useTheme();
  const s = makeStyles(C);
  const points = [
    { x: 30, y: 144 },
    { x: 62, y: 132 },
    { x: 94, y: 121 },
    { x: 126, y: 105 },
    { x: 158, y: 84 },
    { x: 194, y: 69 },
    { x: 232, y: 50 },
    { x: 270, y: 22 },
  ];
  const curvePath =
    "M30 144 C44 139 49 135 62 132 C76 128 82 125 94 121 C108 116 114 111 126 105 C140 96 146 90 158 84 C174 76 181 73 194 69 C211 62 219 55 232 50 C249 42 259 32 270 22";
  const areaPath = `${curvePath} L270 160 L30 160 Z`;

  return (
    <View style={s.chartCard}>
      <Text style={s.chartTitle}>Your momentum grows</Text>
      <Svg width="100%" height={190} viewBox="0 0 300 190">
        <Defs>
          <LinearGradient id="momentumFill" x1="0" y1="0" x2="0" y2="1">
            <Stop offset="0" stopColor={C.accentText} stopOpacity="0.26" />
            <Stop offset="1" stopColor={C.accentText} stopOpacity="0.02" />
          </LinearGradient>
        </Defs>
        {[54, 88, 122, 156].map((y) => (
          <Line
            key={`h-${y}`}
            x1="28"
            x2="276"
            y1={y}
            y2={y}
            stroke={C.divider}
          />
        ))}
        {[0, 1, 2, 3, 4, 5, 6, 7].map((i) => (
          <Line
            key={`v-${i}`}
            x1={30 + i * 35}
            x2={30 + i * 35}
            y1="24"
            y2="160"
            stroke={C.divider}
          />
        ))}
        {points.map((point) => (
          <Line
            key={`stem-${point.x}`}
            x1={point.x}
            x2={point.x}
            y1={point.y + 7}
            y2="160"
            stroke="rgba(255,122,26,0.22)"
            strokeWidth="1"
          />
        ))}
        <Path d={areaPath} fill="url(#momentumFill)" />
        <Path
          d={curvePath}
          fill="none"
          stroke={C.accentText}
          strokeWidth="3.5"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        {points.map((point, index) => (
          <Circle
            key={`dot-${point.x}`}
            cx={point.x}
            cy={point.y}
            r={index === points.length - 1 ? 6 : 4.3}
            fill={index === points.length - 1 ? C.accentText : C.accentText}
            stroke={C.cardBg}
            strokeWidth={index === points.length - 1 ? 1.4 : 0.8}
          />
        ))}
      </Svg>
      <View style={s.chartAxis}>
        <Text style={s.axisLabel}>Day 1</Text>
        <Text style={s.axisLabel}>Day 15</Text>
        <Text style={s.axisLabel}>Day 30</Text>
      </View>
    </View>
  );
}
