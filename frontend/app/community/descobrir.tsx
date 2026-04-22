import { useEffect, useState } from "react";
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity, Image,
  FlatList, ActivityIndicator, TextInput,
} from "react-native";
import { Stack, useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { api, CommunityMember, Group, CommunityEvent } from "../../src/api";
import { useGate } from "../../src/gate";
import { TIERS } from "../../src/theme";

type Filter = "all" | "online" | "near";

export default function Discover() {
  const router = useRouter();
  const { member } = useGate();
  const [members, setMembers] = useState<CommunityMember[]>([]);
  const [groups, setGroups] = useState<Group[]>([]);
  const [events, setEvents] = useState<CommunityEvent[]>([]);
  const [q, setQ] = useState("");
  const [filter, setFilter] = useState<Filter>("all");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!member) return;
    Promise.all([api.communityMembers(member.member_id), api.groupsList(), api.eventsList()])
      .then(([m, g, e]) => { setMembers(m); setGroups(g); setEvents(e); })
      .finally(() => setLoading(false));
  }, [member]);

  let filtered = members;
  if (q) filtered = filtered.filter(m => m.nickname?.toLowerCase().includes(q.toLowerCase()) || (m.city || "").toLowerCase().includes(q.toLowerCase()));
  if (filter === "online") filtered = filtered.filter(m => m.is_online);
  if (filter === "near" && member?.city) filtered = filtered.filter(m => (m.city || "").toLowerCase() === member.city?.toLowerCase());

  if (loading) return <View style={{ flex: 1, backgroundColor: "#050505", justifyContent: "center" }}><ActivityIndicator color="#FFF" /></View>;

  return (
    <View style={{ flex: 1, backgroundColor: "#050505" }}>
      <Stack.Screen options={{ title: "Descobrir", headerStyle: { backgroundColor: "#050505" }, headerTintColor: "#FFF" }} />
      <ScrollView contentContainerStyle={{ paddingBottom: 40 }}>
        <View style={styles.searchRow}>
          <Ionicons name="search" size={16} color="#888" />
          <TextInput value={q} onChangeText={setQ} placeholder="Buscar pessoas, grupos, posts..." placeholderTextColor="#666" style={styles.searchInput} />
        </View>

        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.filters}>
          {([["all", "Todos"], ["online", "Online"], ["near", "Próximos"]] as [Filter, string][]).map(([id, lbl]) => (
            <TouchableOpacity key={id} style={[styles.chip, filter === id && styles.chipActive]} onPress={() => setFilter(id)}>
              <Text style={[styles.chipTxt, filter === id && { color: "#000" }]}>{lbl}</Text>
            </TouchableOpacity>
          ))}
        </ScrollView>

        <Text style={styles.sectionTitle}>PERFIS EM ALTA</Text>
        <FlatList
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={{ paddingHorizontal: 12, gap: 10 }}
          data={filtered.slice(0, 12)}
          keyExtractor={(m) => m.member_id}
          renderItem={({ item }) => {
            const tier = TIERS[item.tier] || TIERS.silver;
            return (
              <TouchableOpacity style={styles.profileCard} onPress={() => router.push(`/community/member/${item.member_id}`)}>
                <View style={[styles.profileImg, { backgroundColor: "#141414" }]}>
                  {item.avatar_base64 ? <Image source={{ uri: item.avatar_base64 }} style={{ width: "100%", height: "100%" }} /> : (
                    <View style={{ flex: 1, alignItems: "center", justifyContent: "center" }}>
                      <Text style={{ color: "#888", fontSize: 32, fontWeight: "900" }}>{item.nickname.charAt(0).toUpperCase()}</Text>
                    </View>
                  )}
                  {item.is_online && <View style={styles.profileOnline} />}
                </View>
                <View style={styles.profileInfo}>
                  <View style={{ flexDirection: "row", alignItems: "center", gap: 4 }}>
                    <Text style={styles.profileName}>{item.nickname}{item.age ? `, ${item.age}` : ""}</Text>
                    <Ionicons name={tier.icon as any} size={10} color={tier.color} />
                  </View>
                  <Text style={styles.profileCity} numberOfLines={1}>{item.city || item.profession || "BLACKSCLUB"}</Text>
                </View>
              </TouchableOpacity>
            );
          }}
        />

        <Text style={styles.sectionTitle}>GRUPOS EM DESTAQUE</Text>
        {groups.slice(0, 4).map((g) => (
          <TouchableOpacity key={g.group_id} style={styles.groupRow} onPress={() => router.push(`/community/group/${g.group_id}`)}>
            <View style={[styles.gIc, { backgroundColor: g.color + "22", borderColor: g.color + "66" }]}>
              <Ionicons name={g.icon as any} size={20} color={g.color} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.gName}>{g.name}</Text>
              <Text style={styles.gSub}>Público · {g.members_count} membros</Text>
            </View>
            <View style={[styles.joinBtn, { borderColor: g.color }]}><Ionicons name="add" size={18} color={g.color} /></View>
          </TouchableOpacity>
        ))}

        <Text style={styles.sectionTitle}>EVENTOS PRÓXIMOS</Text>
        {events.slice(0, 4).map((e) => (
          <View key={e.event_id} style={[styles.evRow, { borderLeftColor: e.color }]}>
            <View style={[styles.gIc, { backgroundColor: e.color + "22", borderColor: e.color + "66" }]}>
              <Ionicons name={e.icon as any} size={18} color={e.color} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={[styles.evWhen, { color: e.color }]}>{e.when_label}</Text>
              <Text style={styles.gName}>{e.title}</Text>
              <Text style={styles.gSub}>{e.place} · {e.city}</Text>
            </View>
            <TouchableOpacity style={[styles.partBtn, { backgroundColor: e.color }]}>
              <Text style={styles.partTxt}>Participar</Text>
            </TouchableOpacity>
          </View>
        ))}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  searchRow: { flexDirection: "row", alignItems: "center", gap: 8, margin: 12, paddingHorizontal: 12, paddingVertical: 11, backgroundColor: "#0F0F0F", borderRadius: 10, borderWidth: 1, borderColor: "#1A1A1A" },
  searchInput: { flex: 1, color: "#EEE", fontSize: 13 },
  filters: { paddingHorizontal: 12, gap: 8 },
  chip: { paddingHorizontal: 14, paddingVertical: 7, borderRadius: 20, borderWidth: 1, borderColor: "#222", backgroundColor: "#0F0F0F" },
  chipActive: { backgroundColor: "#D4AF37", borderColor: "#D4AF37" },
  chipTxt: { color: "#DDD", fontSize: 12, fontWeight: "800" },
  sectionTitle: { color: "#888", fontSize: 10, fontWeight: "900", letterSpacing: 2.5, paddingHorizontal: 16, marginTop: 20, marginBottom: 10 },
  profileCard: { width: 150, borderRadius: 14, backgroundColor: "#0F0F0F", borderWidth: 1, borderColor: "#1A1A1A", overflow: "hidden" },
  profileImg: { width: "100%", height: 180, position: "relative" },
  profileOnline: { position: "absolute", top: 8, left: 8, width: 10, height: 10, borderRadius: 5, backgroundColor: "#4EE07F" },
  profileInfo: { padding: 10 },
  profileName: { color: "#EEE", fontSize: 13, fontWeight: "800" },
  profileCity: { color: "#888", fontSize: 11, marginTop: 2 },
  groupRow: { flexDirection: "row", alignItems: "center", gap: 12, paddingHorizontal: 16, paddingVertical: 12 },
  gIc: { width: 40, height: 40, borderRadius: 20, alignItems: "center", justifyContent: "center", borderWidth: 1 },
  gName: { color: "#EEE", fontSize: 13, fontWeight: "800" },
  gSub: { color: "#888", fontSize: 11, marginTop: 2 },
  joinBtn: { width: 30, height: 30, borderRadius: 15, borderWidth: 1, alignItems: "center", justifyContent: "center" },
  evRow: { flexDirection: "row", alignItems: "center", gap: 12, marginHorizontal: 12, marginBottom: 8, padding: 12, backgroundColor: "#0F0F0F", borderRadius: 12, borderLeftWidth: 3, borderTopWidth: 1, borderTopColor: "#1A1A1A", borderRightWidth: 1, borderRightColor: "#1A1A1A", borderBottomWidth: 1, borderBottomColor: "#1A1A1A" },
  evWhen: { fontSize: 10, fontWeight: "900", letterSpacing: 1.5 },
  partBtn: { paddingHorizontal: 14, paddingVertical: 8, borderRadius: 20 },
  partTxt: { color: "#000", fontSize: 10, fontWeight: "900", letterSpacing: 1 },
});
