import AsyncStorage from "@react-native-async-storage/async-storage";
import type { TierId } from "./theme";

const BASE_URL = process.env.EXPO_PUBLIC_BACKEND_URL as string;

export type User = {
  user_id: string; email: string; name: string;
  role: "admin" | "member" | "support"; created_at: string;
};

export type Product = {
  product_id: string; name: string; category: string; description: string;
  price: number; member_price: number; image_url: string;
  stock: number; featured: boolean; created_at: string;
};

export type Category = { id: string; name: string; icon: string };

const TOKEN_KEY = "blacksclub_token";

export async function getToken(): Promise<string | null> {
  return AsyncStorage.getItem(TOKEN_KEY);
}
export async function setToken(token: string | null) {
  if (token) await AsyncStorage.setItem(TOKEN_KEY, token);
  else await AsyncStorage.removeItem(TOKEN_KEY);
}

async function request<T>(path: string, options: RequestInit = {}): Promise<T> {
  const token = await getToken();
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    ...(options.headers as Record<string, string> | undefined),
  };
  if (token) headers["Authorization"] = `Bearer ${token}`;
  const res = await fetch(`${BASE_URL}/api${path}`, { ...options, headers });
  if (!res.ok) {
    let detail = "Erro na requisição";
    try {
      const data = await res.json();
      if (typeof data.detail === "string") detail = data.detail;
      else if (Array.isArray(data.detail))
        detail = data.detail.map((e: any) => e.msg || JSON.stringify(e)).join(" ");
    } catch {}
    throw new Error(detail);
  }
  return res.json();
}

export type ChatMessage = {
  message_id: string; thread_id: string;
  sender: "member" | "support"; sender_name: string;
  text: string; created_at: string;
  order_id?: string; quote_id?: string;
  attachments?: string[];
};

export type ChatThread = {
  member_id: string; member_name: string; member_phone: string;
  tier: TierId; last_message: string;
  last_sender: "member" | "support"; last_at: string; unread: number;
};

export type MemberEnterPayload = {
  name: string; phone: string; email: string; password: string;
  neighborhood: string; city: string; state: string; code: string;
};

export type MemberData = {
  member_id: string; name: string; email?: string;
  phone?: string; invite_code: string; parent_code: string;
  parent_name: string | null; tier: TierId; nickname?: string | null;
  neighborhood?: string; city?: string; state?: string;
  total_members?: number; created_at: string;
};

export type AuthorizedEntry = {
  auth_id: string; name: string; phone: string; code: string;
  tier: TierId; parent_name?: string | null; created_at: string;
};

export const api = {
  login: (email: string, password: string) =>
    request<{ user: User; token: string }>("/auth/login", {
      method: "POST", body: JSON.stringify({ email, password }),
    }),
  me: () => request<User>("/auth/me"),
  memberEnter: (body: MemberEnterPayload) =>
    request<MemberData>("/members/enter", { method: "POST", body: JSON.stringify(body) }),
  memberLogin: (email: string, password: string) =>
    request<MemberData>("/members/login", {
      method: "POST", body: JSON.stringify({ email, password }),
    }),
  memberForgot: (email: string, code: string) =>
    request<{ ok: boolean; short_token?: string }>("/members/forgot", {
      method: "POST", body: JSON.stringify({ email, code }),
    }),
  memberReset: (token: string, new_password: string) =>
    request<{ ok: boolean }>("/members/reset", {
      method: "POST", body: JSON.stringify({ token, new_password }),
    }),
  memberStats: () => request<{ total_members: number }>("/members/stats"),
  updateNickname: (member_id: string, nickname: string) =>
    request<{ ok: boolean; nickname: string }>(`/members/${member_id}/nickname`, {
      method: "PUT", body: JSON.stringify({ nickname }),
    }),
  listProducts: (params?: { category?: string; q?: string }) => {
    const qs = new URLSearchParams();
    if (params?.category && params.category !== "all") qs.set("category", params.category);
    if (params?.q) qs.set("q", params.q);
    const s = qs.toString();
    return request<Product[]>(`/products${s ? "?" + s : ""}`);
  },
  featured: () => request<Product[]>("/products/featured"),
  product: (id: string) => request<Product>(`/products/${id}`),
  categories: () => request<Category[]>("/categories"),
  createProduct: (body: Partial<Product>) =>
    request<Product>("/products", { method: "POST", body: JSON.stringify(body) }),
  updateProduct: (id: string, body: Partial<Product>) =>
    request<Product>(`/products/${id}`, { method: "PUT", body: JSON.stringify(body) }),
  deleteProduct: (id: string) =>
    request<{ ok: boolean }>(`/products/${id}`, { method: "DELETE" }),
  createOrder: (body: { member_id: string; items: any[]; total: number }) =>
    request<{ order_id: string; status: string }>("/orders", {
      method: "POST", body: JSON.stringify(body),
    }),
  chatMemberGet: (member_id: string) => request<ChatMessage[]>(`/chat/member/${member_id}`),
  chatMemberSend: (member_id: string, text: string, attachments?: string[]) =>
    request<ChatMessage>(`/chat/member/${member_id}`, { method: "POST", body: JSON.stringify({ text, attachments }) }),
  chatThreads: () => request<ChatThread[]>("/chat/threads"),
  chatSupportGet: (member_id: string) => request<ChatMessage[]>(`/chat/support/${member_id}`),
  chatSupportSend: (member_id: string, text: string, attachments?: string[]) =>
    request<ChatMessage>(`/chat/support/${member_id}`, { method: "POST", body: JSON.stringify({ text, attachments }) }),
  requestQuote: (body: { member_id: string; description: string; budget?: string; attachments?: string[] }) =>
    request<{ quote_id: string; status: string }>("/quotes/request", {
      method: "POST", body: JSON.stringify(body),
    }),
  memberQuotes: (member_id: string) =>
    request<any[]>(`/quotes/member/${member_id}`),
  allQuotes: () => request<any[]>("/quotes"),
  adminStats: () =>
    request<{
      members: number; active_members: number;
      open_quotes: number; total_quotes: number;
      open_orders: number; unread_messages: number;
    }>("/admin/stats"),
  adminMembers: () => request<any[]>("/admin/members"),
  adminUpdateMember: (id: string, body: { name?: string; phone?: string; tier?: TierId; active?: boolean }) =>
    request<{ ok: boolean }>(`/admin/members/${id}`, { method: "PUT", body: JSON.stringify(body) }),
  adminDeleteMember: (id: string) =>
    request<{ ok: boolean }>(`/admin/members/${id}`, { method: "DELETE" }),
  adminListAuthorized: () => request<AuthorizedEntry[]>("/admin/authorized"),
  adminAddAuthorized: (body: { name: string; phone: string; code: string; tier?: TierId; parent_name?: string }) =>
    request<{ ok: boolean; code: string }>("/admin/authorized", {
      method: "POST", body: JSON.stringify(body),
    }),
  adminDeleteAuthorized: (auth_id: string) =>
    request<{ ok: boolean }>(`/admin/authorized/${auth_id}`, { method: "DELETE" }),
};

export function formatBRL(n: number) {
  return n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}
