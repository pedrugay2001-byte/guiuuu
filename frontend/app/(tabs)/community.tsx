import React, { useState, useEffect, useCallback } from "react";
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity, Image,
  FlatList, RefreshControl, ActivityIndicator, Alert,
} from "react-native";
import { useRouter, useFocusEffect } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { api, StoryGroup, Post, CommunityMember, Group } from "../../src/api";
import { useGate } from "../../src/gate";
import { TIERS } from "../../src/theme";
import { notify } from "../../src/alerts";
import CachedImage from "../../src/cached-image";
import ActionSheet from "../../src/action-sheet";

type Tab = "foryou" | "following" | "recent" | "workouts";

export default function Community() {
  const router = useRouter();
  const { member } = useGate();
  const [tab, setTab] = useState<Tab>("foryou");
  const [stories, setStories] = useState<StoryGroup[]>([]);
  const [posts, setPosts] = useState<Post[]>([]);
  const [members, setMembers] = useState<CommunityMember[]>([]);
  const [groups, setGroups] = useState<Group[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const [firstLoaded, setFirstLoaded] = useState(false);

  const load = useCallback(async () => {
    if (!member) return;
    try {
      const [ss, pp, mm, gg] = await Promise.all([
        api.listStories(),
        api.listPosts(),
        api.communityMembers(member.member_id),
        api.groupsList(member.member_id),
      ]);
      setStories(ss); setPosts(pp); setMembers(mm); setGroups(gg);
      setFirstLoaded(true);
    } finally { setLoading(false); setRefreshing(false); }
  }, [member]);

  useFocusEffect(useCallback(() => {
    if (!member) return;
    let alive = true;
    api.heartbeat(member.member_id).catch(() => {});
    const t = setInterval(() => { if (alive) api.heartbeat(member.member_id).catch(() => {}); }, 120_000);
    // Load only on first mount or after 30s; otherwise rely on pull-to-refresh
    if (!firstLoaded) load();
    return () => { alive = false; clearInterval(t); };
  }, [member, load, firstLoaded]));

  const myStories = stories.find(s => s.member_id === member?.member_id);
  const otherStories = stories.filter(s => s.member_id !== member?.member_id);
  // Ordem: se usuário já tem story, o próprio avatar dele aparece primeiro (clicável);
  //   senão, mostra o botão "+" para criar.
  const storiesData = myStories
    ? [{ type: "me-has", data: myStories } as any, ...otherStories.map(s => ({ type: "story", data: s } as any))]
    : [{ type: "me" } as any, ...otherStories.map(s => ({ type: "story", data: s } as any))];

  const filteredPosts = tab === "workouts" ? posts.filter(p => (p.tags || []).some(t => t.toLowerCase().includes("treino") || t.toLowerCase().includes("workout"))) : posts;

  if (loading) return <View style={{ flex: 1, backgroundColor: "#050505", justifyContent: "center" }}><ActivityIndicator color="#FFF" /></View>;

  return (
    <View style={{ flex: 1, backgroundColor: "#050505" }}>
      {/* Header with actions */}
      <View style={styles.header}>
        <Text style={styles.headerTitle}>Comunidade</Text>
        <View style={styles.headerActions}>
          <TouchableOpacity style={styles.hBtn} onPress={() => router.push("/community/descobrir")} testID="go-discover">
            <Ionicons name="compass" size={20} color="#EEE" />
          </TouchableOpacity>
          <TouchableOpacity style={styles.hBtn} onPress={() => router.push("/community/messages")} testID="go-messages">
            <Ionicons name="chatbubbles" size={20} color="#EEE" />
          </TouchableOpacity>
        </View>
      </View>

      <ScrollView refreshControl={<RefreshControl tintColor="#FFF" refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(); }} />} contentContainerStyle={{ paddingBottom: 40 }}>
        {/* Stories strip */}
        <View style={styles.storiesWrap}>
          <FlatList
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={{ paddingHorizontal: 14, gap: 12 }}
            data={storiesData}
            keyExtractor={(_, i) => String(i)}
            renderItem={({ item }) => {
              if (item.type === "me") {
                return (
                  <TouchableOpacity style={styles.storyItem} onPress={() => router.push("/community/create-story")} testID="create-story">
                    <View style={[styles.storyRing, { borderColor: "#333", borderStyle: "dashed" }]}>
                      <View style={styles.myStoryAvatar}>
                        <Ionicons name="add" size={24} color="#D4AF37" />
                      </View>
                    </View>
                    <Text style={styles.storyName}>Seu story</Text>
                  </TouchableOpacity>
                );
              }
              if (item.type === "me-has") {
                const s: StoryGroup = item.data;
                const tier = TIERS[s.tier] || TIERS.silver;
                return (
                  <TouchableOpacity
                    style={styles.storyItem}
                    onPress={() => router.push(`/community/story/${s.member_id}`)}
                    testID="my-story-view"
                  >
                    <View style={[styles.storyRing, { borderColor: tier.color }]}>
                      {s.avatar_base64 ? (
                        <Image source={{ uri: s.avatar_base64 }} style={styles.storyAvatar} resizeMode="cover" />
                      ) : (
                        <View style={[styles.storyAvatar, { backgroundColor: "#2A2A2A", alignItems: "center", justifyContent: "center" }]}>
                          <Text style={{ color: "#EEE", fontWeight: "800" }}>{(s.nickname || "E").charAt(0).toUpperCase()}</Text>
                        </View>
                      )}
                      {/* Botão "+" sobreposto para adicionar novo story */}
                      <TouchableOpacity
                        style={styles.myStoryAddBadge}
                        onPress={() => router.push("/community/create-story")}
                        hitSlop={{ top: 6, right: 6, bottom: 6, left: 6 }}
                        testID="my-story-add-new"
                      >
                        <Ionicons name="add" size={14} color="#000" />
                      </TouchableOpacity>
                    </View>
                    <Text style={styles.storyName}>Seu story</Text>
                  </TouchableOpacity>
                );
              }
              const s: StoryGroup = item.data;
              const tier = TIERS[s.tier] || TIERS.silver;
              return (
                <TouchableOpacity style={styles.storyItem} onPress={() => router.push(`/community/story/${s.member_id}`)}>
                  <View style={[styles.storyRing, { borderColor: tier.color }]}>
                    {s.avatar_base64 ? (
                      <Image source={{ uri: s.avatar_base64 }} style={styles.storyAvatar} resizeMode="cover" />
                    ) : (
                      <View style={[styles.storyAvatar, { backgroundColor: "#2A2A2A", alignItems: "center", justifyContent: "center" }]}>
                        <Text style={{ color: "#EEE", fontWeight: "800" }}>{s.nickname.charAt(0).toUpperCase()}</Text>
                      </View>
                    )}
                  </View>
                  <Text style={styles.storyName} numberOfLines={1}>{s.nickname}</Text>
                </TouchableOpacity>
              );
            }}
          />
        </View>

        {/* Filter tabs */}
        {/* Shortcuts row — Amigos + Mensagens (cards premium) */}
        <View style={styles.shortcutsRow}>
          <TouchableOpacity
            style={styles.shortcut}
            onPress={() => router.push("/community/descobrir")}
            testID="shortcut-friends"
            activeOpacity={0.85}
          >
            <View style={[styles.shortcutIcon, { backgroundColor: "rgba(197,209,218,0.12)", borderColor: "rgba(197,209,218,0.35)" }]}>
              <Ionicons name="people" size={18} color="#EAF1F6" />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.shortcutTitle}>Amigos</Text>
              <Text style={styles.shortcutSub}>Descobrir membros</Text>
            </View>
            <Ionicons name="chevron-forward" size={16} color="#555" />
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.shortcut}
            onPress={() => router.push("/community/messages")}
            testID="shortcut-dms"
            activeOpacity={0.85}
          >
            <View style={[styles.shortcutIcon, { backgroundColor: "rgba(212,175,55,0.12)", borderColor: "rgba(212,175,55,0.35)" }]}>
              <Ionicons name="chatbubbles" size={18} color="#F5C150" />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.shortcutTitle}>Mensagens</Text>
              <Text style={styles.shortcutSub}>DMs diretas</Text>
            </View>
            <Ionicons name="chevron-forward" size={16} color="#555" />
          </TouchableOpacity>
        </View>

        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.filters}>
          <FilterChip label="Para você" active={tab === "foryou"} onPress={() => setTab("foryou")} />
          <FilterChip label="Seguindo" active={tab === "following"} onPress={() => setTab("following")} />
          <FilterChip label="Recentes" active={tab === "recent"} onPress={() => setTab("recent")} />
          <FilterChip label="Treinos" active={tab === "workouts"} onPress={() => setTab("workouts")} />
        </ScrollView>

        {/* Create post shortcut */}
        <TouchableOpacity style={styles.createPost} onPress={() => router.push("/community/create-post")} testID="create-post">
          <View style={styles.cpAvatar}>
            {member?.nickname ? <Text style={styles.cpInitial}>{member.nickname.charAt(0).toUpperCase()}</Text> : <Ionicons name="person" size={18} color="#EEE" />}
          </View>
          <Text style={styles.cpHint}>Compartilhe com a comunidade...</Text>
          <Ionicons name="image" size={18} color="#D4AF37" />
        </TouchableOpacity>

        {/* Feed posts */}
        {filteredPosts.length === 0 ? (
          <View style={styles.emptyFeed}>
            <Ionicons name="chatbubbles-outline" size={40} color="#444" />
            <Text style={styles.emptyFeedTxt}>Sem publicações por aqui.</Text>
            <Text style={styles.emptyFeedHint}>Seja o primeiro a postar!</Text>
          </View>
        ) : filteredPosts.map((p) => (
          <PostCard
            key={p.post_id}
            post={p}
            onAuthor={() => router.push(`/community/member/${p.member_id}`)}
            currentMemberId={member?.member_id || ""}
            onDelete={async () => {
              try {
                await api.postDelete(p.post_id, member?.member_id || "");
                setPosts(prev => prev.filter(x => x.post_id !== p.post_id));
                notify("Post excluído");
              } catch (e: any) { notify("Erro", e?.message || "Falha ao excluir"); }
            }}
          />
        ))}

        {/* Groups teaser */}
        <Text style={styles.sectionTitle}>GRUPOS EM DESTAQUE</Text>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ paddingHorizontal: 14, gap: 10, paddingVertical: 6 }}>
          {groups.slice(0, 8).map((g) => {
            const locked = !!(g as any).locked;
            const requiredTier = (g as any).required_tier as string | undefined;
            return (
              <TouchableOpacity
                key={g.group_id}
                style={[styles.groupChip, { borderColor: g.color + "66" }, locked && styles.groupChipLocked]}
                onPress={() => {
                  if (locked && requiredTier) {
                    Alert.alert(
                      "Grupo exclusivo",
                      `Este grupo é reservado para membros do tier ${requiredTier.toUpperCase()}. Evolua seu nível para participar.`,
                    );
                    return;
                  }
                  router.push(`/community/group/${g.group_id}`);
                }}
                testID={`group-${g.group_id}`}
              >
                <View style={[styles.groupIc, { backgroundColor: g.color + "22" }]}>
                  <Ionicons name={g.icon as any} size={16} color={g.color} />
                </View>
                <View style={{ flex: 1 }}>
                  <View style={{ flexDirection: "row", alignItems: "center", gap: 4 }}>
                    <Text style={styles.groupName} numberOfLines={1}>{g.name}</Text>
                    {locked && <Ionicons name="lock-closed" size={10} color="#999" />}
                  </View>
                  <Text style={styles.groupMembers}>
                    {locked && requiredTier
                      ? `Só ${requiredTier.toUpperCase()} · ${g.members_count}`
                      : `${g.members_count} membros`}
                  </Text>
                </View>
              </TouchableOpacity>
            );
          })}
          <TouchableOpacity style={styles.createGroupChip} onPress={() => router.push("/community/create-group")} testID="create-group">
            <Ionicons name="add" size={22} color="#D4AF37" />
            <Text style={styles.createGroupTxt}>Novo grupo</Text>
          </TouchableOpacity>
        </ScrollView>
      </ScrollView>
    </View>
  );
}

