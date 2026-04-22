import { useState, useCallback, useEffect } from "react";
import {
  View, Text, StyleSheet, FlatList, TouchableOpacity, Image,
  ActivityIndicator, RefreshControl, ScrollView,
} from "react-native";
import { useRouter, useFocusEffect } from "expo-router";
import { Ionicons, MaterialCommunityIcons } from "@expo/vector-icons";
import { api, CommunityMember, Group, CommunityEvent } from "../../src/api";
import { useGate } from "../../src/gate";
import { theme, TIERS } from "../../src/theme";

export default function Community() {
  const router = useRouter();
  const { member } = useGate();
  const [tab, setTab] = useState<"people" | "groups" | "events">("people");
  const [members, setMembers] = useState<CommunityMember[]>([]);
  const [groups, setGroups] = useState<Group[]>([]);
  const [events, setEvents] = useState<CommunityEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    if (!member) return;
    try {
      const [mems, grps, evts] = await Promise.all([
        api.communityMembers(member.member_id),
        api.groupsList(),
        api.eventsList(),
      ]);
      setMembers(mems); setGroups(grps); setEvents(evts);
    } finally { setLoading(false); setRefreshing(false); }
  }, [member]);

  // Heartbeat: mark self online every minute while on this tab
  useFocusEffect(useCallback(() => {
    if (!member) return;
    let alive = true;
    const ping = async () => { try { await api.heartbeat(member.member_id); } catch {} };
    ping();
    const t = setInterval(() => { if (alive) ping(); }, 60_000);
    load();
    return () => { alive = false; clearInterval(t); };
  }, [member, load]));

  const onlineCount = members.filter(m => m.is_online).length;

  return (
    <View style={{ flex: 1, backgroundColor: "#1A1A1A" }}>
      {/* Tabs */}
      <View style={styles.tabs}>
        <TabBtn icon="people" label="MEMBROS" active={tab === "people"} onPress={() => setTab("people")} badge={onlineCount > 0 ? String(onlineCount) : undefined} testID="community-tab-people" />
        <TabBtn icon="chatbubbles" label="GRUPOS" active={tab === "groups"} onPress={() => setTab("groups")} testID="community-tab-groups" />
        <TabBtn icon="calendar" label="EVENTOS" active={tab === "events"} onPress={() => setTab("events")} testID="community-tab-events" />
      </View>

      {/* My profile quick edit */}
      {member && (
        <TouchableOpacity style={styles.myRow} onPress={() => router.push("/community/edit-profile")} testID="community-edit-profile">
          <View style={[styles.myAvatar, { borderColor: TIERS[member.tier].color }]}>
            <Text style={styles.myAvatarTxt}>{(member.nickname || member.name || "M").substring(0, 1).toUpperCase()}</Text>
          </View>
          <View style={{ flex: 1 }}>
            <Text style={styles.myNick}>{member.nickname || member.name?.split(" ")[0] || "Você"}</Text>
            <Text style={styles.myHint}>Tocar para editar seu perfil público</Text>
          </View>
          <Ionicons name="create-outline" size={18} color="#999" />
        </TouchableOpacity>
      )}

      {loading ? (
        <View style={{ padding: 40, alignItems: "center" }}><ActivityIndicator color="#FFF" /></View>
      ) : (
        <>
          {tab === "people" && (
            <FlatList
              data={members}
              keyExtractor={(m) => m.member_id}
              refreshControl={<RefreshControl tintColor="#FFF" refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(); }} />}
              contentContainerStyle={{ paddingVertical: 8, paddingBottom: 40 }}
              ListHeaderComponent={
                <Text style={styles.sectionHint}>
                  {onlineCount > 0 ? `${onlineCount} online agora · ${members.length} no total` : `${members.length} membros`}
                </Text>
              }
              renderItem={({ item }) => <MemberRow m={item} onPress={() => router.push(`/community/member/${item.member_id}`)} />}
              ListEmptyComponent={<Text style={styles.empty}>Sem membros ainda.</Text>}
            />
          )}

          {tab === "groups" && (
            <FlatList
              data={groups}
              keyExtractor={(g) => g.group_id}
              refreshControl={<RefreshControl tintColor="#FFF" refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(); }} />}
              contentContainerStyle={{ paddingVertical: 8, paddingBottom: 40, paddingHorizontal: 16, gap: 8 }}
              ListHeaderComponent={<Text style={styles.sectionHint}>Comunidades de assunto do clube</Text>}
              renderItem={({ item }) => <GroupRow g={item} onPress={() => router.push(`/community/group/${item.group_id}`)} />}
            />
          )}

          {tab === "events" && (
            <FlatList
              data={events}
              keyExtractor={(e) => e.event_id}
              refreshControl={<RefreshControl tintColor="#FFF" refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(); }} />}
              contentContainerStyle={{ paddingVertical: 8, paddingBottom: 40, paddingHorizontal: 16, gap: 10 }}
              ListHeaderComponent={<Text style={styles.sectionHint}>Encontros e eventos privados</Text>}
              renderItem={({ item }) => <EventRow e={item} />}
            />
          )}
        </>
      )}
    </View>
  );
}

