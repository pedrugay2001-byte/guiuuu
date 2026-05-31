import { useEffect, useState, useCallback } from "react";
import {
  View, Text, StyleSheet, FlatList, TouchableOpacity, Image,
  ActivityIndicator, RefreshControl,
} from "react-native";
import { Stack, useRouter, useFocusEffect } from "expo-router";
import { Ionicons } from "../../src/icons";
import { api, NotificationItem } from "../../src/api";
import { useGate } from "../../src/gate";

function timeAgo(iso: string) {
  const d = new Date(iso);
  const m = Math.floor((Date.now() - d.getTime()) / 60000);
  if (m < 1) return "agora"; if (m < 60) return `${m}min`;
  const h = Math.floor(m / 60); if (h < 24) return `${h}h`;
  return `${Math.floor(h / 24)}d`;
}

type AdminBreakdown = { pix_pending: number; sales: number; quotes: number; support_msgs: number };

export default function Notifications() {
  const router = useRouter();
  const { member } = useGate();
  const [items, setItems] = useState<NotificationItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [isAdmin, setIsAdmin] = useState(false);
  const [adminBreakdown, setAdminBreakdown] = useState<AdminBreakdown>({ pix_pending: 0, sales: 0, quotes: 0, support_msgs: 0 });

  const load = useCallback(async () => {
    if (!member) return;
    try {
      const [d, c] = await Promise.all([
        api.notifications(member.member_id),
        api.notificationsCount(member.member_id),
      ]);
      setItems(d);
      if (c.is_admin_member) {
        setIsAdmin(true);
        if (c.admin_breakdown) setAdminBreakdown(c.admin_breakdown);
      } else {
        setIsAdmin(false);
      }
    } finally {
      setLoading(false); setRefreshing(false);
    }
  }, [member]);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  if (loading) return <View style={{ flex: 1, backgroundColor: "#050505", justifyContent: "center" }}><ActivityIndicator color="#FFF" /></View>;

  // Card ADMIN — só aparece para admin/staff (Master Luis Guilherme + equipe)
  const adminTotal = adminBreakdown.pix_pending + adminBreakdown.sales + adminBreakdown.quotes + adminBreakdown.support_msgs;

  const AdminHeader = isAdmin ? (
    <View style={styles.adminCard}>
      <View style={styles.adminHeaderRow}>
        <View style={styles.adminBadge}>
          <Ionicons name="shield-checkmark" size={12} color="#0A0A0A" />
          <Text style={styles.adminBadgeTxt}>CENTRAL ADM</Text>
        </View>
        <Text style={styles.adminTitle}>Atividade da plataforma</Text>
        {adminTotal > 0 && (
          <View style={styles.adminTotalBadge}>
            <Text style={styles.adminTotalTxt}>{adminTotal}</Text>
          </View>
        )}
      </View>
      <Text style={styles.adminHint}>
        Tudo que seus membros fazem em tempo real — toque para abrir cada central.
      </Text>

      <View style={styles.adminGrid}>
        <AdminTile
          icon="wallet"
          label="Pedidos PIX"
          value={adminBreakdown.pix_pending}
          color="#F5C150"
          onPress={() => router.push("/staff/pix-orders" as any)}
          highlight={adminBreakdown.pix_pending > 0}
        />
        <AdminTile
          icon="cart"
          label="Vendas"
          value={adminBreakdown.sales}
          color="#4EE07F"
          onPress={() => router.push("/staff/dashboard" as any)}
          highlight={adminBreakdown.sales > 0}
        />
        <AdminTile
          icon="document-text"
          label="Orçamentos"
          value={adminBreakdown.quotes}
          color="#7FD7E5"
          onPress={() => router.push("/staff/dashboard" as any)}
          highlight={adminBreakdown.quotes > 0}
        />
        <AdminTile
          icon="headset"
          label="Suporte"
          value={adminBreakdown.support_msgs}
          color="#D4AF37"
          onPress={() => router.push("/staff/inbox" as any)}
          highlight={adminBreakdown.support_msgs > 0}
        />
      </View>

      <TouchableOpacity
        style={styles.adminFullBtn}
        onPress={() => router.push("/staff/dashboard" as any)}
        activeOpacity={0.85}
      >
        <Ionicons name="grid" size={14} color="#D4AF37" />
        <Text style={styles.adminFullBtnTxt}>ABRIR PAINEL COMPLETO</Text>
        <Ionicons name="chevron-forward" size={14} color="#D4AF37" />
      </TouchableOpacity>
    </View>
  ) : null;

  return (
    <View style={{ flex: 1, backgroundColor: "#050505" }}>
      <FlatList
        data={items}
        keyExtractor={(it) => it.id}
        contentContainerStyle={{ paddingBottom: 30 }}
        ListHeaderComponent={AdminHeader}
        refreshControl={<RefreshControl tintColor="#FFF" refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(); }} />}
        ListEmptyComponent={
          isAdmin ? null : (
            <View style={styles.empty}>
              <Ionicons name="notifications-off-outline" size={44} color="#444" />
              <Text style={styles.emptyTxt}>Sem notificações por enquanto</Text>
              <Text style={styles.emptyHint}>Quando você receber DMs, vendas ou convites de grupo, aparece aqui.</Text>
            </View>
          )
        }
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