function FilterChip({ label, active, onPress }: any) {
  return (
    <TouchableOpacity style={[styles.chip, active && styles.chipActive]} onPress={onPress}>
      <Text style={[styles.chipTxt, active && styles.chipTxtActive]}>{label}</Text>
    </TouchableOpacity>
  );
}

function PostCardInner({ post, onAuthor, currentMemberId, onDelete }: {
  post: Post; onAuthor: () => void; currentMemberId: string; onDelete: () => Promise<void> | void;
}) {
  const tier = TIERS[post.author_tier || "silver"];
  const timeAgo = (() => {
    const m = Math.floor((Date.now() - new Date(post.created_at).getTime()) / 60000);
    if (m < 1) return "agora"; if (m < 60) return `${m}min`; const h = Math.floor(m / 60); if (h < 24) return `${h}h`; return `${Math.floor(h / 24)}d`;
  })();
  const [reactions, setReactions] = useState(post.reactions);
  const react = async (kind: "fire" | "heart" | "muscle") => {
    setReactions({ ...reactions, [kind]: reactions[kind] + 1 });
    try { await api.reactPost(post.post_id, kind); } catch {}
  };
  const isMine = post.member_id === currentMemberId;
  const [menuOpen, setMenuOpen] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const openMenu = () => {
    if (!isMine) return;
    setMenuOpen(true);
  };
  const total = reactions.fire + reactions.heart + reactions.muscle;
  return (
    <View style={styles.post}>
      <TouchableOpacity style={styles.postHeader} onPress={onAuthor}>
        <View style={[styles.postAvRing, { borderColor: tier.color }]}>
          {post.author_avatar ? <Image source={{ uri: post.author_avatar }} style={styles.postAv} resizeMode="cover" /> : (
            <View style={[styles.postAv, { backgroundColor: "#2A2A2A", alignItems: "center", justifyContent: "center" }]}>
              <Text style={{ color: "#EEE", fontWeight: "800" }}>{(post.author_nickname || "?").charAt(0).toUpperCase()}</Text>
            </View>
          )}
        </View>
        <View style={{ flex: 1 }}>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 4 }}>
            <Text style={styles.postAuthor}>{post.author_nickname}</Text>
            <Ionicons name={tier.icon as any} size={11} color={tier.color} />
          </View>
          <Text style={styles.postMeta}>{timeAgo} · {post.author_city || "BLACKSCLUB"}</Text>
        </View>
        <TouchableOpacity onPress={openMenu} hitSlop={10} disabled={!isMine}>
          <Ionicons name="ellipsis-horizontal" size={18} color={isMine ? "#CCC" : "#666"} />
        </TouchableOpacity>
      </TouchableOpacity>
      {post.text ? <Text style={styles.postText}>{post.text}</Text> : null}
      {post.image_base64 ? <Image source={{ uri: post.image_base64 }} style={styles.postImg} resizeMode="cover" /> : null}
      <View style={styles.postActions}>
        <TouchableOpacity style={styles.reactBtn} onPress={() => react("fire")} testID={`react-fire-${post.post_id}`}>
          <Text style={styles.reactEmo}>🔥</Text><Text style={styles.reactCt}>{reactions.fire}</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.reactBtn} onPress={() => react("heart")}>
          <Text style={styles.reactEmo}>❤️</Text><Text style={styles.reactCt}>{reactions.heart}</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.reactBtn} onPress={() => react("muscle")}>
          <Text style={styles.reactEmo}>💪</Text><Text style={styles.reactCt}>{reactions.muscle}</Text>
        </TouchableOpacity>
        <View style={{ flex: 1 }} />
        <Text style={styles.totalReacts}>{total} reações</Text>
      </View>

      {/* ActionSheet - menu do post */}
      <ActionSheet
        visible={menuOpen}
        title="Opções do post"
        onClose={() => setMenuOpen(false)}
        actions={[
          { label: "Excluir post", icon: "trash-outline", destructive: true,
            onPress: () => { setMenuOpen(false); setTimeout(() => setConfirmOpen(true), 150); } },
        ]}
      />
      {/* ActionSheet - confirmar exclusão */}
      <ActionSheet
        visible={confirmOpen}
        title="Excluir post?"
        subtitle="Esta ação não pode ser desfeita."
        onClose={() => setConfirmOpen(false)}
        actions={[
          { label: "Sim, excluir", icon: "trash", destructive: true,
            onPress: async () => { await onDelete(); } },
        ]}
      />
    </View>
  );
}

