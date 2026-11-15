import { Ionicons } from "@expo/vector-icons";
import { VideoView, useVideoPlayer } from "expo-video";
import React from "react";
import { Image, Modal, Pressable, StyleSheet, View } from "react-native";

export type ViewerMedia = { kind: "photo" | "video"; uri: string } | null;

function VideoContent({ uri }: { uri: string }) {
  const player = useVideoPlayer(uri, (p) => {
    p.loop = false;
    p.play();
  });
  return <VideoView style={styles.media} player={player} nativeControls contentFit="contain" />;
}

/** Full-screen viewer for a single photo or video. */
export function MediaViewer({ media, onClose }: { media: ViewerMedia; onClose: () => void }) {
  return (
    <Modal
      visible={!!media}
      animationType="fade"
      presentationStyle="fullScreen"
      onRequestClose={onClose}
    >
      <View style={styles.container}>
        {media?.kind === "video" ? <VideoContent uri={media.uri} /> : null}
        {media?.kind === "photo" ? (
          <Image source={{ uri: media.uri }} style={styles.media} resizeMode="contain" />
        ) : null}
        <Pressable
          style={styles.closeBtn}
          onPress={onClose}
          hitSlop={10}
          accessibilityRole="button"
          accessibilityLabel="Close"
        >
          <Ionicons name="close" size={22} color="#fff" />
        </Pressable>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#000", justifyContent: "center" },
  media: { flex: 1, width: "100%" },
  closeBtn: {
    position: "absolute",
    top: 56,
    right: 20,
    width: 38,
    height: 38,
    borderRadius: 19,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(0,0,0,0.5)",
  },
});
