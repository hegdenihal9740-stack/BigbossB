import { randomUUID, timingSafeEqual, createHmac } from "node:crypto";
import { Buffer } from "node:buffer";
import type { SupabaseClient } from "@supabase/supabase-js";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import type { Database } from "@/integrations/supabase/types";
import { getPaymentTotal, type PaymentLine } from "@/lib/payment";
import { watchPrices } from "@/lib/watches";
import { sendOrderNotifications } from "@/lib/notifications.server";

type PaymentAddress = {
  name: string;
  mobile: string;
  address: string;
  locality?: string | undefined;
  city: string;
  state: string;
  pincode: string;
  landmark?: string | undefined;
  type?: string | undefined;
};

type RazorpayOrderResponse = {
  id: string;
  amount: number;
  currency: string;
  status: string;
  notes?: Record<string, string>;
};

type RazorpayPaymentResponse = {
  id: string;
  order_id: string;
  amount: number;
  currency: string;
  status: string;
};

async function priceOrderLines(
  lines: PaymentLine[],
  client: SupabaseClient<Database> = supabaseAdmin,
) {
  const customIds = [
    ...new Set(lines.map((line) => line.id).filter((id) => !Object.hasOwn(watchPrices, id))),
  ];
  const customPrices: Record<string, number> = {};
  if (customIds.length) {
    const { data, error } = await client
      .from("products")
      .select("id,price")
      .in("id", customIds)
      .eq("active", true);
    if (error) {
      console.error("[Orders] Could not validate custom products", error);
      throw new Error("Could not validate your cart. Please try again.");
    }
    for (const product of data ?? []) customPrices[product.id] = product.price;
  }

  const total = getPaymentTotal(lines, customPrices);
  return {
    total,
    items: lines.map((line) => ({
      ...line,
      price: Object.hasOwn(watchPrices, line.id)
        ? watchPrices[line.id as keyof typeof watchPrices]
        : customPrices[line.id]!,
    })),
  };
}

function razorpayConfig() {
  const keyId = process.env["RAZORPAY_KEY_ID"];
  const keySecret = process.env["RAZORPAY_KEY_SECRET"];
  if (!keyId || !keySecret) {
    throw new Error(
      "Online payments are not configured. Add the Razorpay test or live keys to the server environment.",
    );
  }
  return { keyId, keySecret };
}

function authHeader(keyId: string, keySecret: string) {
  return `Basic ${Buffer.from(`${keyId}:${keySecret}`).toString("base64")}`;
}

function validateAddress(address: PaymentAddress): PaymentAddress {
  if (
    !address ||
    typeof address.name !== "string" ||
    !address.name.trim() ||
    typeof address.mobile !== "string" ||
    !/^[6-9]\d{9}$/.test(address.mobile) ||
    typeof address.address !== "string" ||
    !address.address.trim() ||
    typeof address.city !== "string" ||
    !address.city.trim() ||
    typeof address.state !== "string" ||
    !address.state.trim() ||
    typeof address.pincode !== "string" ||
    !/^\d{6}$/.test(address.pincode)
  ) {
    throw new Error("Please provide a valid delivery address before paying");
  }
  return address;
}

export async function createRazorpayOrder(
  userId: string,
  lines: PaymentLine[],
  rawAddress: PaymentAddress,
) {
  const { total, items } = await priceOrderLines(lines);
  const address = validateAddress(rawAddress);
  const { keyId, keySecret } = razorpayConfig();
  const orderId = `PF${randomUUID().replaceAll("-", "").slice(0, 20).toUpperCase()}`;
  const response = await fetch("https://api.razorpay.com/v1/orders", {
    method: "POST",
    headers: { Authorization: authHeader(keyId, keySecret), "Content-Type": "application/json" },
    body: JSON.stringify({
      amount: total * 100,
      currency: "INR",
      receipt: orderId,
      notes: { user_id: userId, store_order_id: orderId },
    }),
  });
  if (!response.ok) {
    const message = `Razorpay could not create an order (HTTP ${response.status})`;
    console.error(`[Payment] ${message}`);
    throw new Error("Could not start online payment. Please try again.");
  }
  const razorpayOrder = (await response.json()) as RazorpayOrderResponse;
  if (
    razorpayOrder.amount !== total * 100 ||
    razorpayOrder.currency !== "INR" ||
    razorpayOrder.status !== "created"
  ) {
    throw new Error("The payment provider returned an invalid order");
  }

  const { error } = await supabaseAdmin.from("payment_intents").insert({
    id: orderId,
    user_id: userId,
    razorpay_order_id: razorpayOrder.id,
    items,
    total,
    address,
  });
  if (error) {
    console.error("[Payment] Could not save pending payment intent", error);
    throw new Error("Could not prepare your order. Please try again.");
  }

  const { error: cleanupError } = await supabaseAdmin
    .from("payment_intents")
    .delete()
    .lt("created_at", new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString());
  if (cleanupError)
    console.error("[Payment] Could not clean up expired payment intents", cleanupError);

  return {
    keyId,
    razorpayOrderId: razorpayOrder.id,
    orderId,
    amount: razorpayOrder.amount,
    currency: razorpayOrder.currency,
  };
}

