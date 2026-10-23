import { Buffer } from "node:buffer";

type OrderNotificationInput = {
  orderId: string;
  email: string | null;
  name: string;
  mobile: string;
  total: number;
  items: { id: string; qty: number }[];
  status: string;
  payment: string;
  trackingUrl?: string | null;
};

export type OrderNotificationResult = {
  email: "sent" | "failed";
  sms: "sent" | "failed";
};

const statusLabels: Record<string, string> = {
  confirmed: "Confirmed",
  packed: "Packed",
  shipped: "Shipped",
  out_for_delivery: "Out for delivery",
  delivered: "Delivered",
  cancelled: "Cancelled",
};

function orderDetails(input: OrderNotificationInput) {
  const status = statusLabels[input.status] ?? input.status;
  const products = input.items.map((item) => `${item.id} x ${item.qty}`).join(", ");
  const tracking = input.trackingUrl ? `\nTracking: ${input.trackingUrl}` : "";
  return {
    status,
    subject:
      input.status === "confirmed"
        ? `BIG-B order confirmed - ${input.orderId}`
        : `BIG-B order update - ${input.orderId}`,
    text: [
      `Hello ${input.name},`,
      "",
      `Your BIG-B order ${input.orderId} is ${status.toLowerCase()}.`,
      `Items: ${products}`,
      `Total: INR ${input.total.toLocaleString("en-IN")}`,
      `Payment: ${input.payment === "cod" ? "Cash on delivery" : "Paid online"}`,
      tracking,
      "",
      "Thank you for shopping with BIG-B.",
    ]
      .filter(Boolean)
      .join("\n"),
  };
}

async function sendEmail(input: OrderNotificationInput) {
  const apiKey = process.env["RESEND_API_KEY"];
  const from = process.env["RESEND_FROM_EMAIL"];
  if (!apiKey || !from) throw new Error("Resend server settings are missing");
  if (!input.email) throw new Error("The customer's account email is unavailable");

  const details = orderDetails(input);
  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from,
      to: [input.email],
      subject: details.subject,
      text: details.text,
    }),
    signal: AbortSignal.timeout(10_000),
  });
  if (!response.ok) throw new Error(`Resend returned HTTP ${response.status}`);
}

async function sendSms(input: OrderNotificationInput) {
  const accountSid = process.env["TWILIO_ACCOUNT_SID"];
  const authToken = process.env["TWILIO_AUTH_TOKEN"];
  const messagingServiceSid = process.env["TWILIO_MESSAGING_SERVICE_SID"];
  const fromNumber = process.env["TWILIO_FROM_NUMBER"];
  if (!accountSid || !authToken || (!messagingServiceSid && !fromNumber)) {
    throw new Error("Twilio server settings are missing");
  }
  if (!/^[6-9]\d{9}$/.test(input.mobile)) {
    throw new Error("The customer's mobile number is invalid");
  }

  const details = orderDetails(input);
  const body = new URLSearchParams({
    To: `+91${input.mobile}`,
    Body: `BIG-B: Order ${input.orderId} is ${details.status.toLowerCase()}. Total INR ${input.total}.${input.trackingUrl ? ` Track: ${input.trackingUrl}` : ""}`,
  });
  if (messagingServiceSid) body.set("MessagingServiceSid", messagingServiceSid);
  else body.set("From", fromNumber!);

  const response = await fetch(
    `https://api.twilio.com/2010-04-01/Accounts/${encodeURIComponent(accountSid)}/Messages.json`,
    {
      method: "POST",
      headers: {
        Authorization: `Basic ${Buffer.from(`${accountSid}:${authToken}`).toString("base64")}`,
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body,
      signal: AbortSignal.timeout(10_000),
    },
  );
  if (!response.ok) throw new Error(`Twilio returned HTTP ${response.status}`);
}

async function deliver(
  channel: "email" | "sms",
  orderId: string,
  send: () => Promise<void>,
): Promise<"sent" | "failed"> {
  try {
    await send();
    return "sent";
  } catch (error) {
    console.error(`[Notifications] Could not send ${channel} for order ${orderId}`, error);
    return "failed";
  }
}

export async function sendOrderNotifications(
  input: OrderNotificationInput,
): Promise<OrderNotificationResult> {
  const [email, sms] = await Promise.all([
    deliver("email", input.orderId, () => sendEmail(input)),
    deliver("sms", input.orderId, () => sendSms(input)),
  ]);
  return { email, sms };
}
