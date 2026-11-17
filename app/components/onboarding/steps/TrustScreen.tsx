import { Ionicons } from "@expo/vector-icons";
import React from "react";
import { Image, Text, View } from "react-native";

import { useTheme } from "@/hooks/useTheme";
import { TRUST_AVATARS, TRUST_REVIEWS } from "./data";
import { ScreenShell } from "./shared";
import { makeStyles } from "./theme";

export function TrustScreen({ onNext }: { onNext: () => void }) {
  const C = useTheme();
  const s = makeStyles(C);
  return (
    <ScreenShell onNext={onNext} scroll>
      <View style={s.ratingRow}>
        <View style={s.avatarStack}>
          {TRUST_AVATARS.map((avatar, index) => (
            <Image
              key={avatar}
              source={{ uri: avatar }}
              style={[s.avatarImage, { marginLeft: index === 0 ? 0 : -8 }]}
            />
          ))}
        </View>
        <View style={s.starRow}>
          {[0, 1, 2, 3, 4].map((index) => (
            <Ionicons key={index} name="star" size={14} color={C.accentText} />
          ))}
        </View>
        <Text style={s.ratingText}>4.9/5</Text>
      </View>
      <View style={s.copyBlock}>
        <Text style={s.headline}>Most users feel calmer within the first week.</Text>
      </View>
      <View style={s.statsRow}>
        {[
          ["87%", "More focused daily"],
          ["91%", "Stay consistent longer"],
          ["89%", "Feel less overwhelmed"],
        ].map(([value, label]) => (
          <View key={value} style={s.statCard}>
            <Text style={s.statValue}>{value}</Text>
            <Text style={s.statLabel}>{label}</Text>
          </View>
        ))}
      </View>
      <View style={s.reviewList}>
        {TRUST_REVIEWS.map((review) => (
          <View key={review.name} style={s.reviewCard}>
            <View style={s.reviewHeader}>
              <Image source={{ uri: review.avatar }} style={s.reviewAvatar} />
              <View style={s.flex}>
                <Text style={s.reviewName}>{review.name}</Text>
                <Text style={s.reviewRole}>{review.role}</Text>
              </View>
              <View style={s.reviewStars}>
                {[0, 1, 2, 3, 4].map((index) => (
                  <Ionicons key={index} name="star" size={11} color={C.accentText} />
                ))}
              </View>
            </View>
            <Text style={s.reviewText}>{review.text}</Text>
          </View>
        ))}
      </View>
    </ScreenShell>
  );
}
