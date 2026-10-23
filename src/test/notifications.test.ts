import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { sendOrderNotifications } from "@/lib/notifications.server";

describe("order notifications", () => {
  const fetchMock = vi.fn(async () => new Response(null, { status: 200 }));

  beforeEach(() => {
    vi.stubEnv("RESEND_API_KEY", "test-resend-key");
    vi.stubEnv("RESEND_FROM_EMAIL", "BIG-B <orders@example.test>");
    vi.stubEnv("TWILIO_ACCOUNT_SID", "test-account");
    vi.stubEnv("TWILIO_AUTH_TOKEN", "test-auth");
    vi.stubEnv("TWILIO_FROM_NUMBER", "+15551234567");
    vi.stubGlobal("fetch", fetchMock);
    fetchMock.mockClear();
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("sends order email and SMS via their server-side providers", async () => {
    const result = await sendOrderNotifications({
      orderId: "PF0123456789ABCDEF0123",
      email: "customer@example.test",
      name: "Customer",
      mobile: "9876543210",
      total: 12800,
      items: [{ id: "steel", qty: 1 }],
      status: "confirmed",
      payment: "cod",
    });

    expect(result).toEqual({ email: "sent", sms: "sent" });
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(String(fetchMock.mock.calls[0]?.[0])).toBe("https://api.resend.com/emails");
    expect(String(fetchMock.mock.calls[1]?.[0])).toContain(
      "/Accounts/test-account/Messages.json",
    );
    const smsBody = fetchMock.mock.calls[1]?.[1]?.body;
    expect(String(smsBody)).toContain("To=%2B919876543210");
  });

  it("reports provider configuration failures without changing the order result", async () => {
    vi.stubEnv("RESEND_API_KEY", "");
    vi.stubEnv("TWILIO_AUTH_TOKEN", "");
    const error = vi.spyOn(console, "error").mockImplementation(() => undefined);

    const result = await sendOrderNotifications({
      orderId: "PF0123456789ABCDEF0123",
      email: "customer@example.test",
      name: "Customer",
      mobile: "9876543210",
      total: 12800,
      items: [{ id: "steel", qty: 1 }],
      status: "confirmed",
      payment: "cod",
    });

    expect(result).toEqual({ email: "failed", sms: "failed" });
    expect(fetchMock).not.toHaveBeenCalled();
    expect(error).toHaveBeenCalledTimes(2);
  });
});
