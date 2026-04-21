import AsyncStorage from "@react-native-async-storage/async-storage";

const BASE_URL = process.env.EXPO_PUBLIC_BACKEND_URL as string;

export type User = {
  user_id: string;
  email: string;
  name: string;
  role: "admin" | "member";
  created_at: string;
};

export type Product = {
  product_id: string;
  name: string;
  category: string;
  description: string;
  price: number;
  member_price: number;
  image_url: string;
  stock: number;
  featured: boolean;
  created_at: string;
};

export type Category = {
  id: string;
  name: string;
  icon: string;
};

const TOKEN_KEY = "farmaclube_token";

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

export const api = {
  register: (email: string, password: string, name: string) =>
    request<{ user: User; token: string }>("/auth/register", {
      method: "POST",
      body: JSON.stringify({ email, password, name }),
    }),
  login: (email: string, password: string) =>
    request<{ user: User; token: string }>("/auth/login", {
      method: "POST",
      body: JSON.stringify({ email, password }),
    }),
  me: () => request<User>("/auth/me"),
  memberEnter: (body: { name: string; phone: string; address: string; code: string }) =>
    request<{
      member_id: string;
      name: string;
      invite_code: string;
      parent_code: string;
      parent_name: string | null;
      total_members: number;
    }>("/members/enter", { method: "POST", body: JSON.stringify(body) }),
  memberStats: () => request<{ total_members: number }>("/members/stats"),
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
};

export function formatBRL(n: number) {
  return n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}
