import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import {
  createCodOrder as createCodOrderOnServer,
  createRazorpayOrder,
  verifyRazorpayPayment,
} from "@/lib/payment.server";

const lineSchema = z.object({
  id: z.string().regex(/^[a-z0-9][a-z0-9-]{0,59}$/),
  qty: z.number().int().min(1).max(20),
});

const addressSchema = z.object({
  name: z.string().trim().min(1).max(100),
  mobile: z.string().regex(/^[6-9]\d{9}$/),
  address: z.string().trim().min(1).max(500),
  locality: z.string().max(150).optional(),
  city: z.string().trim().min(1).max(100),
  state: z.string().trim().min(1).max(100),
  pincode: z.string().regex(/^\d{6}$/),
  landmark: z.string().max(150).optional(),
  type: z.string().max(30).optional(),
});

export const createPaymentOrder = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator(
    z.object({
      items: z.array(lineSchema).min(1).max(4),
      address: addressSchema,
    }),
  )
  .handler(async ({ data, context }) => {
    return createRazorpayOrder(context.userId, data.items, data.address);
  });

export const createCodOrder = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator(
    z.object({
      items: z.array(lineSchema).min(1).max(4),
      address: addressSchema,
    }),
  )
  .handler(async ({ data, context }) =>
    createCodOrderOnServer(
      context.userId,
      data.items,
      data.address,
      context.supabase,
      typeof context.claims["email"] === "string" ? context.claims["email"] : null,
    ),
  );

export const verifyPayment = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator(
    z.object({
      orderId: z.string().regex(/^PF[A-F0-9]{20}$/),
      razorpayOrderId: z.string().min(1).max(100),
      razorpayPaymentId: z.string().min(1).max(100),
      razorpaySignature: z.string().regex(/^[a-fA-F0-9]{64}$/),
    }),
  )
  .handler(async ({ data, context }) => verifyRazorpayPayment(context.userId, data));
