import { useEffect, useState, useCallback } from "react";
import {
  View, Text, StyleSheet, FlatList, TouchableOpacity, Image,
  ActivityIndicator, RefreshControl,
} from "react-native";
import { Stack, useRouter, useFocusEffect } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { api, NotificationItem } from "../../src/api";
import { useGate } from "../../src/gate";

function timeAgo(iso: string) {
  const d = new Date(iso);
  const m = Math.floor((Date.now() - d.getTime()) / 60000);
  if (m < 1) return "agora"; if (m < 60) return `${m}min`;
  const h = Math.floor(m / 60); if (h < 24) return `${h}h`;
  return `${Math.floor(h / 24)}d`;
}

export default function Notifications() {
  const router = useRouter();
  const { member } = useGate();
  const [items, setItems] = useState<NotificationItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    if (!member) return;
    try { const d = await api.notifications(member.member_id); setItems(d); }
    finally { setLoading(false); setRefreshing(false); }
  }, [member]);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  if (loading) return <View style={{ flex: 1, backgroundColor: "#050505", justifyContent: "center" }}><ActivityIndicator color="#FFF" /></View>;

  return (
    <View style={{ flex: 1, backgroundColor: "#050505" }}>
      <FlatList
        data={items}
        keyExtractor={(it) => it.id}
        contentContainerStyle={{ paddingBottom: 30 }}
        refreshControl={<RefreshControl tintColor="#FFF" refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(); }} />}
        ListEmptyComponent={<View style={styles.empty}><Ionicons name="notifications-off-outline" size={44} color="#444" /><Text style={styles.emptyTxt}>Sem notificações por enquanto</Text><Text style={styles.emptyHint}>Quando você receber DMs, vendas ou convites de grupo, aparece aqui.</Text></View>}
        renderItem={({ item }) => (
          <TouchableOpacity style={styles.row} onPress={() => router.push(item.route as any)}>
            {item.avatar ? (
              <Image source={{ uri: item.avatar }} style={styles.avatar} />
            ) : (
              <View style={[styles.icon, { backgroundColor: item.color + "22", borderColor: item.color }]}>
                <Ionicons name={item.icon as any} size={18} color={item.color} />
              </View>
            )}
            <View style={{ flex: 1 }}>
              <Text style={styles.title} numberOfLines={1}>{item.title}</Text>
              {item.body ? <Text style={styles.body} numberOfLines={2}>{item.body}</Text> : null}
              <Text style={styles.time}>{timeAgo(item.created_at)}</Text>
            </View>
            <Ionicons name="chevron-forward" size={16} color="#444" />
          </TouchableOpacity>
        )}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: "row", alignItems: "center", gap: 12, paddingHorizontal: 16, paddingVertical: 13, borderBottomWidth: 1, borderBottomColor: "#111" },
  avatar: { width: 44, height: 44, borderRadius: 22, backgroundColor: "#1A1A1A" },
  icon: { width: 44, height: 44, borderRadius: 22, alignItems: "center", justifyContent: "center", borderWidth: 1 },
  title: { color: "#EEE", fontSize: 13, fontWeight: "800" },
  body: { color: "#AAA", fontSize: 12, marginTop: 2 },
  time: { color: "#666", fontSize: 10, marginTop: 4 },
  empty: { alignItems: "center", padding: 50, gap: 8 },
  emptyTxt: { color: "#999", fontSize: 14, fontWeight: "800" },
  emptyHint: { color: "#666", fontSize: 11, textAlign: "center" },
});
