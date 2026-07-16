import { useCallback, useState } from "react";
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity, Alert,
  Image, ActivityIndicator, Share, TextInput, Platform,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useRouter, useFocusEffect } from "expo-router";
import { Ionicons } from "../../src/icons";
import { useGate } from "../../src/gate";
import { useAuth } from "../../src/auth";
import { api, Product, formatBRL, setToken } from "../../src/api";
import { theme, TIERS } from "../../src/theme";
import { useTierAccent } from "../../src/use-tier-accent";
import { confirm, notify } from "../../src/alerts";

export default function Member() {
  const router = useRouter();
  const { member, clear, updateMember, refreshMember } = useGate();
  const { user: authUser, refreshUser } = useAuth();
  const accent = useTierAccent();
  // Revalida dados do usuário E do membro contra o backend ao abrir a tela,
  // assim mudanças feitas via admin (role, avatar, tier) aparecem sem logout.
  useFocusEffect(useCallback(() => {
    refreshUser();
    refreshMember();
  }, [refreshUser, refreshMember]));
  const isStaff = ["admin", "support", "financeiro"].includes(authUser?.role || "");
  // Master = role admin (acesso total, troca senha, credita PYX, gerencia tudo)
  const isMaster = authUser?.role === "admin";
  // Publisher Diamond — membro com permissão explícita (pode publicar anúncios)
  const canPublishAds = isStaff || !!member?.can_post_ads;
  const [adminProducts, setAdminProducts] = useState<Product[]>([]);
  const [myAds, setMyAds] = useState<any[]>([]);
  const [myPhotos, setMyPhotos] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const [totalMembers, setTotalMembers] = useState<number | null>(null);
  const [editingNick, setEditingNick] = useState(false);
  const [nickInput, setNickInput] = useState("");

  const load = useCallback(async () => {
    if (!member) return;
    setLoading(true);
    try {
      const [products, stats, ads, photos] = await Promise.all([
        api.listProducts({ member_id: member.member_id }).catch(() => []),
        api.memberStats().catch(() => ({ total_members: 0 })),
        api.myAds(member.member_id, true).catch(() => []),
        api.memberPhotos(member.member_id).catch(() => ({ photos: [] })),
      ]);
      setAdminProducts(products);
      setTotalMembers(stats.total_members);
      setMyAds(ads as any[]);
      setMyPhotos((photos as any).photos || []);
    } finally {
      setLoading(false);
    }
  }, [member]);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  // Excluir anúncio (hard delete via API) — confirm() funciona em web e mobile
  const handleDeleteAd = async (ad: any) => {
    if (!member) return;
    const ok = await confirm(
      "Excluir anúncio",
      `Remover "${ad.title}" PERMANENTEMENTE? Esta ação não pode ser desfeita.`,
    );
    if (!ok) return;
    try {
      await api.deleteAd(ad.ad_id, member.member_id);
      notify("Anúncio excluído", "Removido do marketplace.");
      await load();
    } catch (e: any) {
      notify("Erro", e?.message || "Falha ao excluir o anúncio.");
    }
  };

  // Reativar anúncio inativo
  const handleReactivateAd = async (ad: any) => {
    if (!member) return;
    try {
      await api.updateAd(ad.ad_id, { seller_id: member.member_id, active: true });
      await load();
    } catch (e: any) { Alert.alert("Erro", e.message); }
  };

  const lockClub = async () => {
    // Direct logout — more reliable across web and mobile
    try { await setToken(null); } catch {}
    try { await clear(); } catch {}
    router.replace("/login");
  };

  const shareGeneric = async () => {
    if (!member) return;
    try {
      await Share.share({
        message: `BLACKSCLUB — clube privado. Sua entrada só é possível através de autorização da administração. Código de referência: *${member.invite_code}*`,
      });
    } catch {}
  };
  const shareInvite = shareGeneric;

  const contactSupport = () => router.push("/chat");

  const saveNickname = async () => {
    if (!member) return;
    const nick = nickInput.trim();
    if (nick.length < 2 || nick.length > 24) {
      Alert.alert("Apelido inválido", "Use entre 2 e 24 caracteres.");
      return;
    }
    try {
      await api.updateNickname(member.member_id, nick);
      await updateMember({ nickname: nick });
      setEditingNick(false);
    } catch (e: any) {
      Alert.alert("Erro", e.message);
    }
  };

  const deleteProduct = (id: string, name: string) => {
    Alert.alert("Excluir produto", `Remover "${name}" do catálogo?`, [
      { text: "Cancelar", style: "cancel" },
      { text: "Excluir", style: "destructive", onPress: async () => { try { await api.deleteProduct(id); await load(); } catch (e: any) { Alert.alert("Erro", e.message); } } },
    ]);
  };

  const tier = member ? TIERS[member.tier] || TIERS.black : TIERS.black;

  return (
    <View style={{ flex: 1, backgroundColor: theme.colors.bg }} testID="member-screen">
      <ScrollView>
        <View style={styles.profileCard}>
          <TouchableOpacity
            style={[styles.avatar, { borderColor: tier.color }]}
            onPress={() => router.push("/community/edit-profile")}
            activeOpacity={0.8}
            testID="member-avatar-edit"
          >
            {member?.avatar_base64 ? (
              <Image source={{ uri: member.avatar_base64 }} style={styles.avatarImg} />
            ) : (
              <Text style={styles.avatarText}>{member?.name?.substring(0, 1).toUpperCase() || "M"}</Text>
            )}
            <View style={[styles.cameraBadge, { backgroundColor: accent.accent }]}>
              <Ionicons name="camera" size={12} color="#000" />
            </View>
          </TouchableOpacity>
          <View style={{ flex: 1 }}>
            <Text style={styles.name} numberOfLines={1}>{member?.name}</Text>
            <Text style={styles.email}>{member?.phone}</Text>
            <View style={styles.pillRow}>
              <View style={[styles.tierBadge, { borderColor: tier.color }]}>
                <Ionicons name={tier.icon as any} size={11} color={tier.color} />
                <Text style={[styles.tierText, { color: tier.color }]}>{tier.label.toUpperCase()}</Text>
              </View>
              {(member as any)?.member_number && (
                <View style={styles.numberPill}>
                  <Text style={styles.numberTxt}>#{(member as any).member_number}</Text>
                </View>
              )}
            </View>
          </View>
        </View>

        {/* Big, obvious EDIT PROFILE button */}
        <TouchableOpacity
          style={styles.editProfileCta}
          onPress={() => router.push("/community/edit-profile")}
          testID="member-edit-profile"
          activeOpacity={0.85}
        >
          <View style={styles.editProfileIcon}>
            <Ionicons name="person-circle" size={22} color={accent.accent} />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={[styles.editProfileTitle, { color: accent.accent }]}>EDITAR PERFIL PÚBLICO</Text>
            <Text style={styles.editProfileSub}>Foto, apelido, bio, cidade, galeria (10 fotos)</Text>
          </View>
          <Ionicons name="chevron-forward" size={18} color={accent.accent} />
        </TouchableOpacity>

        {/* === BOTÕES DE PUBLICAR ANÚNCIO — visível para staff e publishers Diamond ===
            3 botões separados (Diamond / Gold / Silver) deixam EXPLÍCITO que o
            publisher pode escolher onde publicar. Resolve confusão de UX onde
            o usuário não percebia o seletor de tier dentro do create-screen. */}
        {canPublishAds && (
          <View style={styles.publishAdsCard}>
            <View style={styles.publishAdsHeader}>
              <Ionicons name="megaphone" size={14} color="#7FD7E5" />
              <Text style={styles.publishAdsTitle}>PUBLICAR ANÚNCIO</Text>
              <Text style={styles.publishAdsHint}>Escolha o marketplace</Text>
            </View>
            <View style={styles.publishAdsRow}>
              <TouchableOpacity
                style={[styles.publishAdsBtn, { borderColor: "rgba(127,215,229,0.55)", backgroundColor: "rgba(127,215,229,0.08)" }]}
                onPress={() => router.push({ pathname: "/ads/create", params: { tier: "diamond" } } as any)}
                activeOpacity={0.85}
                testID="profile-publish-diamond"
              >
                <Ionicons name="diamond" size={18} color="#7FD7E5" />
                <Text style={[styles.publishAdsBtnTxt, { color: "#A8E4EF" }]}>DIAMANTE</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.publishAdsBtn, { borderColor: "rgba(212,175,55,0.55)", backgroundColor: "rgba(212,175,55,0.08)" }]}
                onPress={() => router.push({ pathname: "/ads/create", params: { tier: "gold" } } as any)}
                activeOpacity={0.85}
                testID="profile-publish-gold"
              >
                <Ionicons name="star" size={18} color="#D4AF37" />
                <Text style={[styles.publishAdsBtnTxt, { color: "#F4D47A" }]}>GOLD</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.publishAdsBtn, { borderColor: "rgba(184,184,184,0.55)", backgroundColor: "rgba(184,184,184,0.06)" }]}
                onPress={() => router.push({ pathname: "/ads/create", params: { tier: "silver" } } as any)}
                activeOpacity={0.85}
                testID="profile-publish-silver"
              >
                <Ionicons name="medal" size={18} color="#B8B8B8" />
                <Text style={[styles.publishAdsBtnTxt, { color: "#E8E8E8" }]}>SILVER</Text>
              </TouchableOpacity>
            </View>
            <Text style={styles.publishAdsFooter}>
              {isStaff
                ? "Você é staff oficial · pode publicar em qualquer marketplace"
                : "Você foi autorizado pelo time a publicar nos 3 marketplaces"}
            </Text>
          </View>
        )}

        {/* INVITE CODE — visible, shareable */}
        {member?.invite_code ? (
          <View style={styles.inviteCard}>
            <View style={styles.inviteHead}>
              <Ionicons name="key" size={14} color={accent.accentLight} />
              <Text style={[styles.inviteKicker, { color: accent.accentLight }]}>SEU CÓDIGO DE ACESSO</Text>
            </View>
            <Text style={[styles.inviteCode, { backgroundColor: accent.accent + "14", borderColor: accent.accent + "40" }]}>{member.invite_code}</Text>
            <Text style={styles.inviteHint}>
              Use este código para indicar outra pessoa ao clube. Cada indicação passa pela aprovação da administração.
            </Text>
            <TouchableOpacity style={[styles.inviteShare, { backgroundColor: accent.accent }]} onPress={shareInvite} testID="member-share-invite">
              <Ionicons name="share-social" size={14} color={theme.colors.bg} />
              <Text style={styles.inviteShareTxt}>COMPARTILHAR CONVITE</Text>
            </TouchableOpacity>
          </View>
        ) : null}

        {/* Nickname */}
        <View style={styles.nickCard}>
          <View style={{ flex: 1 }}>
            <Text style={styles.nickLabel}>APELIDO NA COMUNIDADE</Text>
            {editingNick ? (
              <TextInput
                style={styles.nickInput}
                value={nickInput}
                onChangeText={setNickInput}
                placeholder="Seu apelido público"
                placeholderTextColor={theme.colors.textMuted}
                autoFocus
                onSubmitEditing={saveNickname}
              />
            ) : (
              <Text style={styles.nickValue}>{member?.nickname || "— não definido"}</Text>
            )}
          </View>
          {editingNick ? (
            <TouchableOpacity onPress={saveNickname} style={styles.nickSave}><Ionicons name="checkmark" size={18} color={theme.colors.bg} /></TouchableOpacity>
          ) : (
            <TouchableOpacity onPress={() => { setNickInput(member?.nickname || ""); setEditingNick(true); }} style={styles.nickEdit}>
              <Ionicons name="create-outline" size={16} color={theme.colors.white} />
            </TouchableOpacity>
          )}
        </View>

        {/* === MINHAS FOTOS === Galeria publicada do membro */}
        <View style={styles.section}>
          <View style={styles.sectionHead}>
            <Text style={styles.sectionTitle}>MINHAS FOTOS</Text>
            <TouchableOpacity onPress={() => router.push("/community/edit-profile")} hitSlop={{ top: 8, right: 8, bottom: 8, left: 8 }}>
              <Text style={[styles.sectionAction, { color: accent.accent }]}>{myPhotos.length > 0 ? "EDITAR" : "ADICIONAR"}</Text>
            </TouchableOpacity>
          </View>
          {myPhotos.length === 0 ? (
            <TouchableOpacity
              style={[styles.photosEmpty, { borderColor: accent.accent + "40" }]}
              onPress={() => router.push("/community/edit-profile")}
              activeOpacity={0.85}
            >
              <Ionicons name="images-outline" size={26} color={accent.accent} />
              <Text style={styles.photosEmptyTxt}>
                Toque aqui para publicar suas fotos no perfil (até 10).
              </Text>
            </TouchableOpacity>
          ) : (
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.photosRow}>
              {myPhotos.map((p, i) => (
                <TouchableOpacity
                  key={i}
                  onPress={() => router.push(`/community/story/${member!.member_id}` as any)}
                  activeOpacity={0.88}
                >
                  <Image source={{ uri: p }} style={[styles.photoThumb, { borderColor: accent.accent + "55" }]} />
                </TouchableOpacity>
              ))}
            </ScrollView>
          )}
          <Text style={styles.photosHint}>{myPhotos.length}/10 fotos publicadas no seu perfil público</Text>
        </View>

        {/* === MEUS ANÚNCIOS === Staff + Membros com permissão de publicar */}
        {canPublishAds && (
          <View style={styles.section}>
            <View style={styles.sectionHead}>
              <Text style={styles.sectionTitle}>MEUS ANÚNCIOS</Text>
              <TouchableOpacity onPress={() => router.push("/ads/create")} hitSlop={{ top: 8, right: 8, bottom: 8, left: 8 }}>
                <Text style={[styles.sectionAction, { color: accent.accent }]}>+ NOVO</Text>
              </TouchableOpacity>
            </View>
            {myAds.length === 0 ? (
              <View style={styles.adsEmpty}>
                <Ionicons name="megaphone-outline" size={22} color="#666" />
                <Text style={styles.adsEmptyTxt}>Você ainda não publicou nenhum anúncio.</Text>
                <TouchableOpacity
                  style={[styles.adsCreateBtn, { backgroundColor: accent.accent }]}
                  onPress={() => router.push("/ads/create")}
                >
                  <Ionicons name="add" size={14} color="#000" />
                  <Text style={styles.adsCreateTxt}>PUBLICAR PRIMEIRO ANÚNCIO</Text>
                </TouchableOpacity>
              </View>
            ) : (
              <View style={{ gap: 10 }}>
                {myAds.map((ad) => {
                  const tierColor = ad.ad_tier === "gold" ? "#D4AF37" : ad.ad_tier === "silver" ? "#B8B8B8" : "#7FD7E5";
                  const isInactive = ad.active === false;
                  return (
                    <View key={ad.ad_id} style={[styles.adRow, !ad.active && { opacity: 0.55 }]}>
                      <TouchableOpacity
                        style={{ flexDirection: "row", flex: 1, alignItems: "center", gap: 10 }}
                        onPress={() => router.push({ pathname: "/ads/[id]", params: { id: ad.ad_id } })}
                        activeOpacity={0.85}
                      >
                        {ad.images?.[0] ? (
                          <Image source={{ uri: ad.images[0] }} style={styles.adThumb} />
                        ) : (
                          <View style={[styles.adThumb, { backgroundColor: "#0E0E0E", alignItems: "center", justifyContent: "center" }]}>
                            <Ionicons name="image-outline" size={18} color="#444" />
                          </View>
                        )}
                        <View style={{ flex: 1 }}>
                          <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
                            <View style={[styles.adTierPill, { borderColor: tierColor, backgroundColor: tierColor + "20" }]}>
                              <Text style={[styles.adTierTxt, { color: tierColor }]}>{(ad.ad_tier || "diamond").toUpperCase()}</Text>
                            </View>
                            {isInactive && (
                              <View style={styles.adInactivePill}>
                                <Text style={styles.adInactiveTxt}>INATIVO</Text>
                              </View>
                            )}
                          </View>
                          <Text style={styles.adRowTitle} numberOfLines={1}>{ad.title}</Text>
                          <Text style={styles.adRowPrice}>R$ {Number(ad.price_full).toFixed(2)} · estoque {ad.stock}</Text>
                        </View>
                      </TouchableOpacity>
                      <View style={{ flexDirection: "row", gap: 6 }}>
                        <TouchableOpacity
                          style={styles.adActionBtn}
                          onPress={() => router.push({ pathname: "/ads/create", params: { id: ad.ad_id } } as any)}
                          hitSlop={{ top: 8, right: 8, bottom: 8, left: 8 }}
                        >
                          <Ionicons name="create-outline" size={15} color="#EEE" />
                        </TouchableOpacity>
                        {isInactive ? (
                          <TouchableOpacity
                            style={[styles.adActionBtn, { backgroundColor: "#1E3A1E" }]}
                            onPress={() => handleReactivateAd(ad)}
                            hitSlop={{ top: 8, right: 8, bottom: 8, left: 8 }}
                          >
                            <Ionicons name="refresh" size={15} color="#4EE07F" />
                          </TouchableOpacity>
                        ) : (
                          <TouchableOpacity
                            style={[styles.adActionBtn, { backgroundColor: "#3A1E1E" }]}
                            onPress={() => handleDeleteAd(ad)}
                            hitSlop={{ top: 8, right: 8, bottom: 8, left: 8 }}
                          >
                            <Ionicons name="trash-outline" size={15} color="#FF6B6B" />
                          </TouchableOpacity>
                        )}
                      </View>
                    </View>
                  );
                })}
              </View>
            )}
          </View>
        )}

        <View style={styles.planCard} testID="member-plan-card">
          <View style={styles.planHeader}>
            <Text style={styles.planKicker}>SEU PLANO</Text>
            <Text style={styles.planFreeTag}>ATUALMENTE GRATUITO</Text>
          </View>
          {Object.entries(TIERS).map(([k, t]) => (
            <View key={k} style={[styles.planRow, member?.tier === k && { backgroundColor: "#1A1A1A" }]}>
              <Ionicons name={t.icon as any} size={14} color={t.color} />
              <Text style={[styles.planName, member?.tier === k && { color: theme.colors.white }]}>{t.label.toUpperCase()}</Text>
              {member?.tier === k && <Text style={styles.planCurrent}>ATUAL</Text>}
            </View>
          ))}
        </View>

        <TouchableOpacity style={styles.supportCta} onPress={contactSupport} testID="member-support-cta">
          <View style={styles.supportIcon}>
            <Ionicons name="chatbubbles" size={20} color={theme.colors.bg} />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={styles.supportTitle}>FALAR COM O SUPORTE</Text>
            <Text style={styles.supportSub}>Chat privado — resposta em minutos</Text>
          </View>
          <Ionicons name="chevron-forward" size={18} color={theme.colors.white} />
        </TouchableOpacity>

        <View style={styles.menu}>
          <MenuRow
            icon="person-circle-outline"
            label="Ver meu perfil público"
            onPress={() => member?.member_id && router.push(`/community/member/${member.member_id}` as any)}
            testID="member-view-my-public-profile"
          />
          <MenuRow icon="sparkles-outline" label="Solicitar orçamento" onPress={() => router.push("/quote")} testID="member-quote" />
          <MenuRow icon="share-social-outline" label="Compartilhar referência" onPress={shareGeneric} testID="member-share" />
        </View>

        {/* Botão SAIR DO CLUBE — vermelho, ação crítica, destacado */}
        <TouchableOpacity
          style={styles.logoutBtn}
          onPress={lockClub}
          activeOpacity={0.85}
          testID="logout-button"
        >
          <Ionicons name="log-out-outline" size={18} color="#FF6B6B" />
          <Text style={styles.logoutTxt}>SAIR DO CLUBE</Text>
        </TouchableOpacity>

        {totalMembers !== null && (
          <View style={styles.statRow}>
            <View style={styles.statBox}>
              <Text style={styles.statValue}>{totalMembers}</Text>
              <Text style={styles.statLabel}>MEMBROS NO CLUBE</Text>
            </View>
          </View>
        )}

        {isStaff && (
        <View style={styles.adminSection}>
          {/* ATALHOS RÁPIDOS DE STAFF */}
          <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
            <Text style={styles.sectionTitle}>ÁREA DA EQUIPE</Text>
            {isMaster && (
              <View style={styles.masterBadge}>
                <Ionicons name="shield-checkmark" size={10} color="#0A0A0A" />
                <Text style={styles.masterBadgeTxt}>MASTER · ACESSO TOTAL</Text>
              </View>
            )}
          </View>
          <View style={{ gap: 8, marginTop: 8 }}>
            <TouchableOpacity
              style={[styles.quickAction, { backgroundColor: "#2ECC71" }]}
              onPress={() => router.push("/admin/wallet" as any)}
              testID="profile-admin-wallet"
              activeOpacity={0.88}
            >
              <Ionicons name="wallet" size={18} color="#000" />
              <View style={{ flex: 1 }}>
                <Text style={[styles.quickActionTitle, { color: "#000" }]}>CREDITAR BLACK COINS</Text>
                <Text style={[styles.quickActionSub, { color: "#0A4D2E" }]}>Adicionar saldo a qualquer membro</Text>
              </View>
              <Ionicons name="chevron-forward" size={18} color="#000" />
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.quickAction}
              onPress={() => router.push("/admin/members" as any)}
              testID="profile-admin-members"
              activeOpacity={0.88}
            >
              <Ionicons name="person-add" size={18} color="#FFF" />
              <View style={{ flex: 1 }}>
                <Text style={styles.quickActionTitle}>CADASTRAR MEMBRO</Text>
                <Text style={styles.quickActionSub}>Pré-autorizar entrada no clube</Text>
              </View>
              <Ionicons name="chevron-forward" size={18} color="#888" />
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.quickAction}
              onPress={() => router.push("/staff/dashboard" as any)}
              testID="profile-admin-dashboard"
              activeOpacity={0.88}
            >
              <Ionicons name="stats-chart" size={18} color="#FFF" />
              <View style={{ flex: 1 }}>
                <Text style={styles.quickActionTitle}>PAINEL COMPLETO</Text>
                <Text style={styles.quickActionSub}>Dashboard, pedidos, chat staff</Text>
              </View>
              <Ionicons name="chevron-forward" size={18} color="#888" />
            </TouchableOpacity>
          </View>

          {/* Bloco "GERENCIAR CATÁLOGO" REMOVIDO a pedido do usuário — função
              descontinuada (não usamos mais o catálogo legacy /admin/edit).
              O marketplace P2P (/ads) é a fonte de verdade. */}
        </View>
        )}

        <View style={{ height: 40 }} />
      </ScrollView>
    </View>
  );
}

