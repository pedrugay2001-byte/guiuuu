import React, { createContext, useContext, useEffect, useState, useCallback } from "react";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { Product } from "./api";

export type CartItem = { product: Product; quantity: number };

type CartState = {
  items: CartItem[];
  add: (p: Product) => void;
  remove: (id: string) => void;
  updateQty: (id: string, q: number) => void;
  clear: () => void;
  total: number;
  count: number;
};

const CartContext = createContext<CartState | null>(null);
const CART_KEY = "farmaclube_cart";

export function CartProvider({ children }: { children: React.ReactNode }) {
  const [items, setItems] = useState<CartItem[]>([]);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    (async () => {
      const raw = await AsyncStorage.getItem(CART_KEY);
      if (raw) {
        try {
          setItems(JSON.parse(raw));
        } catch {}
      }
      setLoaded(true);
    })();
  }, []);

  useEffect(() => {
    if (loaded) AsyncStorage.setItem(CART_KEY, JSON.stringify(items));
  }, [items, loaded]);

  const add = useCallback((p: Product) => {
    setItems((prev) => {
      const ex = prev.find((i) => i.product.product_id === p.product_id);
      if (ex) {
        return prev.map((i) =>
          i.product.product_id === p.product_id ? { ...i, quantity: i.quantity + 1 } : i,
        );
      }
      return [...prev, { product: p, quantity: 1 }];
    });
  }, []);

  const remove = useCallback((id: string) => {
    setItems((prev) => prev.filter((i) => i.product.product_id !== id));
  }, []);

  const updateQty = useCallback((id: string, q: number) => {
    setItems((prev) =>
      prev.map((i) =>
        i.product.product_id === id ? { ...i, quantity: Math.max(1, q) } : i,
      ),
    );
  }, []);

  const clear = useCallback(() => setItems([]), []);

  const total = items.reduce((s, i) => s + i.product.member_price * i.quantity, 0);
  const count = items.reduce((s, i) => s + i.quantity, 0);

  return (
    <CartContext.Provider value={{ items, add, remove, updateQty, clear, total, count }}>
      {children}
    </CartContext.Provider>
  );
}

export function useCart() {
  const ctx = useContext(CartContext);
  if (!ctx) throw new Error("useCart must be used within CartProvider");
  return ctx;
}
