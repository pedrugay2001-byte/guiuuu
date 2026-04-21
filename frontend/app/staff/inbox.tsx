import { useCallback, useEffect, useState } from "react";
import {
  View, Text, StyleSheet, FlatList, TouchableOpacity, ActivityIndicator,
  RefreshControl, Alert,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Stack, useRouter, useFocusEffect } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { api, ChatThread, setToken } from "../../src/api";
import { theme } from "../../src/theme";

export default function StaffInbox() {
  const router = useRouter();
  const [threads, setThreads] = useState<ChatThread[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    try {
      const data = await api.chatThreads();
      setThreads(data);
    } catch (e: any) {
      if (String(e.message).toLowerCase().includes("not auth")) {
        router.replace("/staff/login");
      }
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [router]);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  // Poll every 5s while focused
  useEffect(() => {
    const t = setInterval(load, 5000);
    return () => clearInterval(t);
  }, [load]);

  const logout = () => {
    Alert.alert("Sair", "Deseja sair da área de equipe?", [
      { text: "Cancelar", style: "cancel" },
      {
        text: "Sair",
        style: "destructive",
        onPress: async () => {
          await setToken(null);
          router.replace("/");
        },
      },
    ]);
  };

  if (loading) {
    return (
      <View style={{ flex: 1, backgroundColor: theme.colors.bg, justifyContent: "center" }}>
        <ActivityIndicator color={theme.colors.white} />
      </View>
    );
  }

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: theme.colors.bg }} edges={["top", "bottom"]}>
      <Stack.Screen
        options={{
          title: "Caixa de Mensagens",
          headerRight: () => (
            <TouchableOpacity onPress={logout} style={{ marginRight: 12 }} testID="staff-logout">
              <Ionicons name="log-out-outline" size={22} color={theme.colors.white} />
            </TouchableOpacity>
          ),
        }}
      />
      {threads.length === 0 ? (
        <View style={styles.empty}>
          <Ionicons name="chatbubbles-outline" size={64} color={theme.colors.textMuted} />
          <Text style={styles.emptyTitle}>Sem conversas</Text>
          <Text style={styles.emptyText}>
            As conversas aparecem aqui quando membros fecharem pedidos ou enviarem mensagens.
          </Text>
        </View>
      ) : (
        <FlatList
          data={threads}
          keyExtractor={(t) => t.member_id}
          refreshControl={<RefreshControl tintColor={theme.colors.white} refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(); }} />}
          contentContainerStyle={{ padding: theme.spacing.md, gap: 8 }}
          renderItem={({ item }) => (
            <TouchableOpacity
              style={styles.row}
              onPress={() => router.push(`/staff/chat/${item.member_id}`)}
              testID={`thread-${item.member_id}`}
            >
              <View style={styles.avatar}>
                <Text style={styles.avatarText}>{item.member_name.substring(0, 1).toUpperCase()}</Text>
              </View>
              <View style={{ flex: 1 }}>
                <View style={styles.rowHead}>
                  <Text style={styles.name} numberOfLines={1}>{item.member_name}</Text>
                  <Text style={styles.time}>
                    {new Date(item.last_at).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}
                  </Text>
                </View>
                <View style={styles.rowBody}>
                  <Text style={styles.lastMsg} numberOfLines={1}>
                    {item.last_sender === "support" ? "Você: " : ""}
                    {item.last_message.replace(/[*_]/g, "")}
                  </Text>
                  {item.unread > 0 && (
                    <View style={styles.badge}>
                      <Text style={styles.badgeText}>{item.unread}</Text>
                    </View>
                  )}
                </View>
              </View>
            </TouchableOpacity>
          )}
        />
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: "row", alignItems: "center", gap: 12,
    padding: 12, backgroundColor: theme.colors.surface,
    borderWidth: 1, borderColor: theme.colors.border, borderRadius: 8,
  },
  avatar: {
    width: 44, height: 44, borderRadius: 22,
    backgroundColor: theme.colors.surfaceElevated,
    borderWidth: 1, borderColor: theme.colors.silver,
    alignItems: "center", justifyContent: "center",
  },
  avatarText: { color: theme.colors.white, fontSize: 16, fontWeight: "800" },
  rowHead: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  name: { color: theme.colors.white, fontSize: 14, fontWeight: "700", flex: 1 },
  time: { color: theme.colors.textMuted, fontSize: 11 },
  rowBody: { flexDirection: "row", alignItems: "center", gap: 8, marginTop: 4 },
  lastMsg: { color: theme.colors.textMuted, fontSize: 12, flex: 1 },
  badge: {
    backgroundColor: theme.colors.whatsapp, borderRadius: 10,
    minWidth: 20, height: 20, paddingHorizontal: 6,
    alignItems: "center", justifyContent: "center",
  },
  badgeText: { color: theme.colors.white, fontSize: 10, fontWeight: "800" },
  empty: { flex: 1, alignItems: "center", justifyContent: "center", padding: theme.spacing.lg, gap: 12 },
  emptyTitle: { color: theme.colors.white, fontSize: 20, fontWeight: "700" },
  emptyText: { color: theme.colors.textMuted, fontSize: 14, textAlign: "center" },
});
