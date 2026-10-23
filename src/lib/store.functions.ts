import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
const productId = z.string().regex(/^[a-z0-9][a-z0-9-]{0,59}$/);
const stock = z.number().int().min(0).max(100000);
const productFields = z.object({
  name: z.string().trim().min(1).max(100),
  finish: z.string().trim().max(100),
  price: z.number().int().positive().max(100000000),
  list_price: z.number().int().positive().max(100000000),
  description: z.string().trim().max(1000),
  details: z.array(z.string().trim().min(1).max(120)).max(12),
  image_url: z
    .string()
    .max(2_500_000)
    .refine(
      (value) => value.startsWith("data:image/") || /^https:\/\//i.test(value),
      "Use an image upload or HTTPS image URL.",
    ),
});
const orderStatus = z.enum(["confirmed", "packed", "shipped", "out_for_delivery", "delivered"]);
const courier = z.enum(["Delhivery", "Blue Dart", "DTDC", "India Post", "Shiprocket", "Other"]);
const orderTracking = z.object({
  status: orderStatus,
  courier: courier.nullable(),
  awb: z.string().trim().max(100).nullable(),
  tracking_url: z
    .string()
    .trim()
    .max(2048)
    .url()
    .nullable()
    .refine((value) => value === null || value.startsWith("https://")),
});

export const createStoreProduct = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator(
    z.object({
      product: productFields
        .extend({ id: productId })
        .refine(
          (product) => product.list_price >= product.price,
          "MRP must be at least the selling price.",
        ),
      stock,
    }),
  )
  .handler(async ({ data, context }) => {
    const { createStoreProduct: create } = await import("@/lib/store.server");
    return create(context.userId, data.product, data.stock);
  });

export const updateStoreProduct = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator(
    z.object({
      id: productId,
      changes: productFields
        .partial()
        .extend({ active: z.boolean().optional() })
        .refine(
          (changes) => Object.keys(changes).length > 0,
          "Provide at least one product change.",
        ),
    }),
  )
  .handler(async ({ data, context }) => {
    const { updateStoreProduct: update } = await import("@/lib/store.server");
    await update(context.userId, data.id, data.changes);
    return { success: true };
  });

export const updateStoreStock = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator(z.object({ id: productId, stock }))
  .handler(async ({ data, context }) => {
    const { updateStoreStock: update } = await import("@/lib/store.server");
    await update(context.userId, data.id, data.stock);
    return { success: true };
  });

export const updateStoreOrder = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator(z.object({ id: z.string().min(1).max(100), changes: orderTracking }))
  .handler(async ({ data, context }) => {
    const { updateStoreOrder: update } = await import("@/lib/store.server");
    return update(context.userId, data.id, data.changes);
  });

export const notifyCancelledStoreOrder = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator(z.object({ id: z.string().min(1).max(100) }))
  .handler(async ({ data, context }) => {
    const { notifyStoreOrderStatus } = await import("@/lib/store.server");
    return notifyStoreOrderStatus(context.userId, data.id, "cancelled");
  });
