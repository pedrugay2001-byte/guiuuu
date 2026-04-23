import { useEffect, useRef, useState, useCallback } from "react";
import {
  View, Text, StyleSheet, Image, TouchableOpacity, Animated, Dimensions,
  ActivityIndicator, StatusBar, Pressable, PanResponder, Platform,
} from "react-native";
import { Stack, useLocalSearchParams, useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { api, Story, StoryGroup } from "../../../src/api";
import { TIERS } from "../../../src/theme";
import { useGate } from "../../../src/gate";
import { Alert } from "react-native";

const { width, height } = Dimensions.get("window");
const STORY_DURATION = 5000;

/**
 * Premium Stories Viewer — Instagram-style.
 *
 * Features:
 * - Auto-advance every 5s with a smooth progress bar
 * - Tap LEFT third → previous story
 * - Tap RIGHT 2/3 → next story
 * - Long-press anywhere → pauses (like IG)
 * - Swipe down → closes viewer
 * - Navigates across multiple members in sequence
 * - Never crashes on missing/invalid data
 * - Premium header: avatar ring w/ tier, name, timestamp, close
 */
export default function StoryViewer() {
  const router = useRouter();
  const { memberId } = useLocalSearchParams<{ memberId: string }>();
  const { member: currentMember } = useGate();

  // All groups (all members who have stories) — needed to advance across authors
  const [groups, setGroups] = useState<StoryGroup[]>([]);
  const [loading, setLoading] = useState(true);
  const [groupIdx, setGroupIdx] = useState(0);
  const [storyIdx, setStoryIdx] = useState(0);
  const [paused, setPaused] = useState(false);
  const [imgLoaded, setImgLoaded] = useState(false);

  const progress = useRef(new Animated.Value(0)).current;
  const animRef = useRef<Animated.CompositeAnimation | null>(null);

  // Load stories once
  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const gs = await api.listStories();
        if (!alive) return;
        // Filter out empty groups defensively
        const clean = (gs || []).filter(g => g?.stories?.length > 0);
        setGroups(clean);
        const start = Math.max(0, clean.findIndex(g => g.member_id === memberId));
        setGroupIdx(start === -1 ? 0 : start);
      } catch (e) {
        // If API fails, close gracefully
        // eslint-disable-next-line no-console
        console.log("[StoryViewer] load error", (e as any)?.message);
        router.back();
      } finally {
        if (alive) setLoading(false);
      }
    })();
    return () => { alive = false; };
  }, [memberId, router]);

  const group = groups[groupIdx];
  const story: Story | undefined = group?.stories?.[storyIdx];

  // Safely advance
  const next = useCallback(() => {
    setImgLoaded(false);
    setGroups((gs) => {
      setGroupIdx((gi) => {
        setStoryIdx((si) => {
          const g = gs[gi];
          if (g && si < g.stories.length - 1) return si + 1;
          // Move to next group
          if (gi < gs.length - 1) {
            return 0;
          }
          // End of all stories — close
          setTimeout(() => { try { router.back(); } catch {} }, 0);
          return si;
        });
        const g = gs[gi];
        if (g && storyIdx < g.stories.length - 1) return gi;
        return Math.min(gi + 1, gs.length - 1);
      });
      return gs;
    });
  }, [router, storyIdx]);

  const prev = useCallback(() => {
    setImgLoaded(false);
    setStoryIdx((si) => {
      if (si > 0) return si - 1;
      setGroupIdx((gi) => {
        if (gi > 0) {
          const g = groups[gi - 1];
          if (g) setStoryIdx(Math.max(0, (g.stories.length || 1) - 1));
          return gi - 1;
        }
        return gi;
      });
      return si;
    });
  }, [groups]);

  // Progress animation — restart on story change
  useEffect(() => {
    if (!group || !story) return;
    progress.setValue(0);
    animRef.current?.stop();
    if (paused) return;
    const anim = Animated.timing(progress, {
      toValue: 1, duration: STORY_DURATION, useNativeDriver: false,
    });
    animRef.current = anim;
    anim.start(({ finished }) => { if (finished) next(); });
    return () => { animRef.current?.stop(); };
  }, [groupIdx, storyIdx, group, story, paused, progress, next]);

  // Pan responder for swipe-down to close
  const pan = useRef(
    PanResponder.create({
      onMoveShouldSetPanResponder: (_, g) => Math.abs(g.dy) > 30 && Math.abs(g.dy) > Math.abs(g.dx),
      onPanResponderRelease: (_, g) => {
        if (g.dy > 80) { try { router.back(); } catch {} }
      },
    })
  ).current;

  if (loading) {
    return (
      <View style={st.loadingWrap}>
        <Stack.Screen options={{ headerShown: false }} />
        <StatusBar barStyle="light-content" />
        <ActivityIndicator color="#D4AF37" size="large" />
      </View>
    );
  }

  if (!group || !story) {
    return (
      <View style={st.emptyWrap}>
        <Stack.Screen options={{ headerShown: false }} />
        <Ionicons name="images-outline" size={44} color="#555" />
        <Text style={st.emptyTxt}>Nenhum story disponível</Text>
        <TouchableOpacity style={st.emptyBtn} onPress={() => router.back()}>
          <Text style={st.emptyBtnTxt}>VOLTAR</Text>
        </TouchableOpacity>
      </View>
    );
  }

  const tier = TIERS[group.tier] || TIERS.silver;
  const timeAgo = formatTimeAgo(story.created_at);

  return (
    <View style={{ flex: 1, backgroundColor: "#000" }} {...pan.panHandlers}>
      <Stack.Screen options={{ headerShown: false }} />
      <StatusBar barStyle="light-content" />

      {/* Media */}
      {story.image_base64 ? (
        <>
          <Image
            source={{ uri: story.image_base64 }}
            style={st.media}
            resizeMode="cover"
            onLoad={() => setImgLoaded(true)}
            onError={() => { setImgLoaded(true); }}
          />
          {!imgLoaded && (
            <View style={st.mediaLoader}>
              <ActivityIndicator color="#D4AF37" />
            </View>
          )}
        </>
      ) : (
        <View style={st.textOnly}>
          <Text style={st.textOnlyTxt}>{story.text || " "}</Text>
        </View>
      )}

      {/* Top gradient for readability */}
      <View style={[st.fade, { top: 0, height: 180 }]} />
      {/* Bottom gradient when caption */}
      {story.image_base64 && story.text ? <View style={[st.fade, { bottom: 0, height: 160 }]} /> : null}

      {/* Progress bars */}
      <View style={st.progressRow}>
        {group.stories.map((_, i) => (
          <View key={i} style={st.progressBg}>
            <Animated.View
              style={[
                st.progressFill,
                i < storyIdx && { width: "100%" },
                i === storyIdx && {
                  width: progress.interpolate({ inputRange: [0, 1], outputRange: ["0%", "100%"] }),
                },
                i > storyIdx && { width: "0%" },
              ]}
            />
          </View>
        ))}
      </View>

      {/* Header */}
      <View style={st.header}>
        <View style={[st.avRing, { borderColor: tier.color }]}>
          {group.avatar_base64 ? (
            <Image source={{ uri: group.avatar_base64 }} style={st.av} />
          ) : (
            <View style={[st.av, st.avFallback]}>
              <Text style={st.avLetter}>{(group.nickname || "?").charAt(0).toUpperCase()}</Text>
            </View>
          )}
        </View>
        <View style={{ marginLeft: 10, flex: 1 }}>
          <Text style={st.name} numberOfLines={1}>{group.nickname || "Membro"}</Text>
          <Text style={st.time}>{timeAgo}</Text>
        </View>
        {currentMember?.member_id === group.member_id ? (
          <TouchableOpacity
            onPress={() => {
              setPaused(true);
              Alert.alert("Excluir story?", "Esta ação não pode ser desfeita.", [
                { text: "Cancelar", onPress: () => setPaused(false) },
                { text: "Excluir", style: "destructive", onPress: async () => {
                  try {
                    await api.storyDelete(story.story_id, currentMember.member_id);
                    router.back();
                  } catch { setPaused(false); }
                } },
              ]);
            }}
            style={st.close}
            hitSlop={{ top: 12, right: 12, bottom: 12, left: 12 }}
          >
            <Ionicons name="trash-outline" size={22} color="#FF6B6B" />
          </TouchableOpacity>
        ) : null}
        <TouchableOpacity onPress={() => router.back()} style={st.close} testID="story-close" hitSlop={{ top: 12, right: 12, bottom: 12, left: 12 }}>
          <Ionicons name="close" size={28} color="#FFF" />
        </TouchableOpacity>
      </View>

      {/* Caption (text overlay on image) */}
      {story.image_base64 && story.text ? (
        <View style={st.captionBox}>
          <Text style={st.caption}>{story.text}</Text>
        </View>
      ) : null}

      {/* Tap zones + long-press pause. Use Pressable to capture both. */}
      <Pressable
        style={[st.zone, { left: 0, width: width / 3 }]}
        onPress={prev}
        onLongPress={() => setPaused(true)}
        onPressOut={() => setPaused(false)}
      />
      <Pressable
        style={[st.zone, { left: width / 3, width: (width * 2) / 3 }]}
        onPress={next}
        onLongPress={() => setPaused(true)}
        onPressOut={() => setPaused(false)}
      />
    </View>
  );
}

