import React from "react";
import { View, Text, StyleSheet, TouchableOpacity, Platform } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";

type Props = {
  title: string;
  subtitle?: string;
  onBack?: () => void;
  right?: React.ReactNode;
  color?: string;
  transparent?: boolean;
};

/**
 * Header padrão premium para todas as telas aninhadas.
 * - Botão voltar sempre visível (a menos que onBack=null seja passado)
 * - Título centralizado em caixa alta discreta
 * - Slot direito opcional (ex: botão editar/menu)
 * - Respeita SafeArea
 */
export default function ScreenHeader({ title, subtitle, onBack, right, color = "#F5C150", transparent }: Props) {
  const router = useRouter();
  const handleBack = () => {
    if (onBack) onBack();
    else if (router.canGoBack()) router.back();
    else router.replace("/(tabs)/home" as any);
  };
  return (
    <SafeAreaView edges={["top"]} style={[st.safe, transparent && { backgroundColor: "transparent" }]}>
      <View style={[st.row, transparent && { borderBottomWidth: 0 }]}>
        <TouchableOpacity onPress={handleBack} style={st.btn} hitSlop={14}
          testID="screen-header-back">
          <Ionicons name="chevron-back" size={24} color="#FFF" />
        </TouchableOpacity>
        <View style={st.center}>
          <Text style={[st.title, { color }]} numberOfLines={1}>{title.toUpperCase()}</Text>
          {subtitle ? <Text style={st.sub} numberOfLines={1}>{subtitle}</Text> : null}
        </View>
        <View style={st.btn}>{right ?? null}</View>
      </View>
    </SafeAreaView>
  );
}

const st = StyleSheet.create({
  safe: { backgroundColor: "#050505" },
  row: { flexDirection: "row", alignItems: "center", justifyContent: "space-between",
    paddingHorizontal: 10, paddingVertical: Platform.OS === "ios" ? 8 : 10,
    borderBottomWidth: 1, borderBottomColor: "#111" },
  btn: { minWidth: 44, minHeight: 44, alignItems: "center", justifyContent: "center" },
  center: { flex: 1, alignItems: "center" },
  title: { fontSize: 12, fontWeight: "900", letterSpacing: 2.2 },
  sub: { color: "#888", fontSize: 10.5, fontWeight: "600", marginTop: 2 },
});
