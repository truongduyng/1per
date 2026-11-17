import { useTheme } from '@/hooks/useTheme';
import { newLocalId, type JournalAttachment } from '@/lib/journal';
import { discardAttachments, pickJournalMedia } from '@/lib/journalActions';
import { persistJournalMedia } from '@/lib/journalPhotos';
import { Ionicons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import * as MediaLibrary from 'expo-media-library/legacy';
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Alert, FlatList, Linking, Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

interface Props {
  visible: boolean;
  remaining: number;
  onClose: () => void;
  onPick: (attachments: JournalAttachment[]) => void;
}

export function MediaSheet({ visible, remaining, onClose, onPick }: Props) {
  const C = useTheme();
  const insets = useSafeAreaInsets();
  const [assets, setAssets] = useState<MediaLibrary.Asset[]>([]);
  const [selected, setSelected] = useState<MediaLibrary.Asset[]>([]);
  const [permission, setPermission] = useState<MediaLibrary.PermissionResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [busy, setBusy] = useState(false);
  const cursor = useRef<string | undefined>(undefined);
  const hasMore = useRef(true);
  const session = useRef({ cancelled: false, fetching: false });

  const load = useCallback(async (reset: boolean, token: { cancelled: boolean; fetching: boolean }) => {
    if (token.fetching || token.cancelled || (!reset && !hasMore.current)) return;
    token.fetching = true;
    setLoading(true);
    setError(false);
    try {
      const page = await MediaLibrary.getAssetsAsync({
        first: 60, after: reset ? undefined : cursor.current,
        mediaType: [MediaLibrary.MediaType.photo, MediaLibrary.MediaType.video],
        sortBy: [[MediaLibrary.SortBy.creationTime, false]],
      });
      if (token.cancelled) return;
      cursor.current = page.endCursor;
      hasMore.current = page.hasNextPage;
      setAssets((previous) => reset ? page.assets : [...previous,
        ...page.assets.filter((asset) => !previous.some((old) => old.id === asset.id)),
      ]);
    } catch {
      if (!token.cancelled) setError(true);
    } finally {
      token.fetching = false;
      if (!token.cancelled) setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!visible) return;
    const token = { cancelled: false, fetching: false };
    session.current = token;
    void (async () => {
      try {
        const response = await MediaLibrary.requestPermissionsAsync(false, ['photo', 'video']);
        if (token.cancelled) return;
        setPermission(response);
        if (response.granted) await load(true, token);
      } catch {
        if (!token.cancelled) setError(true);
      } finally {
        if (!token.cancelled) setLoading(false);
      }
    })();
    return () => { token.cancelled = true; };
  }, [visible, load]);

  const choose = (asset: MediaLibrary.Asset) => {
    setSelected((previous) => {
      if (previous.some((item) => item.id === asset.id)) return previous.filter((item) => item.id !== asset.id);
      if (previous.length >= remaining) return previous;
      return [...previous, asset];
    });
  };

  const finish = async (extra: JournalAttachment[] = []) => {
    setBusy(true);
    const copied = [...extra];
    try {
      for (const asset of selected) {
        const info = await MediaLibrary.getAssetInfoAsync(asset, { shouldDownloadFromNetwork: true });
        if (!info.localUri && info.uri.startsWith('ph://')) throw new Error('Media is not available locally.');
        const id = newLocalId();
        copied.push({
          id, kind: asset.mediaType === MediaLibrary.MediaType.video ? 'video' : 'photo',
          uri: persistJournalMedia(info.localUri ?? info.uri, id, asset.filename),
          name: asset.filename, width: asset.width, height: asset.height, mimeType: null, size: null,
        });
      }
      onPick(copied);
    } catch {
      discardAttachments(copied);
      Alert.alert("Couldn't attach", 'Please check your connection and try again.');
    } finally {
      setBusy(false);
    }
  };

  const pickNative = async (source: 'camera' | 'library') => {
    if (busy) return;
    setBusy(true);
    try {
      const picked = await pickJournalMedia(source, remaining - selected.length);
      if (picked.length) await finish(picked);
    } catch {
      Alert.alert("Couldn't attach", 'Please try again.');
    } finally {
      setBusy(false);
    }
  };

  const label = { color: C.textPrimary, fontSize: 15, fontWeight: '600' as const };
  const tile = [styles.tile, { backgroundColor: C.inputBg }];
  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet"
      onRequestClose={() => { if (!busy) onClose(); }} allowSwipeDismissal={!busy}>
      <View style={[styles.sheet, { backgroundColor: C.sheetBg }]}>
        <View style={[styles.handle, { backgroundColor: C.inputBorder }]} />
        <View style={styles.header}>
          <Text style={[label, { fontSize: 21 }]}>Photos & videos</Text>
          <Pressable onPress={onClose} disabled={busy} accessibilityLabel="Close media picker"
            accessibilityRole="button" style={[styles.close, { backgroundColor: C.inputBg }]}>
            <Ionicons name="close" size={21} color={C.textSecondary} />
          </Pressable>
        </View>
        <View style={styles.toolbar}>
          <Text style={{ color: C.textSecondary, flex: 1 }}>Recent</Text>
          <Pressable onPress={() => void pickNative('library')} disabled={busy || selected.length >= remaining}
            accessibilityRole="button" style={styles.libraryButton}>
            <Text style={[label, { color: C.accentText }]}>All photos</Text>
            <Ionicons name="chevron-forward" size={16} color={C.accentText} />
          </Pressable>
        </View>
        <FlatList
          data={[null, ...assets]} numColumns={3} keyExtractor={(item) => item?.id ?? 'camera'}
          contentContainerStyle={styles.grid} columnWrapperStyle={styles.row}
          onEndReached={() => { if (permission?.granted) void load(false, session.current); }}
          onEndReachedThreshold={0.5}
          renderItem={({ item }) => {
            if (!item) return (
              <Pressable style={tile} onPress={() => void pickNative('camera')}
                disabled={busy || selected.length >= remaining} accessibilityRole="button" accessibilityLabel="Open camera">
                <Ionicons name="camera-outline" size={34} color={C.accentText} />
                <Text style={[label, { color: C.accentText }]}>Camera</Text>
              </Pressable>
            );
            const index = selected.findIndex((asset) => asset.id === item.id);
            const disabled = busy || (index < 0 && selected.length >= remaining);
            return (
              <Pressable style={[tile, { opacity: disabled && !busy ? 0.45 : 1 }]}
                onPress={() => choose(item)} disabled={disabled} accessibilityRole="checkbox"
                accessibilityState={{ checked: index >= 0, disabled }}
                accessibilityLabel={`${item.mediaType === 'video' ? 'Video' : 'Photo'} ${item.filename}`}>
                <Image source={{ uri: item.uri }} style={StyleSheet.absoluteFill} contentFit="cover" recyclingKey={item.id} />
                {item.mediaType === 'video' ? (
                  <View style={styles.duration}>
                    <Ionicons name="videocam" size={13} color="white" />
                    <Text style={styles.durationText}>{Math.floor(item.duration / 60)}:{String(Math.floor(item.duration % 60)).padStart(2, '0')}</Text>
                  </View>
                ) : null}
                <View style={[styles.selection, { backgroundColor: index >= 0 ? C.accent : 'rgba(0,0,0,0.35)', borderColor: index >= 0 ? C.accent : 'white' }]}>
                  {index >= 0 ? <Text style={{ color: C.accentForeground, fontWeight: '700', fontSize: 12 }}>{index + 1}</Text> : null}
                </View>
              </Pressable>
            );
          }}
          ListFooterComponent={
            <View style={styles.status}>
              {loading ? <ActivityIndicator color={C.accent} /> : error ? (
                <Pressable onPress={() => void load(assets.length === 0, session.current)}>
                  <Text style={[label, { color: C.accentText }]}>Unable to load photos. Tap to retry.</Text>
                </Pressable>
              ) : permission && !permission.granted ? (
                <>
                  <Text style={{ color: C.textSecondary, textAlign: 'center' }}>Allow photo access to see your library here, or choose from All photos.</Text>
                  <Pressable onPress={() => void Linking.openSettings()} style={styles.libraryButton}>
                    <Text style={[label, { color: C.accentText }]}>Open Settings</Text>
                  </Pressable>
                </>
              ) : !assets.length ? <Text style={{ color: C.textSecondary }}>No photos or videos yet.</Text> : null}
              {permission?.accessPrivileges === 'limited' ? (
                <Pressable onPress={() => void pickNative('library')} disabled={busy || selected.length >= remaining} style={styles.libraryButton}>
                  <Text style={[label, { color: C.accentText }]}>Choose more photos</Text>
                </Pressable>
              ) : null}
            </View>
          }
        />
        <View style={[styles.footer, { paddingBottom: Math.max(insets.bottom, 16), borderTopColor: C.divider }]}>
          <Text style={{ color: C.textSecondary }}>{selected.length} / {remaining} selected</Text>
          <Pressable onPress={() => void finish()} disabled={busy || !selected.length}
            accessibilityRole="button" accessibilityLabel={`Add ${selected.length} attachments`}
            style={[styles.add, { backgroundColor: C.accent, opacity: !selected.length && !busy ? 0.45 : 1 }]}>
            {busy ? <ActivityIndicator color={C.accentForeground} /> : <Text style={[label, { color: C.accentForeground }]}>Add{selected.length ? ` (${selected.length})` : ''}</Text>}
          </Pressable>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  sheet: { flex: 1 },
  handle: { width: 36, height: 5, borderRadius: 3, alignSelf: 'center', marginTop: 10 },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 20, paddingVertical: 14 },
  close: { width: 34, height: 34, borderRadius: 17, alignItems: 'center', justifyContent: 'center' },
  toolbar: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 20, paddingBottom: 8 },
  libraryButton: { minHeight: 44, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 4 },
  grid: { paddingHorizontal: 4, gap: 4 },
  row: { gap: 4 },
  tile: { width: '32.6%', aspectRatio: 1, borderRadius: 8, overflow: 'hidden', alignItems: 'center', justifyContent: 'center', gap: 8 },
  selection: { position: 'absolute', top: 8, right: 8, width: 25, height: 25, borderRadius: 13, borderWidth: 2, alignItems: 'center', justifyContent: 'center' },
  duration: { position: 'absolute', right: 6, bottom: 6, flexDirection: 'row', gap: 4, alignItems: 'center', backgroundColor: 'rgba(0,0,0,0.55)', borderRadius: 5, padding: 4 },
  durationText: { color: 'white', fontSize: 11, fontVariant: ['tabular-nums'] },
  status: { alignItems: 'center', padding: 24, gap: 12 },
  footer: { borderTopWidth: StyleSheet.hairlineWidth, paddingHorizontal: 20, paddingTop: 12, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  add: { minHeight: 46, minWidth: 112, paddingHorizontal: 22, borderRadius: 23, alignItems: 'center', justifyContent: 'center' },
});
