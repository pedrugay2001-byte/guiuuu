import { useEffect, useState, useCallback } from "react";
import {
  View, Text, StyleSheet, Image, TouchableOpacity, ScrollView,
  ActivityIndicator,
} from "react-native";
import { Stack, useRouter, useLocalSearchParams } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { api, CommunityMember } from "../../../src/api";
import { TIERS } from "../../../src/theme";

export default function MemberProfile() {
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();
  const [m, setM] = useState<CommunityMember | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    if (!id) return;
    try { const d = await api.communityMember(id); setM(d); }
    finally { setLoading(false); }
  }, [id]);
  useEffect(() => { load(); }, [load]);

  if (loading || !m) {
    return <View style={{ flex: 1, backgroundColor: "#1A1A1A", justifyContent: "center" }}><ActivityIndicator color="#FFF" /></View>;
  }

  const tier = TIERS[m.tier] || TIERS.black;
  const infoItems = [
    { icon: "calendar-outline", label: "Idade", value: m.age ? `${m.age} anos` : null },
    { icon: "briefcase-outline", label: "Profissão", value: m.profession },
    { icon: "barbell-outline", label: "Onde malha", value: m.gym },
    { icon: "location-outline", label: "Cidade", value: m.city },
  ].filter(x => x.value);

  return (
    <View style={{ flex: 1, backgroundColor: "#1A1A1A" }}>
      <Stack.Screen options={{
        title: "Perfil", headerStyle: { backgroundColor: "#1A1A1A" }, headerTintColor: "#FFF",
      }} />
      <ScrollView contentContainerStyle={{ padding: 20 }}>
        <View style={styles.avatarWrap}>
          <View style={[styles.avatarRing, { borderColor: tier.color }]}>
            {m.avatar_base64 ? (
              <Image source={{ uri: m.avatar_base64 }} style={styles.avatar} />
            ) : (
              <View style={[styles.avatar, { backgroundColor: "#2A2A2A", alignItems: "center", justifyContent: "center" }]}>
                <Text style={{ color: "#DDD", fontSize: 48, fontWeight: "800" }}>{m.nickname.charAt(0).toUpperCase()}</Text>
              </View>
            )}
          </View>
          <View style={[styles.onlineBadge, { backgroundColor: m.is_online ? "#4EE07F" : "#555" }]} />
        </View>

        <Text style={styles.name}>{m.nickname}</Text>
        <View style={styles.pillRow}>
          <View style={[styles.pill, { borderColor: tier.color }]}>
            <Ionicons name={tier.icon as any} size={11} color={tier.color} />
            <Text style={[styles.pillTxt, { color: tier.color }]}>{tier.label.toUpperCase()}</Text>
          </View>
          {m.member_number && (
            <View style={styles.numPill}><Text style={styles.numTxt}>#{m.member_number}</Text></View>
          )}
          <View style={[styles.pill, { borderColor: m.is_online ? "#4EE07F" : "#555" }]}>
            <Text style={[styles.pillTxt, { color: m.is_online ? "#4EE07F" : "#888" }]}>{m.is_online ? "ONLINE" : "OFFLINE"}</Text>
          </View>
        </View>

        {m.bio ? <Text style={styles.bio}>{m.bio}</Text> : null}

        {infoItems.length > 0 && (
          <View style={styles.infoBlock}>
            <Text style={styles.infoLabel}>INFORMAÇÕES</Text>
            {infoItems.map((it, i) => (
              <View key={i} style={styles.infoRow}>
                <Ionicons name={it.icon as any} size={15} color="#999" />
                <Text style={styles.infoK}>{it.label}</Text>
                <Text style={styles.infoV}>{it.value}</Text>
              </View>
            ))}
          </View>
        )}

        <TouchableOpacity
          style={styles.cta}
          onPress={() => router.push(`/community/dm/${m.member_id}`)}
          testID="profile-dm"
          activeOpacity={0.85}
        >
          <Ionicons name="chatbubble" size={16} color="#000" />
          <Text style={styles.ctaTxt}>PUXAR CONVERSA</Text>
        </TouchableOpacity>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  avatarWrap: { alignSelf: "center", position: "relative" },
  avatarRing: { width: 148, height: 148, borderRadius: 74, borderWidth: 3, padding: 4 },
  avatar: { width: 134, height: 134, borderRadius: 67 },
  onlineBadge: {
    position: "absolute", bottom: 10, right: 10,
    width: 22, height: 22, borderRadius: 11,
    borderWidth: 3, borderColor: "#1A1A1A",
  },
  name: { color: "#EFEFEF", fontSize: 24, fontWeight: "900", textAlign: "center", marginTop: 12 },
  pillRow: { flexDirection: "row", gap: 6, justifyContent: "center", marginTop: 10, flexWrap: "wrap" },
  pill: { flexDirection: "row", alignItems: "center", gap: 4, paddingHorizontal: 10, paddingVertical: 4, borderRadius: 20, borderWidth: 1 },
  pillTxt: { fontSize: 9, fontWeight: "900", letterSpacing: 1.5 },
  numPill: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 20, borderWidth: 1, borderColor: "#333", backgroundColor: "#222" },
  numTxt: { color: "#CCC", fontSize: 10, fontWeight: "800" },

  bio: {
    color: "#CCC", fontSize: 13, lineHeight: 20,
    textAlign: "center", marginTop: 16, paddingHorizontal: 8,
  },

  infoBlock: { marginTop: 22, backgroundColor: "#242424", borderRadius: 10, padding: 12 },
  infoLabel: { color: "#888", fontSize: 10, fontWeight: "900", letterSpacing: 2, marginBottom: 10 },
  infoRow: { flexDirection: "row", alignItems: "center", gap: 10, paddingVertical: 8, borderTopWidth: 1, borderTopColor: "#2E2E2E" },
  infoK: { color: "#999", fontSize: 12, width: 90 },
  infoV: { color: "#EEE", fontSize: 13, flex: 1, fontWeight: "600" },

  cta: {
    flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8,
    backgroundColor: "#D4AF37",
    padding: 15, borderRadius: 10, marginTop: 24,
  },
  ctaTxt: { color: "#000", fontSize: 12, fontWeight: "900", letterSpacing: 1.8 },
});
