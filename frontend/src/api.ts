import AsyncStorage from "@react-native-async-storage/async-storage";
import type { TierId } from "./theme";

const BASE_URL = process.env.EXPO_PUBLIC_BACKEND_URL as string;

export type User = {
  user_id: string; email: string; name: string;
  role: "admin" | "member" | "support"; created_at: string;
};

export type Product = {
  product_id: string; name: string; category: string;
  subcategory?: string | null;
  description: string;
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
  listProducts: (params?: { category?: string; subcategory?: string; q?: string }) => {
    const qs = new URLSearchParams();
    if (params?.category && params.category !== "all") qs.set("category", params.category);
    if (params?.subcategory && params.subcategory !== "all") qs.set("subcategory", params.subcategory);
    if (params?.q) qs.set("q", params.q);
    const s = qs.toString();
    return request<Product[]>(`/products${s ? "?" + s : ""}`);
  },
  subcategories: (category: string) =>
    request<{ id: string; name: string; count: number }[]>(`/subcategories/${category}`),
  aiSpecialists: () =>
    request<{
      id: string; name: string; title: string; tagline: string;
      description: string; color: string; avatar: string; starters: string[];
    }[]>("/ai/specialists"),
  aiChat: (member_id: string, text: string, specialist_id?: string, image_base64?: string) =>
    request<{ reply: string; specialist_id: string }>("/ai/chat", {
      method: "POST",
      body: JSON.stringify({ member_id, text, specialist_id, image_base64 }),
    }),
  aiHistory: (member_id: string, specialist_id?: string) =>
    request<{ sender: "member" | "ai"; text: string; created_at: string; has_image?: boolean }[]>(
      `/ai/history/${member_id}${specialist_id ? `?specialist_id=${specialist_id}` : ""}`
    ),
  aiClear: (member_id: string, specialist_id?: string) =>
    request<{ ok: boolean }>(
      `/ai/history/${member_id}${specialist_id ? `?specialist_id=${specialist_id}` : ""}`,
      { method: "DELETE" }
    ),
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
  adminResetMemberPassword: (id: string, password: string) =>
    request<{ ok: boolean; email?: string }>(`/admin/members/${id}/password`, {
      method: "PUT", body: JSON.stringify({ password }),
    }),
  adminListAuthorized: () => request<AuthorizedEntry[]>("/admin/authorized"),
  adminAddAuthorized: (body: { name: string; phone: string; code: string; tier?: TierId; parent_name?: string }) =>
    request<{ ok: boolean; code: string }>("/admin/authorized", {
      method: "POST", body: JSON.stringify(body),
    }),
  adminDeleteAuthorized: (auth_id: string) =>
    request<{ ok: boolean }>(`/admin/authorized/${auth_id}`, { method: "DELETE" }),

  // ----- Community (MSN-style) -----
  updateProfile: (member_id: string, body: {
    nickname?: string; bio?: string; age?: number; profession?: string;
    gym?: string; city?: string; avatar_base64?: string;
  }) => request<{ ok: boolean }>(`/members/${member_id}/profile`, { method: "PUT", body: JSON.stringify(body) }),
  heartbeat: (member_id: string) =>
    request<{ ok: boolean }>(`/members/${member_id}/heartbeat`, { method: "POST" }),
  communityMembers: (exclude?: string) =>
    request<CommunityMember[]>(`/community/members${exclude ? `?exclude=${exclude}` : ""}`),
  communityMember: (id: string) =>
    request<CommunityMember>(`/community/members/${id}`),
  dmList: (me: string, other: string) =>
    request<DMMessage[]>(`/community/dms/${me}/${other}`),
  dmSend: (me: string, other: string, text: string) =>
    request<DMMessage>(`/community/dms/${me}/${other}`, { method: "POST", body: JSON.stringify({ text }) }),
  dmThreads: (me: string) =>
    request<DMThread[]>(`/community/dms/${me}`),
  groupsList: () => request<Group[]>("/community/groups"),
  groupJoin: (group_id: string, member_id: string) =>
    request<{ ok: boolean }>(`/community/groups/${group_id}/join/${member_id}`, { method: "POST" }),
  groupLeave: (group_id: string, member_id: string) =>
    request<{ ok: boolean }>(`/community/groups/${group_id}/leave/${member_id}`, { method: "POST" }),
  groupIsMember: (group_id: string, member_id: string) =>
    request<{ is_member: boolean }>(`/community/groups/${group_id}/is-member/${member_id}`),
  groupMessages: (group_id: string) =>
    request<GroupMsg[]>(`/community/groups/${group_id}/messages`),
  groupSend: (group_id: string, member_id: string, text: string) =>
    request<GroupMsg>(`/community/groups/${group_id}/messages`, { method: "POST", body: JSON.stringify({ member_id, text }) }),
  eventsList: () => request<CommunityEvent[]>("/community/events"),

  // ----- Plans & Marketplace -----
  plans: () => request<Plan[]>("/plans"),
  adminSetPlan: (member_id: string, plan: string) =>
    request<{ ok: boolean; plan: string }>(`/admin/members/${member_id}/plan`, {
      method: "PUT", body: JSON.stringify({ plan }),
    }),
  listAds: (params?: { category?: string; q?: string }) => {
    const qs = new URLSearchParams();
    if (params?.category && params.category !== "all") qs.set("category", params.category);
    if (params?.q) qs.set("q", params.q);
    const s = qs.toString();
    return request<Ad[]>(`/ads${s ? "?" + s : ""}`);
  },
  getAd: (ad_id: string) => request<Ad>(`/ads/${ad_id}`),
  createAd: (body: AdCreatePayload) =>
    request<Ad>("/ads", { method: "POST", body: JSON.stringify(body) }),
  deleteAd: (ad_id: string, seller_id: string) =>
    request<{ ok: boolean }>(`/ads/${ad_id}?seller_id=${seller_id}`, { method: "DELETE" }),
  myAds: (member_id: string) => request<Ad[]>(`/ads/member/${member_id}`),

  // ----- Wallet (BLACK Coins) -----
  getWallet: (member_id: string) => request<Wallet>(`/wallet/${member_id}`),
  walletTxs: (member_id: string) => request<WalletTx[]>(`/wallet/${member_id}/transactions`),
  walletTopup: (member_id: string, amount: number) =>
    request<WalletTx>("/wallet/topup", { method: "POST", body: JSON.stringify({ member_id, amount }) }),
  walletWithdraw: (member_id: string, amount: number, pix_key?: string) =>
    request<WalletTx>("/wallet/withdraw", { method: "POST", body: JSON.stringify({ member_id, amount, pix_key }) }),
  walletPurchase: (ad_id: string, buyer_id: string, qty = 1) =>
    request<WalletTx>("/wallet/purchase", { method: "POST", body: JSON.stringify({ ad_id, buyer_id, qty }) }),
  walletConfirm: (tx_id: string, buyer_id: string) =>
    request<{ ok: boolean }>(`/wallet/confirm/${tx_id}`, { method: "POST", body: JSON.stringify({ buyer_id }) }),
  walletRefund: (tx_id: string) =>
    request<{ ok: boolean }>(`/wallet/refund/${tx_id}`, { method: "POST", body: JSON.stringify({ admin: true }) }),

  // ----- Stories -----
  listStories: () => request<StoryGroup[]>("/stories"),
  createStory: (member_id: string, image_base64?: string, text?: string) =>
    request<Story>("/stories", { method: "POST", body: JSON.stringify({ member_id, image_base64, text }) }),

  // ----- Feed -----
  listPosts: () => request<Post[]>("/feed/posts"),
  createPost: (member_id: string, text: string, image_base64?: string, tags?: string[]) =>
    request<Post>("/feed/posts", { method: "POST", body: JSON.stringify({ member_id, text, image_base64, tags }) }),
  reactPost: (post_id: string, kind: "fire" | "heart" | "muscle") =>
    request<{ ok: boolean }>(`/feed/posts/${post_id}/react`, { method: "POST", body: JSON.stringify({ kind }) }),

  // ----- Profile Photos -----
  updatePhotos: (member_id: string, photos: string[]) =>
    request<{ ok: boolean; count: number }>(`/members/${member_id}/photos`, { method: "PUT", body: JSON.stringify({ photos }) }),
  getPhotos: (member_id: string) => request<{ photos: string[] }>(`/members/${member_id}/photos`),

  // ----- Custom groups -----
  createCustomGroup: (body: { owner_id: string; name: string; description?: string; color?: string; icon?: string; invite_ids?: string[] }) =>
    request<Group>("/community/groups/custom", { method: "POST", body: JSON.stringify(body) }),
};

