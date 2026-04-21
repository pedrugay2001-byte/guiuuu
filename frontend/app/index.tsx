import { useEffect } from "react";
import { View, ActivityIndicator } from "react-native";
import { useRouter } from "expo-router";
import { useGate } from "../src/gate";
import { theme } from "../src/theme";

export default function Index() {
  const router = useRouter();
  const { member } = useGate();

  useEffect(() => {
    if (member === undefined) return;
    if (member) router.replace("/(tabs)/home");
    else router.replace("/welcome");
  }, [member, router]);

  return (
    <View style={{ flex: 1, backgroundColor: theme.colors.bg, justifyContent: "center" }}>
      <ActivityIndicator color={theme.colors.white} />
    </View>
  );
}
