import { useSyncExternalStore } from "react";

const KEY = "pf-wishlist";
let userKey = "guest";
let list: string[] = [];
let loaded = false;
let authSyncStarted = false;
let revision = 0;
const listeners = new Set<() => void>();
const keyFor = (userId: string) => `${KEY}:${userId}`;
const validIds = (value: unknown): string[] =>
  Array.isArray(value)
    ? [
        ...new Set(
          value.filter(
            (id): id is string => typeof id === "string" && /^[a-z0-9][a-z0-9-]{0,59}$/.test(id),
          ),
        ),
      ].slice(0, 100)
    : [];
const load = () => {
  if (loaded || typeof window === "undefined") return;
  loaded = true;
  try {
    const scoped = localStorage.getItem(keyFor(userKey));
    const legacy = userKey === "guest" && scoped === null ? localStorage.getItem(KEY) : null;
    list = validIds(JSON.parse(scoped ?? legacy ?? "[]") as unknown);
    if (legacy !== null) {
      localStorage.setItem(keyFor(userKey), JSON.stringify(list));
      localStorage.removeItem(KEY);
    }
  } catch {
    list = [];
  }
};
const commit = () => {
  try {
    localStorage.setItem(keyFor(userKey), JSON.stringify(list));
  } catch {
    /* local cache unavailable */
  }
  listeners.forEach((l) => l());
  if (userKey === "guest") return;
  const userId = userKey;
  const snapshot = [...list];
  void import("@/integrations/supabase/client")
    .then(async ({ supabase }) => {
      if (userKey !== userId) return;
      const { error } = await supabase.from("customer_wishlists").upsert({
        user_id: userId,
        watch_ids: snapshot,
        updated_at: new Date().toISOString(),
      });
      if (error) console.error("Could not sync your wishlist to your account.", error);
    })
    .catch((error: unknown) =>
      console.error("Could not sync your wishlist to your account.", error),
    );
};

const switchUser = (nextUserId: string) => {
  if (nextUserId === userKey) return;
  userKey = nextUserId;
  try {
    list = validIds(JSON.parse(localStorage.getItem(keyFor(userKey)) ?? "[]") as unknown);
  } catch {
    list = [];
  }
  listeners.forEach((listener) => listener());
  if (userKey === "guest") return;
  const userId = userKey;
  const startRevision = revision;
  void import("@/integrations/supabase/client")
    .then(async ({ supabase }) => {
      const { data, error } = await supabase
        .from("customer_wishlists")
        .select("watch_ids")
        .eq("user_id", userId)
        .maybeSingle();
      if (error) throw error;
      if (userKey !== userId) return;
      if (revision !== startRevision) {
        commit();
        return;
      }
      if (data) {
        list = validIds(data.watch_ids);
        try {
          localStorage.setItem(keyFor(userId), JSON.stringify(list));
        } catch {
          /* local cache unavailable */
        }
        listeners.forEach((listener) => listener());
      } else if (list.length) {
        commit();
      }
    })
    .catch((error: unknown) => console.error("Could not restore your saved wishlist.", error));
};

export const wishlist = {
  toggle(id: string) {
    load();
    if (!/^[a-z0-9][a-z0-9-]{0,59}$/.test(id)) return false;
    list = list.includes(id)
      ? list.filter((x) => x !== id)
      : list.length >= 100
        ? list
        : [...list, id];
    revision += 1;
    commit();
    return list.includes(id);
  },
  remove(id: string) {
    load();
    list = list.filter((x) => x !== id);
    revision += 1;
    commit();
  },
};
const subscribe = (l: () => void) => {
  load();
  listeners.add(l);
  queueMicrotask(l);
  return () => {
    listeners.delete(l);
  };
};
const EMPTY: string[] = [];
const initializeAuthSync = () => {
  if (typeof window === "undefined" || authSyncStarted) return;
  authSyncStarted = true;
  void import("@/integrations/supabase/client")
    .then(({ supabase }) => {
      void supabase.auth
        .getSession()
        .then(({ data, error }) => {
          if (error) throw error;
          switchUser(data.session?.user.id ?? "guest");
        })
        .catch((error: unknown) =>
          console.error("Could not identify the account for wishlist sync.", error),
        );
      supabase.auth.onAuthStateChange((_event, session) => switchUser(session?.user.id ?? "guest"));
    })
    .catch((error: unknown) => console.error("Could not initialize wishlist sync.", error));
};
const originalSubscribe = subscribe;
export const useWishlist = () =>
  useSyncExternalStore(
    (listener) => {
      initializeAuthSync();
      return originalSubscribe(listener);
    },
    () => list,
    () => EMPTY,
  );
