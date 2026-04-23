import React, { useState } from "react";
import {
  View, Text, StyleSheet, Modal, TouchableOpacity, Image, FlatList, Dimensions,
  StatusBar, Alert,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";

const { width: SCREEN_W, height: SCREEN_H } = Dimensions.get("window");

type Props = {
  visible: boolean;
  onClose: () => void;
  photos: string[];              // data URLs ou base64
  initialIndex?: number;
  onDelete?: (index: number) => Promise<void> | void;
};

export default function GalleryViewer({ visible, onClose, photos, initialIndex = 0, onDelete }: Props) {
  const [idx, setIdx] = useState(initialIndex);

  React.useEffect(() => { setIdx(initialIndex); }, [initialIndex, visible]);

  const confirmDelete = () => {
    if (!onDelete) return;
    Alert.alert("Excluir foto?", "Esta ação não pode ser desfeita.", [
      { text: "Cancelar" },
      { text: "Excluir", style: "destructive", onPress: async () => {
        await onDelete(idx);
        if (photos.length <= 1) onClose();
        else setIdx(i => Math.max(0, Math.min(i, photos.length - 2)));
      } },
    ]);
  };

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose} statusBarTranslucent>
      <StatusBar barStyle="light-content" backgroundColor="#000" />
      <View style={st.bg}>
        <View style={st.top}>
          <TouchableOpacity style={st.btn} onPress={onClose} hitSlop={10}>
            <Ionicons name="close" size={26} color="#FFF" />
          </TouchableOpacity>
          <Text style={st.count}>{idx + 1} / {photos.length}</Text>
          {onDelete ? (
            <TouchableOpacity style={st.btn} onPress={confirmDelete} hitSlop={10}>
              <Ionicons name="trash" size={22} color="#FF5B5B" />
            </TouchableOpacity>
          ) : <View style={{ width: 36 }} />}
        </View>

        <FlatList
          data={photos}
          horizontal pagingEnabled
          showsHorizontalScrollIndicator={false}
          initialScrollIndex={initialIndex}
          getItemLayout={(_, i) => ({ length: SCREEN_W, offset: SCREEN_W * i, index: i })}
          onMomentumScrollEnd={(e) => {
            const i = Math.round(e.nativeEvent.contentOffset.x / SCREEN_W);
            setIdx(i);
          }}
          keyExtractor={(_, i) => String(i)}
          renderItem={({ item }) => (
            <View style={{ width: SCREEN_W, height: SCREEN_H, alignItems: "center", justifyContent: "center" }}>
              <Image
                source={{ uri: item.startsWith("data:") ? item : `data:image/jpeg;base64,${item}` }}
                style={{ width: SCREEN_W, height: SCREEN_H * 0.8 }}
                resizeMode="contain"
              />
            </View>
          )}
        />
      </View>
    </Modal>
  );
}

const st = StyleSheet.create({
  bg: { flex: 1, backgroundColor: "#000" },
  top: { position: "absolute", top: 0, left: 0, right: 0, zIndex: 10,
    flexDirection: "row", alignItems: "center", justifyContent: "space-between",
    paddingHorizontal: 14, paddingTop: 50, paddingBottom: 14,
    backgroundColor: "rgba(0,0,0,0.6)" },
  btn: { width: 36, height: 36, alignItems: "center", justifyContent: "center" },
  count: { color: "#FFF", fontSize: 13, fontWeight: "700" },
});