function TabBtn({ icon, label, active, onPress, badge, testID }: any) {
  return (
    <TouchableOpacity style={[styles.tabBtn, active && styles.tabBtnActive]} onPress={onPress} testID={testID} activeOpacity={0.85}>
      <Ionicons name={icon} size={16} color={active ? "#D4AF37" : "#999"} />
      <Text style={[styles.tabTxt, active && { color: "#D4AF37" }]}>{label}</Text>
      {badge ? <View style={styles.tabBadge}><Text style={styles.tabBadgeTxt}>{badge}</Text></View> : null}
    </TouchableOpacity>
  );
}

function MemberRow({ m, onPress }: { m: CommunityMember; onPress: () => void }) {
  const tier = TIERS[m.tier] || TIERS.black;
  return (
    <TouchableOpacity style={styles.mrow} onPress={onPress} activeOpacity={0.85} testID={`member-row-${m.member_id}`}>
      <View style={styles.mavatarWrap}>
        {m.avatar_base64 ? (
          <Image source={{ uri: m.avatar_base64 }} style={styles.mavatar} />
        ) : (
          <View style={[styles.mavatar, { backgroundColor: "#2A2A2A", alignItems: "center", justifyContent: "center" }]}>
            <Text style={{ color: "#DDD", fontSize: 17, fontWeight: "800" }}>{m.nickname.charAt(0).toUpperCase()}</Text>
          </View>
        )}
        <View style={[styles.onlineDot, { backgroundColor: m.is_online ? "#4EE07F" : "#555" }]} />
      </View>
      <View style={{ flex: 1 }}>
        <View style={styles.mnameRow}>
          <Text style={styles.mname}>{m.nickname}</Text>
          <Ionicons name={tier.icon as any} size={11} color={tier.color} />
        </View>
        <Text style={styles.mdesc} numberOfLines={1}>
          {[m.profession, m.city, m.age ? `${m.age} anos` : null].filter(Boolean).join(" · ") || (m.bio || "Membro do clube")}
        </Text>
      </View>
      <Ionicons name="chatbubble-ellipses-outline" size={18} color="#999" />
    </TouchableOpacity>
  );
}

function GroupRow({ g, onPress }: { g: Group; onPress: () => void }) {
  return (
    <TouchableOpacity style={[styles.grow, { borderLeftColor: g.color, borderLeftWidth: 3 }]} onPress={onPress} activeOpacity={0.85} testID={`group-${g.group_id}`}>
      <View style={[styles.gicon, { backgroundColor: g.color + "20", borderColor: g.color + "66" }]}>
        <Ionicons name={g.icon as any} size={22} color={g.color} />
      </View>
      <View style={{ flex: 1 }}>
        <Text style={styles.gname}>{g.name}</Text>
        <Text style={styles.gdesc} numberOfLines={2}>{g.description}</Text>
        <Text style={styles.gcount}>{g.members_count} participantes</Text>
      </View>
      <Ionicons name="chevron-forward" size={18} color="#999" />
    </TouchableOpacity>
  );
}