function MenuRow({ icon, label, onPress, testID }: { icon: any; label: string; onPress?: () => void; testID?: string }) {
  return (
    <TouchableOpacity style={styles.menuRow} onPress={onPress} testID={testID}>
      <Ionicons name={icon} size={18} color={theme.colors.silver} />
      <Text style={styles.menuLabel}>{label}</Text>
      <Ionicons name="chevron-forward" size={16} color={theme.colors.textMuted} />
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  profileCard: {
    flexDirection: "row", alignItems: "center", gap: theme.spacing.md,
    margin: theme.spacing.lg, padding: theme.spacing.lg,
    backgroundColor: theme.colors.surface,
    borderWidth: 1, borderColor: theme.colors.border, borderRadius: 12,
  },
  avatar: {
    width: 72, height: 72, borderRadius: 36,
    backgroundColor: theme.colors.surfaceElevated,
    borderWidth: 2, alignItems: "center", justifyContent: "center",
    overflow: "hidden", position: "relative",
  },
  avatarImg: { width: "100%", height: "100%", borderRadius: 36 },
  cameraBadge: {
    position: "absolute", bottom: -2, right: -2,
    width: 24, height: 24, borderRadius: 12,
    backgroundColor: "#D4AF37", alignItems: "center", justifyContent: "center",
    borderWidth: 2, borderColor: theme.colors.surface,
  },
  avatarText: { color: theme.colors.white, fontSize: 26, fontWeight: "900" },
  name: { color: theme.colors.white, fontSize: 17, fontWeight: "800" },
  email: { color: theme.colors.textMuted, fontSize: 12, marginTop: 2 },
  tierBadge: {
    flexDirection: "row", alignItems: "center", gap: 5,
    paddingHorizontal: 8, paddingVertical: 3,
    borderRadius: 20, borderWidth: 1,
  },
  tierText: { fontSize: 9, fontWeight: "900", letterSpacing: 1.5 },
  pillRow: { flexDirection: "row", alignItems: "center", gap: 6, marginTop: 8, flexWrap: "wrap" },
  numberPill: {
    paddingHorizontal: 8, paddingVertical: 3, borderRadius: 20,
    borderWidth: 1, borderColor: theme.colors.border, backgroundColor: theme.colors.surfaceElevated,
  },
  numberTxt: { color: theme.colors.text, fontSize: 10, fontWeight: "800", letterSpacing: 0.5 },

  editProfileCta: {
    flexDirection: "row", alignItems: "center", gap: 12,
    marginHorizontal: theme.spacing.lg, marginBottom: theme.spacing.md,
    paddingHorizontal: 16, paddingVertical: 14,
    backgroundColor: "#0F0F0F",
    borderWidth: 1.5, borderColor: "rgba(212,175,55,0.4)",
    borderRadius: 12,
  },
  editProfileIcon: {
    width: 40, height: 40, borderRadius: 20,
    backgroundColor: "rgba(212,175,55,0.12)",
    alignItems: "center", justifyContent: "center",
  },
  editProfileTitle: { color: "#D4AF37", fontSize: 12, fontWeight: "900", letterSpacing: 1.5 },
  editProfileSub: { color: theme.colors.textMuted, fontSize: 11, marginTop: 3 },

  // Card de publicar anúncio com 3 botões de tier (Diamond/Gold/Silver)
  publishAdsCard: {
    marginHorizontal: theme.spacing.lg, marginBottom: theme.spacing.md,
    paddingHorizontal: 14, paddingVertical: 12,
    backgroundColor: "#0B1216",
    borderWidth: 1, borderColor: "rgba(127,215,229,0.3)",
    borderRadius: 12,
  },
  publishAdsHeader: {
    flexDirection: "row", alignItems: "center", gap: 6,
    marginBottom: 10,
  },
  publishAdsTitle: { color: "#A8E4EF", fontSize: 11, fontWeight: "900", letterSpacing: 1.5 },
  publishAdsHint: { color: theme.colors.textMuted, fontSize: 10, fontWeight: "600", marginLeft: "auto" },
  publishAdsRow: { flexDirection: "row", gap: 8 },
  publishAdsBtn: {
    flex: 1, flexDirection: "column", alignItems: "center", justifyContent: "center",
    gap: 4, paddingVertical: 12, paddingHorizontal: 4,
    borderRadius: 10, borderWidth: 1.2,
  },
  publishAdsBtnTxt: { fontSize: 10.5, fontWeight: "900", letterSpacing: 1 },
  publishAdsFooter: {
    color: theme.colors.textMuted, fontSize: 10.5,
    marginTop: 10, fontStyle: "italic", textAlign: "center",
  },

  inviteCard: {
    marginHorizontal: theme.spacing.lg, marginBottom: theme.spacing.md,
    padding: 16, borderRadius: 12,
    backgroundColor: "#0F0F0F",
    borderWidth: 1, borderColor: "rgba(245,193,80,0.35)",
  },
  inviteHead: { flexDirection: "row", alignItems: "center", gap: 6, marginBottom: 8 },
  inviteKicker: { color: "#F5C150", fontSize: 10, fontWeight: "900", letterSpacing: 2 },
  inviteCode: {
    color: theme.colors.white, fontSize: 26, fontWeight: "900",
    letterSpacing: 6, textAlign: "center",
    paddingVertical: 10,
    backgroundColor: "rgba(245,193,80,0.08)",
    borderRadius: 8, borderWidth: 1, borderColor: "rgba(245,193,80,0.25)",
    marginVertical: 4,
  },
  inviteHint: { color: theme.colors.textMuted, fontSize: 11, lineHeight: 15, marginTop: 8 },
  inviteShare: {
    flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6,
    marginTop: 12, padding: 12, borderRadius: 8,
    backgroundColor: "#F5C150",
  },
  inviteShareTxt: { color: theme.colors.bg, fontSize: 11, fontWeight: "900", letterSpacing: 1.5 },
  nickCard: {
    flexDirection: "row", alignItems: "center", gap: 10,
    marginHorizontal: theme.spacing.lg, marginBottom: theme.spacing.md,
    padding: 14, backgroundColor: theme.colors.surface,
    borderWidth: 1, borderColor: theme.colors.border, borderRadius: 10,
  },
  nickLabel: { color: theme.colors.silver, fontSize: 9, fontWeight: "800", letterSpacing: 2 },
  nickValue: { color: theme.colors.white, fontSize: 15, fontWeight: "700", marginTop: 3 },
  nickInput: { color: theme.colors.white, fontSize: 15, fontWeight: "700", marginTop: 3, paddingVertical: 2 },
  nickEdit: { padding: 8 },
  nickSave: {
    width: 34, height: 34, borderRadius: 17, alignItems: "center", justifyContent: "center",
    backgroundColor: theme.colors.white,
  },

  // === Seções "MINHAS FOTOS" e "MEUS ANÚNCIOS" ===
  section: {
    marginHorizontal: theme.spacing.lg, marginBottom: theme.spacing.md,
    padding: 14, backgroundColor: theme.colors.surface,
    borderWidth: 1, borderColor: theme.colors.border, borderRadius: 10,
  },
  sectionHead: {
    flexDirection: "row", justifyContent: "space-between", alignItems: "center",
    marginBottom: 12,
  },
  sectionTitle: { color: theme.colors.silver, fontSize: 10, fontWeight: "900", letterSpacing: 2 },
  sectionAction: { fontSize: 10, fontWeight: "900", letterSpacing: 1.5 },

  // Galeria de fotos
  photosRow: { gap: 8, paddingVertical: 2 },
  photoThumb: {
    width: 78, height: 78, borderRadius: 8,
    backgroundColor: "#0E0E0E", borderWidth: 1,
  },
  photosEmpty: {
    flexDirection: "row", alignItems: "center", gap: 12,
    padding: 14, borderRadius: 10,
    borderWidth: 1, borderStyle: "dashed",
    backgroundColor: "#0A0A0A",
  },
  photosEmptyTxt: { color: "#999", fontSize: 12, flex: 1, lineHeight: 17 },
  photosHint: { color: theme.colors.textMuted, fontSize: 10.5, marginTop: 8 },

  // Lista de anúncios
  adsEmpty: {
    alignItems: "center", padding: 20, gap: 10,
    borderRadius: 10, borderWidth: 1, borderColor: "#1F1F1F",
    backgroundColor: "#0A0A0A",
  },
  adsEmptyTxt: { color: "#888", fontSize: 12, textAlign: "center" },
  adsCreateBtn: {
    flexDirection: "row", alignItems: "center", gap: 6,
    paddingHorizontal: 16, paddingVertical: 10, borderRadius: 8,
  },
  adsCreateTxt: { color: "#000", fontSize: 11, fontWeight: "900", letterSpacing: 1.2 },
  adRow: {
    flexDirection: "row", alignItems: "center", gap: 8,
    backgroundColor: "#0E0E0E",
    borderRadius: 10, padding: 10,
    borderWidth: 1, borderColor: "#1B1B1B",
  },
  adThumb: { width: 52, height: 52, borderRadius: 8 },
  adRowTitle: { color: "#EEE", fontSize: 13, fontWeight: "700", marginTop: 4 },
  adRowPrice: { color: "#999", fontSize: 11, marginTop: 2 },
  adTierPill: {
    paddingHorizontal: 6, paddingVertical: 2, borderRadius: 4,
    borderWidth: 0.8,
  },
  adTierTxt: { fontSize: 8.5, fontWeight: "900", letterSpacing: 1.2 },
  adInactivePill: {
    paddingHorizontal: 6, paddingVertical: 2, borderRadius: 4,
    backgroundColor: "#2A1A1A", borderWidth: 0.8, borderColor: "#5A2A2A",
  },
  adInactiveTxt: { color: "#FF8A8A", fontSize: 8.5, fontWeight: "900", letterSpacing: 1.2 },
  adActionBtn: {
    width: 32, height: 32, borderRadius: 8,
    alignItems: "center", justifyContent: "center",
    backgroundColor: "#1A1A1A",
    borderWidth: 1, borderColor: "#252525",
  },
  planCard: {
    marginHorizontal: theme.spacing.lg, marginBottom: theme.spacing.md,
    padding: 14, backgroundColor: theme.colors.surface,
    borderWidth: 1, borderColor: theme.colors.border, borderRadius: 10,
  },
  planHeader: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 10 },
  planKicker: { color: theme.colors.silver, fontSize: 10, fontWeight: "800", letterSpacing: 2 },
  planFreeTag: { color: theme.colors.textMuted, fontSize: 9, fontWeight: "700", letterSpacing: 1.5 },
  planRow: { flexDirection: "row", alignItems: "center", gap: 10, paddingVertical: 9, paddingHorizontal: 8, borderRadius: 6 },
  planName: { color: theme.colors.textMuted, fontSize: 12, fontWeight: "700", letterSpacing: 1, flex: 1 },
  planCurrent: { color: theme.colors.white, fontSize: 9, fontWeight: "900", letterSpacing: 1.5, backgroundColor: theme.colors.bg, paddingHorizontal: 8, paddingVertical: 3, borderRadius: 10 },
  supportCta: {
    flexDirection: "row", alignItems: "center", gap: 14,
    marginHorizontal: theme.spacing.lg, marginBottom: theme.spacing.md,
    paddingHorizontal: 16, paddingVertical: 16,
    backgroundColor: theme.colors.white, borderRadius: 10,
  },
  supportIcon: { width: 38, height: 38, borderRadius: 19, backgroundColor: "#000", alignItems: "center", justifyContent: "center" },
  supportTitle: { color: theme.colors.bg, fontSize: 13, fontWeight: "900", letterSpacing: 1 },
  supportSub: { color: "#333", fontSize: 11, marginTop: 2 },
  menu: { marginHorizontal: theme.spacing.lg, gap: 2 },
  logoutBtn: {
    flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 10,
    marginHorizontal: theme.spacing.lg, marginTop: 16, paddingVertical: 14,
    borderRadius: 12, backgroundColor: "rgba(255,107,107,0.08)",
    borderWidth: 1, borderColor: "rgba(255,107,107,0.35)",
  },
  logoutTxt: { color: "#FF6B6B", fontSize: 12.5, fontWeight: "900", letterSpacing: 2.5 },
  menuRow: {
    flexDirection: "row", alignItems: "center", gap: 14,
    paddingVertical: 14, paddingHorizontal: 14,
    backgroundColor: theme.colors.surface,
    borderWidth: 1, borderColor: theme.colors.border, borderRadius: 8,
  },
  menuLabel: { color: theme.colors.text, fontSize: 13, flex: 1, fontWeight: "600" },
  sectionTitle: { color: theme.colors.silver, fontSize: 11, fontWeight: "800", letterSpacing: 2 },
  statRow: { flexDirection: "row", gap: 10, paddingHorizontal: theme.spacing.lg, marginTop: theme.spacing.md, marginBottom: theme.spacing.md },
  statBox: {
    flex: 1, padding: theme.spacing.md, alignItems: "center",
    backgroundColor: theme.colors.surface, borderRadius: 10,
    borderWidth: 1, borderColor: theme.colors.border,
  },
  statValue: { color: theme.colors.white, fontSize: 28, fontWeight: "900" },
  statLabel: { color: theme.colors.silver, fontSize: 10, fontWeight: "800", letterSpacing: 1.5, marginTop: 4 },
  adminSection: { marginTop: theme.spacing.md, paddingHorizontal: theme.spacing.lg },
  // Badge MASTER (visível só para Guilherme com role=admin) — destaca acesso total
  masterBadge: {
    flexDirection: "row", alignItems: "center", gap: 4,
    paddingHorizontal: 8, paddingVertical: 3,
    backgroundColor: "#D4AF37", borderRadius: 6,
  },
  masterBadgeTxt: { color: "#0A0A0A", fontSize: 9.5, fontWeight: "900", letterSpacing: 1 },
  adminHeader: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: theme.spacing.md },

  // Atalhos rápidos da área de staff (botões grandes com ícone + título + subtítulo).
  quickAction: {
    flexDirection: "row", alignItems: "center", gap: 12,
    paddingHorizontal: 14, paddingVertical: 12,
    backgroundColor: "#111", borderRadius: 12,
    borderWidth: 1, borderColor: "rgba(255,255,255,0.06)",
  },
  quickActionTitle: { color: "#FFF", fontSize: 12.5, fontWeight: "900", letterSpacing: 1 },
  quickActionSub: { color: "#888", fontSize: 11, fontWeight: "500", marginTop: 2 },
  addBtn: { flexDirection: "row", alignItems: "center", gap: 4, backgroundColor: theme.colors.white, paddingHorizontal: 12, paddingVertical: 7, borderRadius: 6 },
  addBtnText: { color: theme.colors.bg, fontWeight: "900", fontSize: 11, letterSpacing: 1 },
  adminRow: { flexDirection: "row", alignItems: "center", gap: 10, padding: 10, backgroundColor: theme.colors.surface, borderWidth: 1, borderColor: theme.colors.border, borderRadius: 8 },
  adminThumb: { width: 48, height: 48, borderRadius: 6, backgroundColor: theme.colors.surfaceElevated },
  adminName: { color: theme.colors.text, fontSize: 13, fontWeight: "600" },
  adminMeta: { color: theme.colors.textMuted, fontSize: 11, marginTop: 2 },
  iconBtn: { padding: 8 },
});
