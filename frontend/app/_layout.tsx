import { Stack } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { AuthProvider } from "../src/auth";
import { CartProvider } from "../src/cart";
import { GateProvider } from "../src/gate";

export default function RootLayout() {
  return (
    <GateProvider>
      <AuthProvider>
        <CartProvider>
          <StatusBar style="light" />
          <Stack
            screenOptions={{
              headerStyle: { backgroundColor: "#050505" },
              headerTintColor: "#F5F5F5",
              headerTitleStyle: { fontWeight: "700", letterSpacing: 0.5 },
              contentStyle: { backgroundColor: "#050505" },
            }}
          >
            <Stack.Screen name="index" options={{ headerShown: false }} />
            <Stack.Screen name="welcome" options={{ headerShown: false }} />
            <Stack.Screen name="terms" options={{ title: "Termo do Clube" }} />
            <Stack.Screen name="enter" options={{ title: "Acesso ao Clube" }} />
            <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
            <Stack.Screen name="product/[id]" options={{ title: "Produto" }} />
            <Stack.Screen name="chat" options={{ title: "Suporte FarmaClube" }} />
            <Stack.Screen name="admin/edit" options={{ title: "Gerenciar Produto", presentation: "modal" }} />
            <Stack.Screen name="staff/login" options={{ title: "Área da Equipe" }} />
            <Stack.Screen name="staff/inbox" options={{ title: "Caixa de Mensagens" }} />
            <Stack.Screen name="staff/chat/[member_id]" options={{ title: "Conversa" }} />
          </Stack>
        </CartProvider>
      </AuthProvider>
    </GateProvider>
  );
}