export type Plan = {
  id: "silver" | "gold" | "diamond";
  name: string;
  price_monthly: number;
  color: string;
  discount: number;
  can_sell: boolean;
  can_buy: boolean;
  features: string[];
};
export type Ad = {
  ad_id: string;
  seller_id: string;
  seller_nickname?: string;
  seller_tier?: TierId;
  seller_avatar?: string | null;
  title: string;
  description: string;
  price_full: number;
  category: string;
  images: string[];
  stock: number;
  active: boolean;
  created_at: string;
};
export type AdCreatePayload = {
  seller_id: string;
  title: string;
  description: string;
  price_full: number;
  category: string;
  images: string[];
  stock: number;
};
export type Wallet = {
  member_id: string;
  balance: number;
  escrow_in: number;
  escrow_out: number;
};
export type WalletTx = {
  tx_id: string;
  type: "topup" | "withdraw" | "escrow";
  from_id: string | null;
  to_id: string | null;
  amount: number;
  status: "settled" | "escrow" | "refunded";
  note?: string;
  ad_id?: string;
  ad_title?: string;
  qty?: number;
  price_full?: number;
  discount?: number;
  created_at: string;
};
export type Story = { story_id: string; member_id: string; image_base64?: string | null; text?: string; created_at: string; expires_at: string };
export type StoryGroup = { member_id: string; nickname: string; tier: TierId; avatar_base64?: string | null; stories: Story[] };
export type Post = {
  post_id: string;
  member_id: string;
  text: string;
  image_base64?: string | null;
  tags: string[];
  reactions: { fire: number; heart: number; muscle: number };
  comments_count: number;
  created_at: string;
  author_nickname?: string;
  author_tier?: TierId;
  author_avatar?: string | null;
  author_city?: string | null;
};

export type CommunityMember = {
  member_id: string;
  member_number?: number;
  nickname: string;
  tier: TierId;
  avatar_base64?: string | null;
  age?: number | null;
  profession?: string | null;
  gym?: string | null;
  city?: string | null;
  bio?: string | null;
  is_online: boolean;
};
export type DMMessage = { dm_id?: string; from_id: string; to_id: string; text: string; created_at: string };
export type DMThread = { partner_id: string; last_text: string; last_at: string };
export type Group = { group_id: string; name: string; description: string; icon: string; color: string; members_count: number };
export type GroupMsg = { gm_id?: string; group_id: string; member_id: string; text: string; created_at: string; nickname: string; avatar_base64?: string | null; tier: TierId };
export type CommunityEvent = { event_id: string; title: string; description: string; city: string; place: string; when_label: string; icon: string; color: string };

export function formatBRL(n: number) {
  return n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}