export async function createCodOrder(
  userId: string,
  lines: PaymentLine[],
  rawAddress: PaymentAddress,
  userClient: SupabaseClient<Database>,
  email: string | null,
) {
  const { total, items } = await priceOrderLines(lines, userClient);
  const address = validateAddress(rawAddress);
  const id = `PF${randomUUID().replaceAll("-", "").slice(0, 20).toUpperCase()}`;
  const { error } = await userClient.from("orders").insert({
    id,
    user_id: userId,
    items,
    total,
    payment: "cod",
    address,
  });
  if (error) {
    console.error("[Orders] Could not create COD order", { orderId: id, error });
    throw new Error(
      error.message.includes("OUT_OF_STOCK")
        ? "Sorry, one of these watches just went out of stock."
        : "Could not place your order. Please try again.",
    );
  }
  const notifications = await sendOrderNotifications({
    orderId: id,
    email,
    name: address.name,
    mobile: address.mobile,
    total,
    items,
    status: "confirmed",
    payment: "cod",
  });
  return { orderId: id, total, notifications };
}

export async function verifyRazorpayPayment(
  userId: string,
  input: {
    orderId: string;
    razorpayOrderId: string;
    razorpayPaymentId: string;
    razorpaySignature: string;
  },
) {
  const { keyId, keySecret } = razorpayConfig();
  const expectedSignature = createHmac("sha256", keySecret)
    .update(`${input.razorpayOrderId}|${input.razorpayPaymentId}`)
    .digest();
  const receivedSignature = Buffer.from(input.razorpaySignature, "hex");
  if (
    receivedSignature.length !== expectedSignature.length ||
    !timingSafeEqual(receivedSignature, expectedSignature)
  ) {
    throw new Error("Payment signature is invalid");
  }

  const { data: existing, error: existingError } = await supabaseAdmin
    .from("orders")
    .select("id,total,payment_reference")
    .eq("id", input.orderId)
    .eq("user_id", userId)
    .maybeSingle();
  if (existingError) throw new Error("Could not confirm your order. Please try again.");
  if (existing && existing.payment_reference !== input.razorpayPaymentId) {
    throw new Error("This order was already completed with a different payment");
  }

  const { data: intent, error: intentError } = await supabaseAdmin
    .from("payment_intents")
    .select("*")
    .eq("id", input.orderId)
    .eq("user_id", userId)
    .maybeSingle();
  if (!existing && (intentError || !intent || intent.razorpay_order_id !== input.razorpayOrderId)) {
    throw new Error("Payment order was not found. Please contact support before retrying.");
  }

  const authorization = authHeader(keyId, keySecret);
  const [orderResponse, paymentResponse] = await Promise.all([
    fetch(`https://api.razorpay.com/v1/orders/${encodeURIComponent(input.razorpayOrderId)}`, {
      headers: { Authorization: authorization },
    }),
    fetch(`https://api.razorpay.com/v1/payments/${encodeURIComponent(input.razorpayPaymentId)}`, {
      headers: { Authorization: authorization },
    }),
  ]);
  if (!orderResponse.ok || !paymentResponse.ok) {
    throw new Error("Could not verify payment with Razorpay. Please wait a moment and try again.");
  }
  const [razorpayOrder, payment] = await Promise.all([
    orderResponse.json() as Promise<RazorpayOrderResponse>,
    paymentResponse.json() as Promise<RazorpayPaymentResponse>,
  ]);
  const expectedTotal = existing?.total ?? intent?.total;
  if (!expectedTotal)
    throw new Error("Payment order was not found. Please contact support before retrying.");
  const expectedAmount = expectedTotal * 100;
  if (
    razorpayOrder.id !== input.razorpayOrderId ||
    razorpayOrder.amount !== expectedAmount ||
    razorpayOrder.currency !== "INR" ||
    razorpayOrder.notes?.["user_id"] !== userId ||
    razorpayOrder.notes?.["store_order_id"] !== input.orderId ||
    payment.order_id !== input.razorpayOrderId ||
    payment.amount !== expectedAmount ||
    payment.currency !== "INR" ||
    payment.status !== "captured"
  ) {
    throw new Error(
      "Payment is not captured or does not match this order. Please contact support if money was deducted.",
    );
  }

  if (existing) {
    return { orderId: existing.id, total: existing.total };
  }
  if (!intent)
    throw new Error("Payment order was not found. Please contact support before retrying.");

  const { error: insertError } = await supabaseAdmin.from("orders").insert({
    id: intent.id,
    user_id: userId,
    items: intent.items,
    total: intent.total,
    payment: "razorpay",
    payment_reference: input.razorpayPaymentId,
    address: intent.address,
  });
  if (insertError) {
    const { data: concurrentOrder } = await supabaseAdmin
      .from("orders")
      .select("id,total,payment_reference")
      .eq("id", intent.id)
      .eq("user_id", userId)
      .maybeSingle();
    if (concurrentOrder?.payment_reference === input.razorpayPaymentId) {
      return { orderId: concurrentOrder.id, total: concurrentOrder.total };
    }
    console.error("[Payment] Captured payment but failed to create order", {
      orderId: intent.id,
      error: insertError,
    });
    throw new Error(
      insertError.message.includes("OUT_OF_STOCK")
        ? "Payment was received, but an item went out of stock. Please contact support for a refund."
        : "Payment was received, but the order could not be confirmed. Please contact support.",
    );
  }

  const { error: deleteError } = await supabaseAdmin
    .from("payment_intents")
    .delete()
    .eq("id", intent.id)
    .eq("user_id", userId);
  if (deleteError)
    console.error("[Payment] Could not remove completed payment intent", deleteError);

  return { orderId: intent.id, total: intent.total };
}
