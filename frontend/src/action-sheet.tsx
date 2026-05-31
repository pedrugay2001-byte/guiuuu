import React from "react";
import { View, Text, StyleSheet, Modal, TouchableOpacity, Pressable, Platform } from "react-native";
import { Ionicons } from "./icons";

export type SheetAction = {
  label: string;
  icon?: string;
  color?: string;          // texto (default branco)
  destructive?: boolean;   // vermelho
  onPress: () => void | Promise<void>;
};

type Props = {
  visible: boolean;
  title?: string;
  subtitle?: string;
  actions: SheetAction[];
  onClose: () => void;
};

/**
 * ActionSheet cross-platform (funciona em iOS, Android e Web).
 * Substitui Alert.alert quando precisamos de múltiplas opções.
 */
export default function ActionSheet({ visible, title, subtitle, actions, onClose }: Props) {
  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={onClose}
      statusBarTranslucent
    >
      <Pressable style={st.backdrop} onPress={onClose}>
        <Pressable style={st.sheet} onPress={(e) => e.stopPropagation()}>
          {title ? (
            <View style={st.head}>
              <Text style={st.title} numberOfLines={2}>{title}</Text>
              {subtitle ? <Text style={st.sub} numberOfLines={2}>{subtitle}</Text> : null}
            </View>
          ) : null}
          {actions.map((a, i) => {
            const txtColor = a.destructive ? "#FF5B5B" : (a.color || "#FFF");
            const iconColor = a.destructive ? "#FF5B5B" : (a.color || "#DDD");
            return (
              <TouchableOpacity
                key={i}
                style={[st.row, i === actions.length - 1 && st.rowLast]}
                activeOpacity={0.7}
                onPress={async () => {
                  try { await a.onPress(); } catch (e) { console.log("action failed", e); }
                  onClose();
                }}
                testID={`sheet-${a.label.toLowerCase().replace(/\s+/g, "-")}`}
              >
                {a.icon ? <Ionicons name={a.icon as any} size={20} color={iconColor} /> : null}
                <Text style={[st.rowTxt, { color: txtColor }, a.destructive && { fontWeight: "800" }]}>
                  {a.label}
                </Text>
              </TouchableOpacity>
            );
          })}
          <TouchableOpacity style={st.cancel} onPress={onClose} activeOpacity={0.7}>
            <Text style={st.cancelTxt}>Cancelar</Text>
          </TouchableOpacity>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const st = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: "rgba(0,0,0,0.7)", justifyContent: "flex-end" },
  sheet: {
    backgroundColor: "#0B0B0B",
    borderTopLeftRadius: 20, borderTopRightRadius: 20,
    borderTopWidth: 1, borderColor: "rgba(245,193,80,0.2)",
    paddingVertical: 8, paddingBottom: Platform.OS === "ios" ? 34 : 20,
  },
  head: { paddingHorizontal: 20, paddingVertical: 14, borderBottomWidth: 1, borderBottomColor: "#1A1A1A" },
  title: { color: "#FFF", fontSize: 15, fontWeight: "800" },
  sub: { color: "#888", fontSize: 12, marginTop: 4, fontWeight: "500" },
  row: { flexDirection: "row", alignItems: "center", gap: 14,
    paddingHorizontal: 20, paddingVertical: 15,
    borderBottomWidth: 1, borderBottomColor: "#151515" },
  rowLast: { borderBottomWidth: 0 },
  rowTxt: { fontSize: 14.5, fontWeight: "600", flex: 1 },
  cancel: { marginTop: 8, marginHorizontal: 14, paddingVertical: 14, borderRadius: 12,
    backgroundColor: "#141414", alignItems: "center" },
  cancelTxt: { color: "#AAA", fontSize: 13, fontWeight: "800", letterSpacing: 1 },
});
