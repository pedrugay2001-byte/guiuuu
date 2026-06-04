import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  Image,
  TouchableOpacity,
  Dimensions,
  NativeSyntheticEvent,
  NativeScrollEvent,
  ActivityIndicator,
  Platform,
} from "react-native";
import { useRouter } from "expo-router";
import { api, HomeBanner } from "./api";
import { Ionicons } from "./icons";

const AUTO_ROTATE_MS = 10000;
const CARD_GAP = 12;

// Tag visual por categoria
const CATEGORY_META: Record<string, { label: string; color: string; icon: string }> = {
  novidade: { label: "NOVIDADE", color: "#4FD1C5", icon: "sparkles" },
  noticia: { label: "NOTÍCIA", color: "#5BA8F0", icon: "newspaper-outline" },
  promocao: { label: "PROMOÇÃO", color: "#E67A35", icon: "pricetag-outline" },
};

type Props = {
  // Permite passar altura customizada para o carrossel (default ~160px)
  height?: number;
};

export default function HomeBannerCarousel({ height = 160 }: Props) {
  const router = useRouter();
  const [banners, setBanners] = useState<HomeBanner[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeIndex, setActiveIndex] = useState(0);
  const [containerW, setContainerW] = useState<number>(Dimensions.get("window").width - 24);
  const listRef = useRef<FlatList<HomeBanner>>(null);
  const autoTimer = useRef<ReturnType<typeof setInterval> | null>(null);
  const userInteracted = useRef<boolean>(false);

  // Carrega banners ativos
  const load = useCallback(async () => {
    try {
      const data = await api.homeBanners();
      setBanners(Array.isArray(data) ? data : []);
    } catch {
      setBanners([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  // Auto-rotação a cada 10s — pausa por 30s se o usuário interagiu
  const scheduleAutoRotate = useCallback(() => {
    if (autoTimer.current) clearInterval(autoTimer.current);
    if (banners.length <= 1) return;
    autoTimer.current = setInterval(() => {
      setActiveIndex((prev) => {
        const next = (prev + 1) % banners.length;
        listRef.current?.scrollToIndex({ index: next, animated: true });
        return next;
      });
    }, AUTO_ROTATE_MS);
  }, [banners.length]);

  useEffect(() => {
    scheduleAutoRotate();
    return () => {
      if (autoTimer.current) clearInterval(autoTimer.current);
    };
  }, [scheduleAutoRotate]);

  // Quando o usuário arrasta manualmente — pausa por 30s e retoma
  const onMomentumScrollEnd = (e: NativeSyntheticEvent<NativeScrollEvent>) => {
    const x = e.nativeEvent.contentOffset.x;
    const idx = Math.round(x / containerW);
    setActiveIndex(Math.max(0, Math.min(idx, banners.length - 1)));
    if (userInteracted.current) {
      // Reinicia o auto-rotate depois de 30s de inatividade
      setTimeout(() => {
        userInteracted.current = false;
        scheduleAutoRotate();
      }, 30_000);
    }
  };

  const onTouchStart = () => {
    userInteracted.current = true;
    if (autoTimer.current) {
      clearInterval(autoTimer.current);
      autoTimer.current = null;
    }
  };

  const handleBannerPress = (item: HomeBanner) => {
    if (item.cta_route) {
      try {
        router.push(item.cta_route as any);
      } catch {
        // rota inválida — ignora silenciosamente
      }
    }
  };

  if (loading) {
    return (
      <View style={[s.wrap, { height }]}>
        <ActivityIndicator color="#666" />
      </View>
    );
  }

  if (!banners.length) {
    // Estado vazio elegante — informativo mas discreto
    return (
      <View style={[s.wrap, s.emptyCard, { height }]}>
        <Ionicons name="sparkles" size={20} color="#C89A3A" />
        <Text style={s.emptyTitle}>Nada por aqui ainda</Text>
        <Text style={s.emptySub}>Notícias, promoções e novidades aparecem aqui.</Text>
      </View>
    );
  }

  return (
    <View
      style={[s.wrap, { height }]}
      onLayout={(e) => setContainerW(e.nativeEvent.layout.width)}
    >
      <FlatList
        ref={listRef}
        data={banners}
        keyExtractor={(item) => item.banner_id}
        horizontal
        pagingEnabled
        snapToInterval={containerW}
        decelerationRate="fast"
        showsHorizontalScrollIndicator={false}
        onMomentumScrollEnd={onMomentumScrollEnd}
        onTouchStart={onTouchStart}
        getItemLayout={(_, index) => ({ length: containerW, offset: containerW * index, index })}
        renderItem={({ item }) => (
          <BannerCard
            item={item}
            width={containerW}
            height={height}
            onPress={() => handleBannerPress(item)}
          />
        )}
      />
      {/* Dots de paginação */}
      {banners.length > 1 && (
        <View style={s.dotsRow} pointerEvents="none">
          {banners.map((_, i) => (
            <View
              key={i}
              style={[
                s.dot,
                i === activeIndex && s.dotActive,
              ]}
            />
          ))}
        </View>
      )}
    </View>
  );
}

type BannerCardProps = {
  item: HomeBanner;
  width: number;
  height: number;
  onPress: () => void;
};

function BannerCard({ item, width, height, onPress }: BannerCardProps) {
  const meta = CATEGORY_META[(item.category || "novidade").toLowerCase()] || CATEGORY_META.novidade;
  // Resolve a URI da imagem em ordem de preferência:
  // 1. image_base64 → data URI (inline, sem CORS)
  // 2. image_url → URL absoluta (Unsplash, S3, etc.). Se vier relativa, prefixa
  //    com o EXPO_PUBLIC_BACKEND_URL para garantir absoluta na Web.
  let imgUri: string | null = null;
  if (item.image_base64) {
    imgUri = `data:image/jpeg;base64,${item.image_base64}`;
  } else if (item.image_url) {
    const raw = item.image_url.trim();
    if (raw.startsWith("http://") || raw.startsWith("https://") || raw.startsWith("data:")) {
      imgUri = raw;
    } else if (raw.startsWith("/")) {
      // Caminho relativo — prefixa com o backend para virar absoluto
      const backend = (process.env.EXPO_PUBLIC_BACKEND_URL || "").replace(/\/$/, "");
      imgUri = `${backend}${raw}`;
    } else {
      imgUri = raw;
    }
  }
  const hasCta = !!(item.cta_label && item.cta_route);
  const accent = item.accent_color || "#C89A3A";

  return (
    <TouchableOpacity
      activeOpacity={0.9}
      onPress={onPress}
      style={[s.card, { width: width - CARD_GAP * 2, height, marginHorizontal: CARD_GAP }]}
    >
      {/* Background image — usa <Image> em TODAS plataformas (Web inclui static build do Netlify).
          Antes usávamos backgroundImage CSS via View em Web, mas o StyleSheet serializer
          do react-native-web pode descartar esse estilo no bundle de produção. */}
      {imgUri ? (
        <Image
          source={{ uri: imgUri }}
          style={s.bgImg}
          resizeMode="cover"
        />
      ) : (
        <View style={[StyleSheet.absoluteFillObject, { backgroundColor: "#0A0A0A" }]} />
      )}
      {/* Overlay escuro para legibilidade */}
      <View style={s.overlay} />
      {/* Conteúdo */}
      <View style={s.content}>
        <View style={[s.catBadge, { borderColor: meta.color + "AA" }]}>
          <Ionicons name={meta.icon as any} size={11} color={meta.color} />
          <Text style={[s.catLabel, { color: meta.color }]}>{meta.label}</Text>
        </View>
        <Text style={s.title} numberOfLines={1}>{item.title}</Text>
        {!!item.subtitle && (
          <Text style={s.subtitle} numberOfLines={2}>{item.subtitle}</Text>
        )}
        {hasCta && (
          <View style={[s.ctaPill, { backgroundColor: accent }]}>
            <Text style={s.ctaTxt}>{item.cta_label}</Text>
            <Ionicons name="arrow-forward" size={12} color="#050505" />
          </View>
        )}
      </View>
    </TouchableOpacity>
  );
}

const s = StyleSheet.create({
  wrap: {
    width: "100%",
    marginTop: 14,
    justifyContent: "center",
  },
  emptyCard: {
    marginHorizontal: 16,
    backgroundColor: "#0A0A0A",
    borderWidth: 1,
    borderColor: "rgba(200,154,58,0.2)",
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
    padding: 16,
    gap: 6,
  },
  emptyTitle: { color: "#E0E8EF", fontSize: 13, fontWeight: "800", letterSpacing: 0.4 },
  emptySub: { color: "#888", fontSize: 11, textAlign: "center" },
  card: {
    borderRadius: 14,
    overflow: "hidden",
    backgroundColor: "#0A0A0A",
    borderWidth: 1,
    borderColor: "rgba(200,154,58,0.18)",
    position: "relative",
  },
  bgImg: { ...StyleSheet.absoluteFillObject, width: "100%", height: "100%" },
  overlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(0,0,0,0.45)",
  },
  content: {
    flex: 1,
    padding: 14,
    justifyContent: "space-between",
  },
  catBadge: {
    alignSelf: "flex-start",
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 4,
    borderWidth: 1,
    backgroundColor: "rgba(0,0,0,0.55)",
  },
  catLabel: { fontSize: 9, fontWeight: "900", letterSpacing: 1.2 },
  title: { color: "#FFF", fontSize: 16, fontWeight: "900", letterSpacing: 0.2, marginTop: 6 },
  subtitle: { color: "rgba(255,255,255,0.85)", fontSize: 11, fontWeight: "500", marginTop: 2, lineHeight: 15 },
  ctaPill: {
    alignSelf: "flex-start",
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 16,
    marginTop: 8,
  },
  ctaTxt: { color: "#050505", fontSize: 10, fontWeight: "900", letterSpacing: 0.8 },
  dotsRow: {
    position: "absolute",
    bottom: 8,
    left: 0,
    right: 0,
    flexDirection: "row",
    justifyContent: "center",
    gap: 5,
  },
  dot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: "rgba(255,255,255,0.35)",
  },
  dotActive: {
    width: 18,
    backgroundColor: "#FFF",
  },
});
