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
              headerTitleStyle: { fontWeight: "800", letterSpacing: 1 },
              contentStyle: { backgroundColor: "#050505" },
            }}
          >
            <Stack.Screen name="index" options={{ headerShown: false }} />
            <Stack.Screen name="welcome" options={{ headerShown: false }} />
            <Stack.Screen name="terms" options={{ title: "Código de Conduta" }} />
            <Stack.Screen name="enter" options={{ title: "Acesso ao Clube" }} />
            <Stack.Screen name="login" options={{ title: "Entrar" }} />
            <Stack.Screen name="forgot" options={{ title: "Recuperar senha" }} />
            <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
            <Stack.Screen name="product/[id]" options={{ title: "Produto" }} />
            <Stack.Screen name="category/[id]" options={{ title: "Categoria" }} />
            <Stack.Screen name="ai/index" options={{ title: "BLACK AI" }} />
            <Stack.Screen name="ai/[specialist]" options={{ title: "" }} />
            <Stack.Screen name="chat" options={{ title: "Suporte BLACKSCLUB" }} />
            <Stack.Screen name="quote" options={{ title: "Chamados" }} />
            <Stack.Screen name="wallet" options={{ title: "Black Coins" }} />
            <Stack.Screen name="admin/edit" options={{ title: "Gerenciar Produto", presentation: "modal" }} />
            <Stack.Screen name="admin/members" options={{ title: "Membros autorizados" }} />
            <Stack.Screen name="staff/login" options={{ title: "Área da Equipe" }} />
            <Stack.Screen name="staff/choose" options={{ title: "" }} />
            <Stack.Screen name="community/member/[id]" options={{ title: "" }} />
            <Stack.Screen name="community/dm/[id]" options={{ title: "" }} />
            <Stack.Screen name="community/group/[id]" options={{ title: "" }} />
            <Stack.Screen name="community/edit-profile" options={{ title: "Editar perfil" }} />
            <Stack.Screen name="staff/dashboard" options={{ title: "Painel" }} />
            <Stack.Screen name="staff/inbox" options={{ title: "Caixa de Mensagens" }} />
            <Stack.Screen name="staff/chat/[member_id]" options={{ title: "Conversa" }} />
          </Stack>
        </CartProvider>
      </AuthProvider>
    </GateProvider>
  );
}
