import { supabaseAdmin } from "@/integrations/supabase/client.server";
import type { Database } from "@/integrations/supabase/types";
import { sendOrderNotifications, type OrderNotificationResult } from "@/lib/notifications.server";

type ProductInput = Database["public"]["Tables"]["products"]["Insert"];
type ProductChanges = Database["public"]["Tables"]["products"]["Update"];
type OrderChanges = Database["public"]["Tables"]["orders"]["Update"];

async function requireStoreAdmin(userId: string) {
  const { data, error } = await supabaseAdmin
    .from("user_roles")
    .select("user_id")
    .eq("user_id", userId)
    .eq("role", "admin")
    .maybeSingle();
  if (error) {
    console.error("[Store] Could not verify seller permissions", error);
    throw new Error("Could not verify store permissions. Please try again.");
  }
  if (!data) throw new Error("You do not have permission to manage this store.");
}

export async function createStoreProduct(userId: string, product: ProductInput, stock: number) {
  await requireStoreAdmin(userId);
  const { data, error } = await supabaseAdmin
    .from("products")
    .insert(product)
    .select("id")
    .single();
  if (error) {
    console.error("[Store] Could not create product", error);
    throw new Error("Could not add this watch. Please try again.");
  }

  const { error: stockError } = await supabaseAdmin
    .from("inventory")
    .upsert({ watch_id: data.id, stock, updated_at: new Date().toISOString() });
  if (stockError) {
    console.error("[Store] Could not initialize product stock", {
      productId: data.id,
      error: stockError,
    });
    const { error: cleanupError } = await supabaseAdmin.from("products").delete().eq("id", data.id);
    if (cleanupError) {
      console.error("[Store] Could not roll back incomplete product", cleanupError);
      throw new Error("The watch was created but stock setup failed. Please contact support.");
    }
    throw new Error(
      "The watch was not added because its stock could not be initialized. Please try again.",
    );
  }
  return { id: data.id };
}

export async function updateStoreProduct(userId: string, id: string, changes: ProductChanges) {
  await requireStoreAdmin(userId);
  const { data: existing, error: readError } = await supabaseAdmin
    .from("products")
    .select("price,list_price")
    .eq("id", id)
    .maybeSingle();
  if (readError) {
    console.error("[Store] Could not validate product price changes", {
      productId: id,
      error: readError,
    });
    throw new Error("Could not validate this product update. Please try again.");
  }
  if (!existing) throw new Error("This watch no longer exists.");
  if ((changes.list_price ?? existing.list_price) < (changes.price ?? existing.price)) {
    throw new Error("MRP must be at least the selling price.");
  }
  const { data, error } = await supabaseAdmin
    .from("products")
    .update(changes)
    .eq("id", id)
    .select("id")
    .maybeSingle();
  if (error) {
    console.error("[Store] Could not update product", { productId: id, error });
    throw new Error("Could not update this watch. Please try again.");
  }
  if (!data) throw new Error("This watch no longer exists.");
}

export async function updateStoreStock(userId: string, id: string, stock: number) {
  await requireStoreAdmin(userId);
  const { error } = await supabaseAdmin
    .from("inventory")
    .upsert({ watch_id: id, stock, updated_at: new Date().toISOString() });
  if (error) {
    console.error("[Store] Could not update inventory", { productId: id, error });
    throw new Error("Could not update stock. Please try again.");
  }
}

export async function updateStoreOrder(userId: string, id: string, changes: OrderChanges) {
  await requireStoreAdmin(userId);
  const { data: existing, error: readError } = await supabaseAdmin
    .from("orders")
    .select("status")
    .eq("id", id)
    .maybeSingle();
  if (readError) {
    console.error("[Store] Could not read order before updating it", { orderId: id, error: readError });
    throw new Error("Could not update this order. Please try again.");
  }
  if (!existing) throw new Error("This order no longer exists.");

  const { data, error } = await supabaseAdmin
    .from("orders")
    .update(changes)
    .eq("id", id)
    .select("id")
    .maybeSingle();
  if (error) {
    console.error("[Store] Could not update order", { orderId: id, error });
    throw new Error("Could not update this order. Please try again.");
  }
  if (!data) throw new Error("This order no longer exists.");
  if (changes.status === existing.status) return { notifications: null };
  return { notifications: await notifyStoreOrderStatus(userId, id, changes.status) };
}

export async function notifyStoreOrderStatus(
  userId: string,
  id: string,
  expectedStatus: string,
): Promise<OrderNotificationResult> {
  await requireStoreAdmin(userId);
  const { data: order, error } = await supabaseAdmin
    .from("orders")
    .select("id,user_id,items,total,address,status,payment,tracking_url")
    .eq("id", id)
    .maybeSingle();
  if (error) {
    console.error("[Store] Could not load order notification details", { orderId: id, error });
    throw new Error("Could not prepare order notifications. Please try again.");
  }
  if (!order) throw new Error("This order no longer exists.");
  if (order.status !== expectedStatus) {
    throw new Error("The order status changed. Refresh the page and try again.");
  }

  const { data: account, error: accountError } = await supabaseAdmin.auth.admin.getUserById(
    order.user_id,
  );
  if (accountError) {
    console.error("[Store] Could not read customer email for order notification", {
      orderId: id,
      error: accountError,
    });
  }
  const address =
    typeof order.address === "object" && order.address !== null && !Array.isArray(order.address)
      ? (order.address as Record<string, unknown>)
      : {};
  const items = Array.isArray(order.items)
    ? order.items.flatMap((item) => {
        if (typeof item !== "object" || item === null || Array.isArray(item)) return [];
        const line = item as Record<string, unknown>;
        return typeof line["id"] === "string" && typeof line["qty"] === "number"
          ? [{ id: line["id"], qty: line["qty"] }]
          : [];
      })
    : [];

  return sendOrderNotifications({
    orderId: order.id,
    email: account?.user.email ?? null,
    name: typeof address["name"] === "string" ? address["name"] : "Customer",
    mobile: typeof address["mobile"] === "string" ? address["mobile"] : "",
    total: order.total,
    items,
    status: order.status,
    payment: order.payment,
    trackingUrl: order.tracking_url,
  });
}
