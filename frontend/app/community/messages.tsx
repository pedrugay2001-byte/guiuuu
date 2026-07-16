import { useEffect, useState, useCallback } from "react";
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity, Image,
  ActivityIndicator, FlatList, TextInput, Alert, Pressable, Modal,
} from "react-native";
import { Stack, useRouter, useFocusEffect } from "expo-router";
import { Ionicons } from "../../src/icons";
import { api, CommunityMember, StoryGroup } from "../../src/api";
import { useGate } from "../../src/gate";
import { TIERS } from "../../src/theme";
import ScreenHeader from "../../src/screen-header";

type Thread = { partner: CommunityMember; last_text: string; last_at: string };

export default function Messages() {
  const router = useRouter();
  const { member } = useGate();
  const [threads, setThreads] = useState<Thread[]>([]);
  const [members, setMembers] = useState<CommunityMember[]>([]);
  const [stories, setStories] = useState<StoryGroup[]>([]);
  const [q, setQ] = useState("");
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null); // partner_id sendo deletado
  const [confirm, setConfirm] = useState<Thread | null>(null);
  void members;
  void useEffect;

  const load = useCallback(async () => {
    if (!member) return;
    try {
      const [mems, ss, tdata] = await Promise.all([
        api.communityMembers(member.member_id),
        api.listStories(),
        api.dmThreads(member.member_id),
      ]);
      setMembers(mems); setStories(ss);
      const enriched: Thread[] = [];
      for (const t of tdata) {
        const p = mems.find(m => m.member_id === t.partner_id);
        if (p) enriched.push({ partner: p, last_text: t.last_text, last_at: t.last_at });
      }
      setThreads(enriched);
    } finally { setLoading(false); }
  }, [member]);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  // Abre modal in-app (Alert.alert com botões custom não funciona no react-native-web).
  const promptDeleteThread = (t: Thread) => setConfirm(t);

  const doDeleteThread = async () => {
    if (!member || !confirm) return;
    const partnerId = confirm.partner.member_id;
    setBusy(partnerId);
    try {
      await api.dmDeleteThread(member.member_id, partnerId);
      setThreads(prev => prev.filter(x => x.partner.member_id !== partnerId));
      setConfirm(null);
    } catch (e: any) {
      Alert.alert("Erro", e?.message || "Não foi possível apagar a conversa.");
    } finally { setBusy(null); }
  };

  const filtered = threads.filter(t => !q || t.partner.nickname.toLowerCase().includes(q.toLowerCase()));

  if (loading) return <View style={{ flex: 1, backgroundColor: "#050505", justifyContent: "center" }}><ActivityIndicator color="#FFF" /></View>;

  return (
    <View style={{ flex: 1, backgroundColor: "#050505" }}>
      <Stack.Screen options={{ headerShown: false }} />
      <ScreenHeader
        title="Mensagens"
        right={
          <TouchableOpacity onPress={() => router.push("/community" as any)} hitSlop={12}>
            <Ionicons name="create" size={22} color="#D4AF37" />
          </TouchableOpacity>
        }
      />
      <ScrollView contentContainerStyle={{ paddingBottom: 30 }}>
        <View style={styles.searchRow}>
          <Ionicons name="search" size={16} color="#888" />
          <TextInput value={q} onChangeText={setQ} placeholder="Buscar conversas..." placeholderTextColor="#666" style={styles.searchInput} />
        </View>

        {/* Stories strip */}
        <FlatList
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={{ paddingHorizontal: 14, gap: 12, paddingVertical: 10 }}
          data={[{ type: "me" }, ...stories.filter(s => s.member_id !== member?.member_id).map(s => ({ type: "s", data: s }))] as any[]}
          keyExtractor={(_, i) => String(i)}
          renderItem={({ item }) => {
            if (item.type === "me") {
              return (
                <TouchableOpacity style={styles.storyItem} onPress={() => router.push("/community/create-story")}>
                  <View style={[styles.storyRing, { borderColor: "#333", borderStyle: "dashed" }]}>
                    <View style={styles.myStoryAv}><Ionicons name="add" size={22} color="#D4AF37" /></View>
                  </View>
                  <Text style={styles.storyName}>Seu story</Text>
                </TouchableOpacity>
              );
            }
            const s: StoryGroup = item.data;
            const tier = TIERS[s.tier] || TIERS.silver;
            return (
              <TouchableOpacity style={styles.storyItem} onPress={() => router.push(`/community/dm/${s.member_id}`)}>
                <View style={[styles.storyRing, { borderColor: tier.color }]}>
                  {s.avatar_base64 ? <Image source={{ uri: s.avatar_base64 }} style={styles.storyAv} /> : (
                    <View style={[styles.storyAv, { backgroundColor: "#2A2A2A", alignItems: "center", justifyContent: "center" }]}>
                      <Text style={{ color: "#EEE", fontWeight: "800" }}>{s.nickname.charAt(0).toUpperCase()}</Text>
                    </View>
                  )}
                </View>
                <Text style={styles.storyName} numberOfLines={1}>{s.nickname}</Text>
              </TouchableOpacity>
            );
          }}
        />

        {filtered.length === 0 && threads.length === 0 ? (
          <View style={styles.empty}>
            <Ionicons name="mail-outline" size={40} color="#444" />
            <Text style={styles.emptyTxt}>Sem conversas ainda.</Text>
            <Text style={styles.emptyHint}>Abra o perfil de um membro e toque em “Puxar conversa”.</Text>
          </View>
        ) : filtered.map((t) => {
          const tier = TIERS[t.partner.tier] || TIERS.silver;
          const imgMatch = /\[IMG\][^[]+\[\/IMG\]/.test(t.last_text);
          const audMatch = /\[AUD\][^[]+\[\/AUD\]/.test(t.last_text);
          const preview = audMatch ? "🎤 Áudio" : imgMatch ? "📷 Foto" : t.last_text;
          const isBusy = busy === t.partner.member_id;
          return (
            <Pressable
              key={t.partner.member_id}
              style={({ pressed }) => [styles.threadRow, pressed && { backgroundColor: "#0A0A0A" }]}
              onPress={() => router.push(`/community/dm/${t.partner.member_id}`)}
              onLongPress={() => promptDeleteThread(t)}
              delayLongPress={400}
              disabled={isBusy}
              testID={`thread-${t.partner.member_id}`}
            >
              <View style={[styles.avWrap, { borderColor: tier.color }]}>
                {t.partner.avatar_base64 ? <Image source={{ uri: t.partner.avatar_base64 }} style={styles.av} /> : (
                  <View style={[styles.av, { backgroundColor: "#2A2A2A", alignItems: "center", justifyContent: "center" }]}>
                    <Text style={{ color: "#EEE", fontWeight: "800", fontSize: 15 }}>{t.partner.nickname.charAt(0).toUpperCase()}</Text>
                  </View>
                )}
                {t.partner.is_online && <View style={styles.onlineDot} />}
              </View>
              <View style={{ flex: 1 }}>
                <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
                  <Text style={styles.name}>{t.partner.nickname}</Text>
                  <Ionicons name={tier.icon as any} size={11} color={tier.color} />
                </View>
                <Text style={styles.preview} numberOfLines={1}>{preview || "..."}</Text>
              </View>
              {isBusy && <ActivityIndicator color="#F87171" />}
            </Pressable>
          );
        })}
      </ScrollView>

      {/* MODAL: confirmação de apagar conversa */}
      <Modal visible={!!confirm} transparent animationType="fade" onRequestClose={() => !busy && setConfirm(null)}>
        <View style={styles.confirmBackdrop}>
          <View style={styles.confirmCard}>
            <View style={{ alignItems: "center", gap: 8 }}>
              <Ionicons name="trash" size={44} color="#F87171" />
              <Text style={styles.confirmTitle}>Apagar conversa com {confirm?.partner.nickname}?</Text>
              <Text style={styles.confirmDesc}>
                Todas as mensagens serão apagadas permanentemente para você e para o(a) outro(a) participante. Esta ação não pode ser desfeita.
              </Text>
            </View>
            <TouchableOpacity
              style={[styles.confirmBtn, !!busy && { opacity: 0.6 }]}
              disabled={!!busy}
              onPress={doDeleteThread}
              testID="thread-delete-confirm"
            >
              {busy ? <ActivityIndicator color="#FFF" /> : (
                <>
                  <Ionicons name="trash" size={16} color="#FFF" />
                  <Text style={styles.confirmBtnTxt}>APAGAR TUDO</Text>
                </>
              )}
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.confirmCancel}
              disabled={!!busy}
              onPress={() => setConfirm(null)}
            >
              <Text style={styles.confirmCancelTxt}>Cancelar</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  searchRow: { flexDirection: "row", alignItems: "center", gap: 8, margin: 12, paddingHorizontal: 12, paddingVertical: 10, backgroundColor: "#0F0F0F", borderRadius: 10, borderWidth: 1, borderColor: "#1A1A1A" },
  searchInput: { flex: 1, color: "#EEE", fontSize: 13 },
  storyItem: { alignItems: "center", width: 72 },
  storyRing: { width: 60, height: 60, borderRadius: 30, borderWidth: 2, padding: 2, alignItems: "center", justifyContent: "center" },
  storyAv: { width: 52, height: 52, borderRadius: 26 },
  myStoryAv: { width: 52, height: 52, borderRadius: 26, backgroundColor: "#141414", alignItems: "center", justifyContent: "center", borderWidth: 1, borderColor: "#333" },
  storyName: { color: "#CCC", fontSize: 11, marginTop: 5, fontWeight: "700" },
  empty: { alignItems: "center", padding: 40, gap: 8 },
  emptyTxt: { color: "#888", fontSize: 14, fontWeight: "800" },
  emptyHint: { color: "#666", fontSize: 11, textAlign: "center" },
  threadRow: { flexDirection: "row", alignItems: "center", gap: 12, paddingHorizontal: 16, paddingVertical: 12 },
  avWrap: { width: 50, height: 50, borderRadius: 25, borderWidth: 2, padding: 1, position: "relative" },
  av: { width: 44, height: 44, borderRadius: 22 },
  onlineDot: { position: "absolute", right: -1, bottom: -1, width: 12, height: 12, borderRadius: 6, backgroundColor: "#4EE07F", borderWidth: 2, borderColor: "#050505" },
  name: { color: "#EEE", fontSize: 14, fontWeight: "800" },
  preview: { color: "#888", fontSize: 12, marginTop: 2 },

  // Confirmação in-app (substitui Alert.alert que não funciona no RN-Web)
  confirmBackdrop: { flex: 1, backgroundColor: "rgba(0,0,0,0.55)", justifyContent: "center", alignItems: "center", padding: 24 },
  confirmCard: { backgroundColor: "#0C0C0C", borderRadius: 14, borderWidth: 1, borderColor: "#1F1F1F", minWidth: 280, padding: 18, gap: 12 },
  confirmTitle: { color: "#FFF", fontSize: 15, fontWeight: "900", textAlign: "center" },
  confirmDesc: { color: "#AAA", fontSize: 12, textAlign: "center", lineHeight: 17 },
  confirmBtn: { backgroundColor: "#F87171", paddingVertical: 12, borderRadius: 10, alignItems: "center", flexDirection: "row", justifyContent: "center", gap: 8 },
  confirmBtnTxt: { color: "#FFF", fontSize: 13, fontWeight: "900", letterSpacing: 0.5 },
  confirmCancel: { paddingVertical: 10, alignItems: "center" },
  confirmCancelTxt: { color: "#888", fontSize: 12, fontWeight: "800", letterSpacing: 0.3 },
});