function formatTimeAgo(iso?: string): string {
  try {
    if (!iso) return "";
    const then = new Date(iso).getTime();
    const diff = (Date.now() - then) / 1000;
    if (diff < 60) return "agora";
    if (diff < 3600) return `${Math.floor(diff / 60)}min`;
    if (diff < 86400) return `${Math.floor(diff / 3600)}h`;
    return `${Math.floor(diff / 86400)}d`;
  } catch { return ""; }
}

const st = StyleSheet.create({
  loadingWrap: { flex: 1, backgroundColor: "#000", alignItems: "center", justifyContent: "center" },
  emptyWrap: { flex: 1, backgroundColor: "#000", alignItems: "center", justifyContent: "center", gap: 14, padding: 28 },
  emptyTxt: { color: "#888", fontSize: 14, fontWeight: "700" },
  emptyBtn: { marginTop: 8, paddingHorizontal: 24, paddingVertical: 12, borderRadius: 24, backgroundColor: "#D4AF37" },
  emptyBtnTxt: { color: "#000", fontWeight: "900", letterSpacing: 2, fontSize: 12 },

  media: { width, height },
  mediaLoader: { position: "absolute", top: 0, left: 0, right: 0, bottom: 0, alignItems: "center", justifyContent: "center" },
  textOnly: { flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: "#0A0A0A", padding: 40 },
  textOnlyTxt: { color: "#FFF", fontSize: 28, fontWeight: "900", textAlign: "center", lineHeight: 36 },

  fade: { position: "absolute", left: 0, right: 0, backgroundColor: "rgba(0,0,0,0.45)" },

  progressRow: {
    position: "absolute",
    top: Platform.OS === "ios" ? 50 : 16,
    left: 10, right: 10, flexDirection: "row", gap: 4, zIndex: 10,
  },
  progressBg: { flex: 1, height: 3, borderRadius: 2, backgroundColor: "rgba(255,255,255,0.3)", overflow: "hidden" },
  progressFill: { height: "100%", backgroundColor: "#FFF" },

  header: {
    position: "absolute",
    top: Platform.OS === "ios" ? 70 : 30,
    left: 0, right: 0,
    flexDirection: "row", alignItems: "center",
    paddingHorizontal: 14,
    zIndex: 10,
  },
  avRing: { width: 40, height: 40, borderRadius: 20, borderWidth: 2, padding: 1.5 },
  av: { width: 33, height: 33, borderRadius: 16.5 },
  avFallback: { backgroundColor: "#2A2A2A", alignItems: "center", justifyContent: "center" },
  avLetter: { color: "#FFF", fontWeight: "800", fontSize: 14 },
  name: { color: "#FFF", fontSize: 14, fontWeight: "800" },
  time: { color: "rgba(255,255,255,0.7)", fontSize: 11, marginTop: 1, fontWeight: "600" },
  close: { padding: 6, marginLeft: 6 },

  captionBox: { position: "absolute", bottom: 60, left: 22, right: 22, zIndex: 5 },
  caption: {
    color: "#FFF", fontSize: 17, fontWeight: "700", lineHeight: 23,
    textShadowColor: "rgba(0,0,0,0.9)", textShadowOffset: { width: 0, height: 1 }, textShadowRadius: 8,
  },

  zone: { position: "absolute", top: 110, bottom: 40 },
});
