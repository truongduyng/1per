import React, { useEffect, useMemo } from "react";
import { Animated, StyleSheet, useAnimatedValue, View } from "react-native";

type Props = {
  size?: number;
  color?: string;
  gap?: number;
};

export default function ThreeDotsLoader({
  size = 7,
  color = "rgba(255, 255, 255, 0.6)",
  gap = 5,
}: Props) {
  const dot0 = useAnimatedValue(0);
  const dot1 = useAnimatedValue(0);
  const dot2 = useAnimatedValue(0);
  const dots = useMemo(() => [dot0, dot1, dot2], [dot0, dot1, dot2]);

  useEffect(() => {
    const animations = dots.map((dot) =>
      Animated.loop(
        Animated.sequence([
          Animated.timing(dot, { toValue: 1, duration: 300, useNativeDriver: true }),
          Animated.timing(dot, { toValue: 0, duration: 300, useNativeDriver: true }),
          Animated.delay(600),
        ])
      )
    );

    const stagger = Animated.stagger(200, animations);
    stagger.start();

    return () => {
      stagger.stop();
      animations.forEach((a) => a.stop());
    };
  }, [dots]);

  const dotStyles = useMemo(
    () =>
      dots.map((dot) => ({
        opacity: dot.interpolate({ inputRange: [0, 1], outputRange: [0.3, 1] }),
        transform: [{ translateY: dot.interpolate({ inputRange: [0, 1], outputRange: [0, -4] }) }],
        width: size,
        height: size,
        borderRadius: size / 2,
        backgroundColor: color,
      })),
    [color, dots, size],
  );

  return (
    <View style={[styles.container, { gap }]}>
      {dotStyles.map((style, i) => (
        <Animated.View key={i} style={style} />
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: "row",
    alignItems: "center",
  },
});
