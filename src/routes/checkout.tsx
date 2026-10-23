import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import {
  BadgeCheck,
  CheckCircle2,
  LocateFixed,
  MapPin,
  MessageCircle,
  RotateCcw,
  ShieldCheck,
  Trash2,
  Truck,
} from "lucide-react";
import { whatsappLink } from "@/lib/whatsapp";
import { toast } from "sonner";
import { ShopHeader } from "@/components/ShopHeader";
import { cart, prices, useCart } from "@/lib/cart";
import { createCodOrder, createPaymentOrder, verifyPayment } from "@/lib/payments.functions";
import { watches, type WatchTone } from "@/lib/watches";
import { useCustomer } from "@/components/CustomerAccounts";
import { useStock } from "@/lib/inventory";
import {
  formatStreetAddress,
  getAddressCity,
  getAddressLocality,
  type ReverseGeocodedAddress,
} from "@/lib/reverse-geocode";

type Address = {
  name: string;
  mobile: string;
  pincode: string;
  locality: string;
  address: string;
  city: string;
  state: string;
  landmark: string;
  type: "Home" | "Work";
};
const EMPTY: Address = {
  name: "",
  mobile: "",
  pincode: "",
  locality: "",
  address: "",
  city: "",
  state: "",
  landmark: "",
  type: "Home",
};
const KEY = "private-flight-address";
const usd = (n: number) => `₹${n.toLocaleString("en-IN")}`;

type RazorpaySuccess = {
  razorpay_order_id: string;
  razorpay_payment_id: string;
  razorpay_signature: string;
};
type RazorpayFailure = { error?: { description?: string } };
type RazorpayOptions = {
  key: string;
  amount: number;
  currency: string;
  name: string;
  description: string;
  order_id: string;
  prefill: { name: string; contact: string };
  theme: { color: string };
  handler: (response: RazorpaySuccess) => void;
  modal: { ondismiss: () => void };
};
type RazorpayInstance = {
  open: () => void;
  on: (event: "payment.failed", callback: (event: RazorpayFailure) => void) => void;
};

declare global {
  interface Window {
    Razorpay?: new (options: RazorpayOptions) => RazorpayInstance;
  }
}

let razorpayScript: Promise<void> | undefined;
function loadRazorpay(): Promise<void> {
  if (window.Razorpay) return Promise.resolve();
  if (!razorpayScript) {
    const scriptPromise = new Promise<void>((resolve, reject) => {
      const script = document.createElement("script");
      script.src = "https://checkout.razorpay.com/v1/checkout.js";
      script.async = true;
      script.onload = () =>
        window.Razorpay ? resolve() : reject(new Error("Razorpay checkout did not load"));
      script.onerror = () =>
        reject(
          new Error("Could not load the Razorpay payment page. Check your internet connection."),
        );
      document.head.appendChild(script);
    });
    razorpayScript = scriptPromise.catch((error: unknown) => {
      razorpayScript = undefined;
      throw error;
    });
    return scriptPromise;
  }
  return razorpayScript ?? Promise.resolve();
}

