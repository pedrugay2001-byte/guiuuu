import { useEffect, useRef, useState } from "react";
import {
  View, Text, StyleSheet, Image, TouchableOpacity, Animated, Dimensions,
  ActivityIndicator, StatusBar,
} from "react-native";
import { Stack, useLocalSearchParams, useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { api, Story, StoryGroup } from "../../../src/api";
import { TIERS } from "../../../src/theme";

const { width, height } = Dimensions.get("window");
const STORY_DURATION = 5000;

export default function StoryViewer() {
  const router = useRouter();
  const { memberId } = useLocalSearchParams<{ memberId: string }>();
  const [group, setGroup] = useState<StoryGroup | null>(null);
  const [idx, setIdx] = useState(0);
  const progress = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    (async () => {
      const gs = await api.listStories();
      const g = gs.find(x => x.member_id === memberId);
      setGroup(g || null);
    })();
  }, [memberId]);

  useEffect(() => {
    if (!group) return;
    progress.setValue(0);
    Animated.timing(progress, { toValue: 1, duration: STORY_DURATION, useNativeDriver: false }).start(({ finished }) => {
      if (finished) next();
    });
  }, [idx, group]);

  const next = () => {
    if (!group) return;
    if (idx < group.stories.length - 1) setIdx(idx + 1);
    else router.back();
  };
  const prev = () => { if (idx > 0) setIdx(idx - 1); };

  if (!group) return <View style={{ flex: 1, backgroundColor: "#000", justifyContent: "center" }}><ActivityIndicator color="#FFF" /></View>;

  const story: Story = group.stories[idx];
  const tier = TIERS[group.tier] || TIERS.silver;

  return (
    <View style={{ flex: 1, backgroundColor: "#000" }}>
      <Stack.Screen options={{ headerShown: false }} />
      <StatusBar barStyle="light-content" />

      {/* Media */}
      {story.image_base64 ? (
        <Image source={{ uri: story.image_base64 }} style={{ width, height, resizeMode: "cover" }} />
      ) : (
        <View style={{ flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: "#1A1A1A" }}>
          <Text style={{ color: "#FFF", fontSize: 28, fontWeight: "900", textAlign: "center", paddingHorizontal: 40 }}>{story.text}</Text>
        </View>
      )}

      {/* Dark overlays */}
      <View style={[styles.fade, { top: 0, height: 160 }]} />

      {/* Progress bars */}
      <View style={styles.progressRow}>
        {group.stories.map((_, i) => (
          <View key={i} style={styles.progressBg}>
            <Animated.View
              style={[
                styles.progressFill,
                i < idx && { width: "100%" },
                i === idx && { width: progress.interpolate({ inputRange: [0, 1], outputRange: ["0%", "100%"] }) },
                i > idx && { width: "0%" },
              ]}
            />
          </View>
        ))}
      </View>

      {/* Header */}
      <View style={styles.header}>
        <View style={[styles.avRing, { borderColor: tier.color }]}>
          {group.avatar_base64 ? <Image source={{ uri: group.avatar_base64 }} style={styles.av} /> : (
            <View style={[styles.av, { backgroundColor: "#2A2A2A", alignItems: "center", justifyContent: "center" }]}>
              <Text style={{ color: "#FFF", fontWeight: "800" }}>{group.nickname.charAt(0).toUpperCase()}</Text>
            </View>
          )}
        </View>
        <Text style={styles.name}>{group.nickname}</Text>
        <View style={{ flex: 1 }} />
        <TouchableOpacity onPress={() => router.back()} style={styles.close}>
          <Ionicons name="close" size={26} color="#FFF" />
        </TouchableOpacity>
      </View>

      {/* Text overlay if image + text */}
      {story.image_base64 && story.text ? (
        <View style={styles.captionBox}>
          <Text style={styles.caption}>{story.text}</Text>
        </View>
      ) : null}

      {/* Tap zones */}
      <TouchableOpacity style={[styles.zone, { left: 0, width: width / 3 }]} activeOpacity={1} onPress={prev} />
      <TouchableOpacity style={[styles.zone, { right: 0, width: (width * 2) / 3 }]} activeOpacity={1} onPress={next} />
    </View>
  );
}

const styles = StyleSheet.create({
  fade: { position: "absolute", left: 0, right: 0, backgroundColor: "rgba(0,0,0,0.5)" },
  progressRow: { position: "absolute", top: 50, left: 10, right: 10, flexDirection: "row", gap: 4 },
  progressBg: { flex: 1, height: 3, borderRadius: 2, backgroundColor: "rgba(255,255,255,0.3)", overflow: "hidden" },
  progressFill: { height: "100%", backgroundColor: "#FFF" },
  header: { position: "absolute", top: 68, left: 0, right: 0, flexDirection: "row", alignItems: "center", gap: 10, paddingHorizontal: 16 },
  avRing: { width: 40, height: 40, borderRadius: 20, borderWidth: 2, padding: 1 },
  av: { width: 34, height: 34, borderRadius: 17 },
  name: { color: "#FFF", fontSize: 14, fontWeight: "800" },
  close: { padding: 6 },
  captionBox: { position: "absolute", bottom: 100, left: 24, right: 24 },
  caption: { color: "#FFF", fontSize: 18, fontWeight: "800", textShadowColor: "rgba(0,0,0,0.85)", textShadowOffset: { width: 0, height: 1 }, textShadowRadius: 8 },
  zone: { position: "absolute", top: 100, bottom: 0 },
});