// React.memo para evitar re-renders desnecessários quando outros posts/estados mudam.
// Compara propriedades estáveis (post_id, reactions, tier, currentMemberId).
const PostCard = React.memo(PostCardInner, (prev, next) => (
  prev.post.post_id === next.post.post_id &&
  prev.post.text === next.post.text &&
  prev.post.image_base64 === next.post.image_base64 &&
  prev.post.reactions.fire === next.post.reactions.fire &&
  prev.post.reactions.heart === next.post.reactions.heart &&
  prev.post.reactions.muscle === next.post.reactions.muscle &&
  prev.currentMemberId === next.currentMemberId
));

const styles = StyleSheet.create({
  header: { flexDirection: "row", alignItems: "center", paddingHorizontal: 18, paddingTop: 10, paddingBottom: 8 },
  headerTitle: { flex: 1, color: "#FFF", fontSize: 24, fontWeight: "900" },
  headerActions: { flexDirection: "row", gap: 10 },
  hBtn: { width: 38, height: 38, borderRadius: 19, backgroundColor: "#141414", borderWidth: 1, borderColor: "#1F1F1F", alignItems: "center", justifyContent: "center" },

  storiesWrap: { paddingVertical: 10 },
  storyItem: { alignItems: "center", width: 72 },
  storyRing: { width: 64, height: 64, borderRadius: 32, borderWidth: 2, padding: 2, alignItems: "center", justifyContent: "center" },
  storyAvatar: { width: 56, height: 56, borderRadius: 28 },
  myStoryAvatar: { width: 56, height: 56, borderRadius: 28, backgroundColor: "#141414", alignItems: "center", justifyContent: "center", borderWidth: 1, borderColor: "#333" },
  storyName: { color: "#CCC", fontSize: 11, marginTop: 6, fontWeight: "700" },
  myStoryAddBadge: {
    position: "absolute", bottom: -2, right: -2,
    width: 20, height: 20, borderRadius: 10,
    backgroundColor: "#D4AF37",
    alignItems: "center", justifyContent: "center",
    borderWidth: 2, borderColor: "#050505",
  },

  filters: { paddingHorizontal: 14, paddingVertical: 8, gap: 8 },

  // Shortcuts premium (Amigos + DMs)
  shortcutsRow: { flexDirection: "row", gap: 8, paddingHorizontal: 14, paddingTop: 6, paddingBottom: 4 },
  shortcut: {
    flex: 1, flexDirection: "row", alignItems: "center", gap: 10,
    paddingHorizontal: 10, paddingVertical: 10,
    borderRadius: 12, backgroundColor: "#0E0E0E",
    borderWidth: 1, borderColor: "#1B1B1B",
  },
  shortcutIcon: {
    width: 34, height: 34, borderRadius: 17,
    alignItems: "center", justifyContent: "center",
    borderWidth: 1,
  },
  shortcutTitle: { color: "#FFF", fontSize: 12, fontWeight: "900", letterSpacing: 0.4 },
  shortcutSub: { color: "#777", fontSize: 10, fontWeight: "700", marginTop: 1 },
  chip: { paddingHorizontal: 14, paddingVertical: 7, borderRadius: 20, borderWidth: 1, borderColor: "#222", backgroundColor: "#0F0F0F" },
  chipActive: { backgroundColor: "#D4AF37", borderColor: "#D4AF37" },
  chipTxt: { color: "#CCC", fontSize: 12, fontWeight: "800" },
  chipTxtActive: { color: "#000" },

  createPost: { flexDirection: "row", alignItems: "center", gap: 12, marginHorizontal: 14, marginTop: 8, marginBottom: 10, padding: 12, backgroundColor: "#0F0F0F", borderRadius: 14, borderWidth: 1, borderColor: "#1A1A1A" },
  cpAvatar: { width: 34, height: 34, borderRadius: 17, backgroundColor: "#222", alignItems: "center", justifyContent: "center" },
  cpInitial: { color: "#EEE", fontSize: 14, fontWeight: "800" },
  cpHint: { flex: 1, color: "#888", fontSize: 13 },

  emptyFeed: { alignItems: "center", paddingVertical: 40, gap: 8 },
  emptyFeedTxt: { color: "#888", fontSize: 14, fontWeight: "800" },
  emptyFeedHint: { color: "#D4AF37", fontSize: 11 },

  post: { marginHorizontal: 12, marginBottom: 10, padding: 14, backgroundColor: "#0E0E0E", borderRadius: 14, borderWidth: 1, borderColor: "#1A1A1A" },
  postHeader: { flexDirection: "row", alignItems: "center", gap: 10 },
  postAvRing: { borderWidth: 2, borderRadius: 22, padding: 1 },
  postAv: { width: 36, height: 36, borderRadius: 18 },
  postAuthor: { color: "#EEE", fontSize: 13, fontWeight: "800" },
  postMeta: { color: "#888", fontSize: 10, marginTop: 1 },
  postText: { color: "#E5E5E5", fontSize: 14, lineHeight: 20, marginTop: 10 },
  postImg: { width: "100%", aspectRatio: 1.3, borderRadius: 10, marginTop: 10, backgroundColor: "#1A1A1A" },
  postActions: { flexDirection: "row", alignItems: "center", gap: 8, marginTop: 12, paddingTop: 10, borderTopWidth: 1, borderTopColor: "#1A1A1A" },
  reactBtn: { flexDirection: "row", alignItems: "center", gap: 5, paddingHorizontal: 10, paddingVertical: 5, borderRadius: 20, backgroundColor: "#1A1A1A" },
  reactEmo: { fontSize: 13 },
  reactCt: { color: "#CCC", fontSize: 12, fontWeight: "700" },
  totalReacts: { color: "#888", fontSize: 11 },

  sectionTitle: { color: "#888", fontSize: 10, fontWeight: "900", letterSpacing: 2.5, paddingHorizontal: 16, marginTop: 20, marginBottom: 10 },
  groupChip: { flexDirection: "row", alignItems: "center", gap: 10, width: 220, padding: 12, borderRadius: 12, borderWidth: 1, backgroundColor: "#0F0F0F" },
  groupChipLocked: { opacity: 0.55 },
  groupIc: { width: 36, height: 36, borderRadius: 18, alignItems: "center", justifyContent: "center" },
  groupName: { color: "#EEE", fontSize: 13, fontWeight: "800" },
  groupMembers: { color: "#888", fontSize: 10, marginTop: 2 },
  createGroupChip: { flexDirection: "row", alignItems: "center", gap: 8, paddingHorizontal: 16, borderRadius: 12, borderWidth: 1, borderColor: "#D4AF37", borderStyle: "dashed" },
  createGroupTxt: { color: "#D4AF37", fontSize: 12, fontWeight: "800", letterSpacing: 1 },
});