function EventRow({ e }: { e: CommunityEvent }) {
  return (
    <View style={[styles.ev, { borderLeftColor: e.color, borderLeftWidth: 3 }]}>
      <View style={[styles.gicon, { backgroundColor: e.color + "20", borderColor: e.color + "66" }]}>
        <Ionicons name={e.icon as any} size={22} color={e.color} />
      </View>
      <View style={{ flex: 1 }}>
        <Text style={[styles.gname, { color: e.color }]}>{e.when_label.toUpperCase()}</Text>
        <Text style={styles.etitle}>{e.title}</Text>
        <Text style={styles.edesc}>{e.description}</Text>
        <Text style={styles.eplace}>{e.place} · {e.city}</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  tabs: { flexDirection: "row", backgroundColor: "#0F0F0F", borderBottomWidth: 1, borderBottomColor: "#222" },
  tabBtn: {
    flex: 1, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 5,
    paddingVertical: 12, borderBottomWidth: 2, borderBottomColor: "transparent",
    position: "relative",
  },
  tabBtnActive: { borderBottomColor: "#D4AF37" },
  tabTxt: { color: "#999", fontSize: 10, fontWeight: "900", letterSpacing: 1.5 },
  tabBadge: {
    marginLeft: 4, paddingHorizontal: 5, paddingVertical: 1,
    backgroundColor: "#4EE07F", borderRadius: 8, minWidth: 16, alignItems: "center",
  },
  tabBadgeTxt: { color: "#000", fontSize: 9, fontWeight: "900" },

  myRow: {
    flexDirection: "row", alignItems: "center", gap: 12,
    padding: 14, backgroundColor: "#141414",
    borderBottomWidth: 1, borderBottomColor: "#222",
  },
  myAvatar: {
    width: 44, height: 44, borderRadius: 22, borderWidth: 2,
    backgroundColor: "#2A2A2A", alignItems: "center", justifyContent: "center",
  },
  myAvatarTxt: { color: "#EEE", fontSize: 16, fontWeight: "800" },
  myNick: { color: "#EFEFEF", fontSize: 14, fontWeight: "800" },
  myHint: { color: "#888", fontSize: 11, marginTop: 2 },

  sectionHint: { color: "#999", fontSize: 10, fontWeight: "800", letterSpacing: 2, paddingHorizontal: 16, paddingVertical: 10 },

  mrow: {
    flexDirection: "row", alignItems: "center", gap: 12,
    paddingHorizontal: 16, paddingVertical: 10,
  },
  mavatarWrap: { position: "relative" },
  mavatar: { width: 44, height: 44, borderRadius: 22, backgroundColor: "#2A2A2A" },
  onlineDot: {
    position: "absolute", right: -1, bottom: -1,
    width: 12, height: 12, borderRadius: 6,
    borderWidth: 2, borderColor: "#1A1A1A",
  },
  mnameRow: { flexDirection: "row", alignItems: "center", gap: 6 },
  mname: { color: "#EFEFEF", fontSize: 14, fontWeight: "800" },
  mdesc: { color: "#999", fontSize: 11, marginTop: 2 },

  grow: {
    flexDirection: "row", alignItems: "center", gap: 12,
    padding: 14, borderRadius: 10,
    backgroundColor: "#242424", borderWidth: 1, borderColor: "#2E2E2E",
  },
  gicon: {
    width: 44, height: 44, borderRadius: 22,
    alignItems: "center", justifyContent: "center",
    borderWidth: 1,
  },
  gname: { color: "#EFEFEF", fontSize: 14, fontWeight: "800" },
  gdesc: { color: "#AAA", fontSize: 11, marginTop: 2, lineHeight: 16 },
  gcount: { color: "#888", fontSize: 10, marginTop: 4, letterSpacing: 1 },

  ev: {
    flexDirection: "row", gap: 12, padding: 14,
    borderRadius: 10, backgroundColor: "#242424", borderWidth: 1, borderColor: "#2E2E2E",
  },
  etitle: { color: "#F0F0F0", fontSize: 15, fontWeight: "800", marginTop: 4 },
  edesc: { color: "#AAA", fontSize: 12, marginTop: 4, lineHeight: 17 },
  eplace: { color: "#888", fontSize: 11, marginTop: 6, letterSpacing: 0.3 },

  empty: { color: "#999", fontSize: 12, textAlign: "center", marginTop: 40 },
});
