import { useEffect, useState, useCallback } from "react";
import {
  View, Text, StyleSheet, Image, TouchableOpacity, ScrollView,
  ActivityIndicator, FlatList, Dimensions,
} from "react-native";
import { Stack, useRouter, useLocalSearchParams } from "expo-router";
import { Ionicons } from "../../../src/icons";
import { api, CommunityMember, Ad } from "../../../src/api";
import { formatBLX } from "../../../src/blx";
import { TIERS } from "../../../src/theme";
import GalleryViewer from "../../../src/gallery-viewer";

const { width } = Dimensions.get("window");
const PHOTO_W = (width - 48) / 3;

export default function MemberProfile() {
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();
  const [m, setM] = useState<CommunityMember | null>(null);
  const [photos, setPhotos] = useState<string[]>([]);
  const [ads, setAds] = useState<Ad[]>([]);
  const [loading, setLoading] = useState(true);
  const [viewerOpen, setViewerOpen] = useState(false);
  const [viewerIdx, setViewerIdx] = useState(0);

  const load = useCallback(async () => {
    if (!id) return;
    try {
      const [d, ph, a] = await Promise.all([api.communityMember(id), api.getPhotos(id), api.myAds(id).catch(() => [])]);
      setM(d); setPhotos(ph.photos || []); setAds(a);
    } finally { setLoading(false); }
  }, [id]);
  useEffect(() => { load(); }, [load]);

  if (loading || !m) return <View style={{ flex: 1, backgroundColor: "#050505", justifyContent: "center" }}><ActivityIndicator color="#FFF" /></View>;

  const tier = TIERS[m.tier] || TIERS.silver;
  const infoItems = [
    { icon: "calendar-outline", label: "Idade", value: m.age ? `${m.age} anos` : null },
    { icon: "briefcase-outline", label: "Profissão", value: m.profession },
    { icon: "barbell-outline", label: "Onde malha", value: m.gym },
    { icon: "location-outline", label: "Cidade", value: m.city },
  ].filter(x => x.value);

  return (
    <View style={{ flex: 1, backgroundColor: "#050505" }}>
      <Stack.Screen options={{ title: "Perfil", headerStyle: { backgroundColor: "#050505" }, headerTintColor: "#FFF" }} />
      <ScrollView contentContainerStyle={{ padding: 20, paddingBottom: 100 }}>
        <View style={styles.avatarWrap}>
          <View style={[styles.avatarRing, { borderColor: tier.color }]}>
            {m.avatar_base64 ? <Image source={{ uri: m.avatar_base64 }} style={styles.avatar} /> : (
              <View style={[styles.avatar, { backgroundColor: "#2A2A2A", alignItems: "center", justifyContent: "center" }]}>
                <Text style={{ color: "#DDD", fontSize: 48, fontWeight: "800" }}>{m.nickname.charAt(0).toUpperCase()}</Text>
              </View>
            )}
          </View>
          <View style={[styles.onlineBadge, { backgroundColor: m.is_online ? "#4EE07F" : "#555" }]} />
        </View>

        <Text style={styles.name}>{m.nickname}{m.age ? `, ${m.age}` : ""}</Text>
        <View style={styles.pillRow}>
          <View style={[styles.pill, { borderColor: tier.color }]}>
            <Ionicons name={tier.icon as any} size={11} color={tier.color} />
            <Text style={[styles.pillTxt, { color: tier.color }]}>{tier.label.toUpperCase()}</Text>
          </View>
          {m.member_number && <View style={styles.numPill}><Text style={styles.numTxt}>#{m.member_number}</Text></View>}
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

        {photos.length > 0 && (
          <>
            <Text style={styles.sectionLbl}>GALERIA ({photos.length})</Text>
            <View style={styles.galGrid}>
              {photos.map((p, i) => (
                <TouchableOpacity key={i} activeOpacity={0.85}
                  onPress={() => { setViewerIdx(i); setViewerOpen(true); }}>
                  <Image source={{ uri: p }} style={[styles.galImg, { width: PHOTO_W, height: PHOTO_W }]} />
                </TouchableOpacity>
              ))}
            </View>
          </>
        )}

        {ads.length > 0 && (
          <>
            <Text style={styles.sectionLbl}>ANÚNCIOS ATIVOS ({ads.length})</Text>
            {ads.map((a) => (
              <TouchableOpacity key={a.ad_id} style={styles.adRow} onPress={() => router.push(`/ads/${a.ad_id}`)}>
                {a.images?.[0] ? <Image source={{ uri: a.images[0] }} style={styles.adImg} /> : <View style={[styles.adImg, { backgroundColor: "#1A1A1A", alignItems: "center", justifyContent: "center" }]}><Ionicons name="cube" size={20} color="#555" /></View>}
                <View style={{ flex: 1 }}>
                  <Text style={styles.adTitle} numberOfLines={1}>{a.title}</Text>
                  <Text style={styles.adPrice}>{formatBLX(Math.round(a.price_full * 100))} BLX</Text>
                </View>
                <Ionicons name="chevron-forward" size={18} color="#666" />
              </TouchableOpacity>
            ))}
          </>
        )}

        <TouchableOpacity style={styles.cta} onPress={() => router.push(`/community/dm/${m.member_id}`)} testID="profile-dm" activeOpacity={0.85}>
          <Ionicons name="chatbubble" size={16} color="#000" />
          <Text style={styles.ctaTxt}>PUXAR CONVERSA</Text>
        </TouchableOpacity>
      </ScrollView>

      <GalleryViewer
        visible={viewerOpen}
        photos={photos}
        initialIndex={viewerIdx}
        onClose={() => setViewerOpen(false)}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  avatarWrap: { alignSelf: "center", position: "relative" },
  avatarRing: { width: 148, height: 148, borderRadius: 74, borderWidth: 3, padding: 4 },
  avatar: { width: 134, height: 134, borderRadius: 67 },
  onlineBadge: { position: "absolute", bottom: 10, right: 10, width: 22, height: 22, borderRadius: 11, borderWidth: 3, borderColor: "#050505" },
  name: { color: "#EFEFEF", fontSize: 24, fontWeight: "900", textAlign: "center", marginTop: 12 },
  pillRow: { flexDirection: "row", gap: 6, justifyContent: "center", marginTop: 10, flexWrap: "wrap" },
  pill: { flexDirection: "row", alignItems: "center", gap: 4, paddingHorizontal: 10, paddingVertical: 4, borderRadius: 20, borderWidth: 1 },
  pillTxt: { fontSize: 9, fontWeight: "900", letterSpacing: 1.5 },
  numPill: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 20, borderWidth: 1, borderColor: "#333", backgroundColor: "#141414" },
  numTxt: { color: "#CCC", fontSize: 10, fontWeight: "800" },
  bio: { color: "#CCC", fontSize: 13, lineHeight: 20, textAlign: "center", marginTop: 16, paddingHorizontal: 8 },
  infoBlock: { marginTop: 22, backgroundColor: "#0F0F0F", borderRadius: 10, padding: 12, borderWidth: 1, borderColor: "#1A1A1A" },
  infoLabel: { color: "#888", fontSize: 10, fontWeight: "900", letterSpacing: 2, marginBottom: 10 },
  infoRow: { flexDirection: "row", alignItems: "center", gap: 10, paddingVertical: 8, borderTopWidth: 1, borderTopColor: "#1A1A1A" },
  infoK: { color: "#999", fontSize: 12, width: 90 },
  infoV: { color: "#EEE", fontSize: 13, flex: 1, fontWeight: "600" },
  sectionLbl: { color: "#888", fontSize: 10, fontWeight: "900", letterSpacing: 2, marginTop: 22, marginBottom: 10 },
  galGrid: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  galImg: { borderRadius: 8, backgroundColor: "#111" },
  adRow: { flexDirection: "row", alignItems: "center", gap: 10, padding: 10, marginBottom: 8, backgroundColor: "#0F0F0F", borderRadius: 10, borderWidth: 1, borderColor: "#1A1A1A" },
  adImg: { width: 50, height: 50, borderRadius: 8 },
  adTitle: { color: "#EEE", fontSize: 13, fontWeight: "700" },
  adPrice: { color: "#D4AF37", fontSize: 14, fontWeight: "900", marginTop: 2 },
  cta: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, backgroundColor: "#D4AF37", padding: 15, borderRadius: 10, marginTop: 24 },
  ctaTxt: { color: "#000", fontSize: 12, fontWeight: "900", letterSpacing: 1.8 },
});