// Tile de cada categoria do admin (PIX, Vendas, Orçamentos, Suporte)
function AdminTile(props: {
  icon: string; label: string; value: number; color: string;
  onPress: () => void; highlight?: boolean;
}) {
  return (
    <TouchableOpacity
      style={[
        styles.adminTile,
        props.highlight && { borderColor: props.color + "AA", backgroundColor: props.color + "12" },
      ]}
      onPress={props.onPress}
      activeOpacity={0.85}
    >
      <View style={[styles.adminTileIcon, { backgroundColor: props.color + "22", borderColor: props.color + "55" }]}>
        <Ionicons name={props.icon as any} size={16} color={props.color} />
      </View>
      <Text style={styles.adminTileValue}>{props.value}</Text>
      <Text style={styles.adminTileLabel}>{props.label}</Text>
      {props.highlight && <View style={[styles.adminTileDot, { backgroundColor: props.color }]} />}
    </TouchableOpacity>
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

  // ===== Card ADMIN/STAFF =====
  adminCard: {
    margin: 14, padding: 16,
    backgroundColor: "#0A0F1A",
    borderWidth: 1.5, borderColor: "rgba(212,175,55,0.4)",
    borderRadius: 14,
  },
  adminHeaderRow: { flexDirection: "row", alignItems: "center", gap: 8, marginBottom: 4 },
  adminBadge: {
    flexDirection: "row", alignItems: "center", gap: 4,
    paddingHorizontal: 8, paddingVertical: 4,
    backgroundColor: "#D4AF37", borderRadius: 6,
  },
  adminBadgeTxt: { color: "#0A0A0A", fontSize: 9.5, fontWeight: "900", letterSpacing: 1.2 },
  adminTitle: { color: "#EEE", fontSize: 12, fontWeight: "800", flex: 1 },
  adminTotalBadge: {
    paddingHorizontal: 8, paddingVertical: 2,
    backgroundColor: "#F87171", borderRadius: 10, minWidth: 24, alignItems: "center",
  },
  adminTotalTxt: { color: "#FFF", fontSize: 11, fontWeight: "900" },
  adminHint: { color: "#888", fontSize: 11, marginBottom: 14 },

  adminGrid: {
    flexDirection: "row", flexWrap: "wrap", gap: 8,
  },
  adminTile: {
    flex: 1, minWidth: "47%",
    backgroundColor: "#0E0E0E",
    borderWidth: 1, borderColor: "#1A1A1A",
    borderRadius: 10,
    paddingVertical: 14, paddingHorizontal: 12,
    alignItems: "flex-start", gap: 4,
    position: "relative",
  },
  adminTileIcon: {
    width: 30, height: 30, borderRadius: 15,
    alignItems: "center", justifyContent: "center",
    borderWidth: 1, marginBottom: 4,
  },
  adminTileValue: { color: "#FFF", fontSize: 22, fontWeight: "900" },
  adminTileLabel: { color: "#888", fontSize: 10.5, fontWeight: "700", letterSpacing: 0.5 },
  adminTileDot: {
    position: "absolute", top: 8, right: 8,
    width: 8, height: 8, borderRadius: 4,
  },

  adminFullBtn: {
    flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8,
    marginTop: 14, paddingVertical: 11,
    backgroundColor: "rgba(212,175,55,0.1)",
    borderWidth: 1, borderColor: "rgba(212,175,55,0.4)",
    borderRadius: 10,
  },
  adminFullBtnTxt: { color: "#D4AF37", fontSize: 11, fontWeight: "900", letterSpacing: 1.5 },
});