export const Route = createFileRoute("/checkout")({
  ssr: false,
  validateSearch: (s: Record<string, unknown>): { item?: WatchTone } =>
    watches.some((w) => w.id === s["item"]) ? { item: s["item"] as WatchTone } : {},
  head: () => ({
    meta: [
      { title: "Checkout — BIG-B" },
      {
        name: "description",
        content: "Add your delivery address and place your order with BIG-B.",
      },
      { property: "og:title", content: "Checkout — BIG-B" },
      {
        property: "og:description",
        content: "Add your delivery address and place your order with BIG-B.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: Checkout,
});

function Checkout() {
  const { item } = Route.useSearch();
  const fromCart = !item;
  const c = useCart();
  const [single, setSingle] = useState(1);
  const lines: { id: string; qty: number }[] = fromCart ? c.items : [{ id: item, qty: single }];
  const setQty = (id: string, q: number) => {
    if (fromCart) cart.setQty(id, q);
    else setSingle(Math.max(1, q));
  };
  const [a, setA] = useState<Address>(EMPTY);
  const [step, setStep] = useState<1 | 2 | 3>(1);
  const [placed, setPlaced] = useState<{
    id: string;
    total: number;
    count: number;
    payment: "cod" | "razorpay";
  } | null>(null);
  const [busy, setBusy] = useState(false);
  const [locationBusy, setLocationBusy] = useState(false);
  const [locationAccuracy, setLocationAccuracy] = useState<number | null>(null);
  const { user, ready } = useCustomer();
  const stock = useStock();
  const [codOk, setCodOk] = useState(false);
  const [paymentMethod, setPaymentMethod] = useState<"cod" | "razorpay">("cod");
  const short = stock ? lines.filter((l) => (stock[l.id] ?? 0) < l.qty) : [];
  useEffect(() => {
    try {
      const r = localStorage.getItem(KEY);
      if (r) setA(JSON.parse(r) as Address);
    } catch {
      /* ignore */
    }
  }, []);
  const set =
    (k: keyof Address) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
      setA({ ...a, [k]: e.target.value });
  const fillFromCurrentLocation = async () => {
    if (!navigator.geolocation) {
      toast.error("Location is not available in this browser");
      return;
    }
    setLocationBusy(true);
    try {
      const position = await new Promise<GeolocationPosition>((resolve, reject) => {
        navigator.geolocation.getCurrentPosition(resolve, reject, {
          enableHighAccuracy: true,
          timeout: 12000,
          maximumAge: 30000,
        });
      });
      const params = new URLSearchParams({
        format: "jsonv2",
        lat: String(position.coords.latitude),
        lon: String(position.coords.longitude),
        addressdetails: "1",
        "accept-language": "en",
      });
      const response = await fetch(`https://nominatim.openstreetmap.org/reverse?${params}`);
      if (!response.ok) throw new Error("Could not look up an address for this location");
      const result = (await response.json()) as {
        display_name?: string;
        address?: ReverseGeocodedAddress;
      };
      const address = result.address;
      if (!address) throw new Error("No address was found for this location");
      const street = formatStreetAddress(address) || result.display_name || "";
      const locality = getAddressLocality(address);
      const city = getAddressCity(address);
      setA((current) => ({
        ...current,
        address: street || current.address,
        locality: locality || current.locality,
        city: city || current.city,
        state: address.state || current.state,
        pincode: address.postcode || current.pincode,
      }));
      setLocationAccuracy(position.coords.accuracy);
      toast.success(
        "Nearby address details added. Check the house/building and street before saving.",
      );
    } catch (error) {
      if (
        typeof error === "object" &&
        error !== null &&
        "code" in error &&
        typeof error.code === "number"
      ) {
        const message =
          error.code === 1
            ? "Allow location access in your browser to use this option"
            : error.code === 3
              ? "Location request timed out. Please try again"
              : "Could not get your location. Please try again";
        toast.error(message);
      } else {
        toast.error(
          error instanceof Error ? error.message : "Could not find an address for your location",
        );
      }
    } finally {
      setLocationBusy(false);
    }
  };
  const saveAddress = () => {
    if (
      !a.name.trim() ||
      !/^[6-9]\d{9}$/.test(a.mobile) ||
      !/^\d{6}$/.test(a.pincode) ||
      !a.address.trim() ||
      !a.city.trim() ||
      !a.state.trim()
    ) {
      toast.error("Fill name, 10-digit mobile, 6-digit pincode, address, city and state");
      return;
    }
    localStorage.setItem(KEY, JSON.stringify(a));
    setStep(2);
  };
  const count = lines.reduce((s, l) => s + l.qty, 0);
  const total = lines.reduce((s, l) => s + l.qty * prices[l.id], 0);

  const placeOrder = async () => {
    if (lines.length === 0) {
      toast.error("Your cart is empty");
      return;
    }
    if (!user) {
      toast.error("Please sign in to place your order");
      return;
    }
    if (short.length) {
      toast.error("Some watches are out of stock — reduce the quantity");
      return;
    }
    if (paymentMethod === "cod" && !codOk) {
      toast.error("Please confirm you will answer our confirmation call");
      return;
    }
    if (paymentMethod === "razorpay") {
      setBusy(true);
      try {
        const order = await createPaymentOrder({
          data: { items: lines.map((line) => ({ id: line.id, qty: line.qty })), address: a },
        });
        await loadRazorpay();
        if (!window.Razorpay)
          throw new Error("Razorpay checkout is unavailable. Please try again.");
        const checkout = new window.Razorpay({
          key: order.keyId,
          amount: order.amount,
          currency: order.currency,
          name: "BIG-B",
          description: "Watch order",
          order_id: order.razorpayOrderId,
          prefill: { name: a.name, contact: a.mobile },
          theme: { color: "#c9a45c" },
          handler: (response) => {
            void (async () => {
              try {
                const confirmed = await verifyPayment({
                  data: {
                    orderId: order.orderId,
                    razorpayOrderId: response.razorpay_order_id,
                    razorpayPaymentId: response.razorpay_payment_id,
                    razorpaySignature: response.razorpay_signature,
                  },
                });
                if (fromCart) cart.clear();
                setPlaced({
                  id: confirmed.orderId,
                  total: confirmed.total,
                  count,
                  payment: "razorpay",
                });
                toast.success("Payment received and order confirmed!");
              } catch (error) {
                toast.error(
                  error instanceof Error
                    ? error.message
                    : "Could not verify payment. Please contact support if money was deducted.",
                );
              } finally {
                setBusy(false);
              }
            })();
          },
          modal: { ondismiss: () => setBusy(false) },
        });
        checkout.on("payment.failed", (event) => {
          setBusy(false);
          toast.error(event.error?.description || "Payment failed. You have not placed an order.");
        });
        checkout.open();
      } catch (error) {
        setBusy(false);
        toast.error(
          error instanceof Error
            ? error.message
            : "Could not start online payment. Please try again.",
        );
      }
      return;
    }

    setBusy(true);
    try {
      const order = await createCodOrder({
        data: { items: lines.map(({ id, qty }) => ({ id, qty })), address: a },
      });
      if (fromCart) cart.clear();
      setPlaced({ id: order.orderId, total: order.total, count, payment: "cod" });
      if (order.notifications.email === "sent" && order.notifications.sms === "sent") {
        toast.success("Order placed! Email and SMS confirmations sent.", { icon: <CheckCircle2 /> });
      } else {
        const failedChannels = [
          ...(order.notifications.email === "failed" ? ["email"] : []),
          ...(order.notifications.sms === "failed" ? ["SMS"] : []),
        ];
        toast.warning(
          `Order placed, but the ${failedChannels.join(" and ")} confirmation could not be sent.`,
          { duration: 7000 },
        );
      }
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not place order");
      setBusy(false);
      return;
    }
    setBusy(false);
  };

  if (!placed && lines.length === 0)
    return (
      <main className="shop-page co-checkout-page">
        <ShopHeader />
        <div className="co-grid">
          <section className="co-step">
            <h2>Your cart is empty</h2>
            <p className="fk-muted">Add a watch to your cart to check out.</p>
            <Link to="/collection" className="fk-buy co-continue">
              Browse watches
            </Link>
          </section>
        </div>
      </main>
    );

  return (
    <main className="shop-page co-checkout-page">
      <ShopHeader />
      <div className="co-grid">
        <div className="co-steps">
          <section className="co-step">
            <h2>
              <span>1</span> Delivery address
            </h2>
            {step === 1 ? (
              <div className="co-form">
                <button
                  type="button"
                  className="fk-buy co-wide"
                  onClick={() => void fillFromCurrentLocation()}
                  disabled={locationBusy}
                >
                  <LocateFixed size={16} />{" "}
                  {locationBusy ? "Finding your location…" : "Use my current location"}
                </button>
                <p className="co-location-note co-wide">
                  Location fills the address details available on the map
                  {locationAccuracy !== null
                    ? ` (GPS accuracy about ±${Math.round(locationAccuracy)} m)`
                    : ""}
                  . Map data may not include your exact house or apartment, so review and complete
                  the address before continuing.
                </p>
                <input
                  className="shop-input"
                  placeholder="Full name"
                  value={a.name}
                  onChange={set("name")}
                />
                <input
                  className="shop-input"
                  placeholder="10-digit mobile number"
                  inputMode="numeric"
                  maxLength={10}
                  value={a.mobile}
                  onChange={(e) => setA({ ...a, mobile: e.target.value.replace(/\D/g, "") })}
                />
                <input
                  className="shop-input"
                  placeholder="Pincode"
                  inputMode="numeric"
                  maxLength={6}
                  value={a.pincode}
                  onChange={(e) => setA({ ...a, pincode: e.target.value.replace(/\D/g, "") })}
                />
                <input
                  className="shop-input"
                  placeholder="Locality"
                  value={a.locality}
                  onChange={set("locality")}
                />
                <textarea
                  className="shop-input co-wide"
                  rows={3}
                  placeholder="Address (house no, building, street, area)"
                  value={a.address}
                  onChange={set("address")}
                />
                <input
                  className="shop-input"
                  placeholder="City / District / Town"
                  value={a.city}
                  onChange={set("city")}
                />
                <input
                  className="shop-input"
                  placeholder="State"
                  value={a.state}
                  onChange={set("state")}
                />
                <input
                  className="shop-input co-wide"
                  placeholder="Landmark (optional)"
                  value={a.landmark}
                  onChange={set("landmark")}
                />
                <div className="co-type co-wide">
                  Address type
                  {(["Home", "Work"] as const).map((t) => (
                    <label key={t}>
                      <input
                        type="radio"
                        checked={a.type === t}
                        onChange={() => setA({ ...a, type: t })}
                      />{" "}
                      {t}
                    </label>
                  ))}
                </div>
                <button type="button" className="fk-buy co-wide" onClick={saveAddress}>
                  Save and deliver here
                </button>
              </div>
            ) : (
              <div className="co-summary-line">
                <MapPin size={16} />
                <p>
                  <b>{a.name}</b> <span className="co-tag">{a.type}</span> {a.mobile}
                  <br />
                  {a.address}, {a.locality && `${a.locality}, `}
                  {a.city}, {a.state} — <b>{a.pincode}</b>
                </p>
                {!placed && (
                  <button type="button" className="co-change" onClick={() => setStep(1)}>
                    Change
                  </button>
                )}
              </div>
            )}
          </section>
          <section className="co-step">
            <h2>
              <span>2</span> Order summary
            </h2>
            {step >= 2 && !placed && (
              <div className="co-items">
                {lines.map((l) => {
                  const w = watches.find((x) => x.id === l.id)!;
                  return (
                    <div key={l.id} className="co-item">
                      <img src={w.image} alt={w.name} />
                      <div>
                        <p className="fk-title co-item-name">{w.name}</p>
                        <p className="fk-muted">{w.finish}</p>
                        <p className="fk-price">{usd(prices[l.id])}</p>
                        <div className="co-qty">
                          <button
                            type="button"
                            aria-label="Decrease quantity"
                            onClick={() => setQty(l.id, fromCart ? l.qty - 1 : l.qty - 1)}
                          >
                            −
                          </button>
                          <span>{l.qty}</span>
                          <button
                            type="button"
                            aria-label="Increase quantity"
                            onClick={() => setQty(l.id, l.qty + 1)}
                          >
                            +
                          </button>
                          {fromCart && (
                            <button
                              type="button"
                              aria-label={`Remove ${w.name}`}
                              onClick={() => cart.setQty(l.id, 0)}
                            >
                              <Trash2 size={14} />
                            </button>
                          )}
                        </div>
                      </div>
                      {stock && (stock[l.id] ?? 0) < l.qty && (
                        <p className="fk-pin-msg is-err">
                          {(stock[l.id] ?? 0) <= 0 ? "Out of stock" : `Only ${stock[l.id]} left`}
                        </p>
                      )}
                      <span className="co-item-sub">{usd(prices[l.id] * l.qty)}</span>
                    </div>
                  );
                })}
              </div>
            )}
          </section>
          <section className="co-step">
            <h2>
              <span>3</span> Payment
            </h2>
            {step >= 2 && !placed && (
              <div className="co-pay">
                <label>
                  <input
                    type="radio"
                    name="payment-method"
                    checked={paymentMethod === "cod"}
                    onChange={() => setPaymentMethod("cod")}
                  />{" "}
                  Cash on delivery — pay when your watch arrives
                </label>
                <label aria-disabled="true" style={{ opacity: 0.55, cursor: "not-allowed" }}>
                  <input type="radio" name="payment-method" disabled checked={false} readOnly /> Pay
                  online with UPI, cards, or net banking — <b>Coming soon</b>
                </label>
                {paymentMethod === "cod" && (
                  <label>
                    <input
                      type="checkbox"
                      checked={codOk}
                      onChange={(e) => setCodOk(e.target.checked)}
                    />{" "}
                    I will answer a confirmation call on {a.mobile} before dispatch
                  </label>
                )}
                {ready && !user && (
                  <p className="fk-pin-msg is-err">
                    Please <Link to="/auth">sign in</Link> to place your order so you can track it.
                  </p>
                )}
              </div>
            )}
            {placed && (
              <div className="co-pay">
                <p>
                  <CheckCircle2 size={18} className="fk-delivery-free" /> <b>Order confirmed!</b>
                </p>
                <p>
                  Order ID: <b>{placed.id}</b>
                </p>
                {placed.payment === "cod" ? (
                  <p>
                    Pay <b>{usd(placed.total)}</b> in cash when your{" "}
                    {placed.count > 1 ? `${placed.count} watches arrive` : "watch arrives"} in{" "}
                    {a.city}. We will call {a.mobile} to confirm before dispatch. Estimated
                    delivery: 3–5 business days.
                  </p>
                ) : (
                  <p>
                    We received your online payment of <b>{usd(placed.total)}</b>. Your order will
                    be shipped to {a.city}. Estimated delivery: 3–5 business days.
                  </p>
                )}
                <Link to="/invoice/$orderId" params={{ orderId: placed.id }} className="co-change">
                  View / print invoice
                </Link>
                <Link
                  to="/account"
                  search={{ tab: "orders", order: placed.id }}
                  className="fk-buy co-continue"
                >
                  Track my order
                </Link>
                <Link to="/collection" className="co-change">
                  Continue shopping
                </Link>
              </div>
            )}
          </section>
        </div>
        {!placed && (
          <aside className="co-price">
            <h3>Price details</h3>
            {lines.map((l) => {
              const w = watches.find((x) => x.id === l.id)!;
              return (
                <div key={l.id}>
                  <span>
                    {w.name} × {l.qty}
                  </span>
                  <span>{usd(prices[l.id] * l.qty)}</span>
                </div>
              );
            })}
            <div>
              <span>
                Price ({count} item{count > 1 ? "s" : ""})
              </span>
              <span>{usd(total)}</span>
            </div>
            <div>
              <span>Delivery charges</span>
              <span className="fk-delivery-free">Free</span>
            </div>
            <div className="co-total">
              <span>Total amount</span>
              <span>{usd(total)}</span>
            </div>
            {step === 2 && (
              <button type="button" className="fk-buy co-price-continue" onClick={() => setStep(3)}>
                Continue
              </button>
            )}
            {step === 3 && (
              <button
                type="button"
                className="fk-buy co-price-continue"
                disabled={busy || !user || short.length > 0 || (paymentMethod === "cod" && !codOk)}
                onClick={() => void placeOrder()}
              >
                {busy
                  ? "Please wait…"
                  : paymentMethod === "razorpay"
                    ? `Pay online · ${usd(total)}`
                    : `Place order · ${usd(total)}`}
              </button>
            )}
            <ul className="co-badges">
              <li>
                <BadgeCheck size={16} /> 100% Original
              </li>
              <li>
                <ShieldCheck size={16} /> 2-Year Warranty
              </li>
              <li>
                <RotateCcw size={16} /> 7-Day Easy Returns
              </li>
              <li>
                <Truck size={16} /> Free Insured Shipping
              </li>
            </ul>
            <a
              className="fk-wa"
              href={whatsappLink(
                `Hi! I'd like help ordering: ${lines.map((l) => `${watches.find((x) => x.id === l.id)!.name} × ${l.qty}`).join(", ")} (total ${usd(total)}).`,
              )}
              target="_blank"
              rel="noopener noreferrer"
            >
              <MessageCircle size={16} /> Need help? Order on WhatsApp
            </a>
            {item ? (
              <Link to="/shop/$watchId" params={{ watchId: item }} className="co-change">
                ← Back to product
              </Link>
            ) : (
              <Link to="/collection" className="co-change">
                ← Keep shopping
              </Link>
            )}
          </aside>
        )}
      </div>
    </main>
  );
}
