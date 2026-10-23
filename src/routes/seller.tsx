import { createFileRoute, Link } from "@tanstack/react-router";
import { useCallback, useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useCustomer } from "@/components/CustomerAccounts";
import { ShopHeader } from "@/components/ShopHeader";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  COURIERS,
  STATUS_LABELS,
  STATUSES,
  fromRow,
  trackingLink,
  type Order,
  type OrderRow,
} from "@/lib/orders";
import { watches } from "@/lib/watches";
import { ProductManager } from "@/components/ProductManager";
import { STORE_CONTACT } from "@/lib/store-info";
import { notifyCancelledStoreOrder, updateStoreOrder } from "@/lib/store.functions";

export const Route = createFileRoute("/seller")({
  ssr: false,
  head: () => ({
    meta: [
      { title: "Seller dashboard — BIG-B" },
      { name: "description", content: "Manage BIG-B orders, statuses and tracking." },
      { property: "og:title", content: "Seller dashboard — BIG-B" },
      { property: "og:description", content: "BIG-B store owner order management." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: SellerPage,
});

const inr = (n: number) => `₹${n.toLocaleString("en-IN")}`;
const ALL = [...STATUSES, "cancelled"] as string[];
function SellerPage() {
  const { user, ready } = useCustomer();
  const [role, setRole] = useState<"loading" | "admin" | "none" | "taken" | "error">("loading");
  const [orders, setOrders] = useState<Order[]>([]);
  const [filter, setFilter] = useState("all");
  const [q, setQ] = useState("");
  const [err, setErr] = useState("");
  const [tab, setTab] = useState<"orders" | "products" | "settings">("orders");

  const checkRole = useCallback(async () => {
    if (!user) {
      setRole("none");
      return;
    }
    try {
      const { data, error } = await supabase.rpc("has_role", { _user_id: user.id, _role: "admin" });
      if (error) throw error;
      if (data) {
        setRole("admin");
        return;
      }
      const { data: owned, error: ownerError } = await supabase.rpc("store_has_owner");
      if (ownerError) throw ownerError;
      setRole(owned ? "taken" : "none");
    } catch (error) {
      console.error("Could not verify seller access.", error);
      setErr("Could not verify store access. Please refresh and try again.");
      setRole("error");
    }
  }, [user]);
  const load = useCallback(async () => {
    try {
      const { data, error } = await supabase
        .from("orders")
        .select("*")
        .order("created_at", { ascending: false });
      if (error) throw error;
      setErr("");
      setOrders((data as OrderRow[]).map(fromRow));
    } catch (error) {
      console.error("Could not load seller orders.", error);
      setErr("Could not load orders. Please refresh and try again.");
    }
  }, []);
  useEffect(() => {
    void checkRole();
  }, [checkRole]);
  useEffect(() => {
    if (role === "admin") void load();
  }, [load, role]);

  async function claim() {
    try {
      const { data, error } = await supabase.rpc("claim_store_owner");
      if (error) throw error;
      if (!data) throw new Error("Store ownership is already assigned to another account.");
      setRole("admin");
      setErr("");
    } catch (error) {
      console.error("Could not claim store ownership.", error);
      setErr(error instanceof Error ? error.message : "Could not claim the store.");
    }
  }

  const shown = useMemo(
    () =>
      orders.filter(
        (o) =>
          (filter === "all" || (o.status ?? "confirmed") === filter) &&
          (!q ||
            `${o.id} ${o.address?.name} ${o.address?.mobile}`
              .toLowerCase()
              .includes(q.toLowerCase())),
      ),
    [orders, filter, q],
  );
  const revenue = orders.filter((o) => o.status !== "cancelled").reduce((s, o) => s + o.total, 0);
  const count = (s: string) => orders.filter((o) => (o.status ?? "confirmed") === s).length;

  let body;
  if (!ready || (user && role === "loading")) body = <p>Loading…</p>;
  else if (!user)
    body = (
      <p>
        Please{" "}
        <Link to="/auth" className="underline">
          sign in
        </Link>{" "}
        to open the seller dashboard.
      </p>
    );
  else if (role === "none")
    body = (
      <div className="space-y-3">
        <p>This store has no owner yet. Claim it to manage orders.</p>
        <Button onClick={claim}>Claim store ownership</Button>
      </div>
    );
  else if (role === "taken") body = <p>This page is only for the store owner.</p>;
  else if (role === "error")
    body = <p role="alert">Store access could not be checked. Please refresh and try again.</p>;
  else
    body = (
      <>
        <div className="flex gap-2">
          <Button
            variant={tab === "orders" ? "default" : "outline"}
            onClick={() => setTab("orders")}
          >
            Orders
          </Button>
          <Button
            variant={tab === "products" ? "default" : "outline"}
            onClick={() => setTab("products")}
          >
            Products
          </Button>
          <Button
            variant={tab === "settings" ? "default" : "outline"}
            onClick={() => setTab("settings")}
          >
            Owner settings
          </Button>
        </div>
        {tab === "settings" ? (
          <TransferOwner onDone={() => setRole("taken")} />
        ) : tab === "products" ? (
          <ProductManager />
        ) : (
          <>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
              {[
                ["Revenue", inr(revenue)],
                ["To pack", count("confirmed")],
                ["In transit", count("shipped") + count("out_for_delivery") + count("packed")],
                ["Delivered", count("delivered")],
              ].map(([k, v]) => (
                <div key={k} className="rounded-lg border border-border p-3">
                  <p className="text-xs text-muted-foreground">{k}</p>
                  <p className="text-lg font-semibold">{v}</p>
                </div>
              ))}
            </div>
            <div className="flex flex-wrap gap-2">
              {["all", ...ALL].map((s) => (
                <Button
                  key={s}
                  size="sm"
                  variant={filter === s ? "default" : "outline"}
                  onClick={() => setFilter(s)}
                >
                  {s === "all" ? "All" : STATUS_LABELS[s]}
                </Button>
              ))}
            </div>
            <Input
              placeholder="Search order ID, name or phone"
              value={q}
              onChange={(e) => setQ(e.target.value)}
            />
            {shown.length === 0 ? (
              <p className="text-muted-foreground">No orders.</p>
            ) : (
              shown.map((o) => <OrderCard key={o.id} order={o} onSaved={load} />)
            )}
          </>
        )}
      </>
    );

  return (
    <main className="shop-page acc-page seller-page">
      <ShopHeader />
      <div className="acc-wrap space-y-4">
        <h1 className="acc-h">Seller dashboard</h1>
        <p className="seller-owner-email">
          Store owner email: <a href={`mailto:${STORE_CONTACT.email}`}>{STORE_CONTACT.email}</a>
        </p>
        {err && (
          <p role="alert" className="text-destructive">
            {err}
          </p>
        )}
        {body}
      </div>
    </main>
  );
}

function OrderCard({ order: o, onSaved }: { order: Order; onSaved: () => void }) {
  const [status, setStatus] = useState(o.status ?? "confirmed");
  const [courier, setCourier] = useState(o.courier ?? "");
  const [awb, setAwb] = useState(o.awb ?? "");
  const [url, setUrl] = useState(o.trackingUrl ?? "");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");
  async function save() {
    setBusy(true);
    setMsg("");
    try {
      if (status === "cancelled") {
        if (o.status === "cancelled") {
          setMsg("This order is already cancelled.");
          return;
        }
        if (!confirm("Cancel this order? Stock will be returned.")) return;
        const { data, error } = await supabase.rpc("cancel_order", { _order_id: o.id });
        if (error) throw error;
        if (!data) throw new Error("This order can no longer be cancelled.");
        let notificationMessage = "";
        try {
          const notifications = await notifyCancelledStoreOrder({ data: { id: o.id } });
          const failedChannels = [
            ...(notifications.email === "failed" ? ["email"] : []),
            ...(notifications.sms === "failed" ? ["SMS"] : []),
          ];
          if (failedChannels.length) {
            notificationMessage = ` Notifications failed for ${failedChannels.join(" and ")}.`;
          }
        } catch (notificationError) {
          console.error("Order was cancelled, but notifications could not be sent.", notificationError);
          notificationMessage = " Notifications could not be sent.";
        }
        setMsg(`Cancelled.${notificationMessage}`);
        await onSaved();
        return;
      }
      const result = await updateStoreOrder({
        data: {
          id: o.id,
          changes: {
            status: status as (typeof STATUSES)[number],
            courier: courier ? (courier as keyof typeof COURIERS) : null,
            awb: awb.trim() || null,
            tracking_url: url.trim() || null,
          },
        },
      });
      const failedChannels = [
        ...(result.notifications?.email === "failed" ? ["email"] : []),
        ...(result.notifications?.sms === "failed" ? ["SMS"] : []),
      ];
      setMsg(
        failedChannels.length
          ? `Saved, but notifications failed for ${failedChannels.join(" and ")}.`
          : "Saved.",
      );
      await onSaved();
    } catch (error) {
      console.error("Could not save order updates.", error);
      setMsg(error instanceof Error ? error.message : "Save failed.");
    } finally {
      setBusy(false);
    }
  }
  const link = trackingLink({ courier, awb, trackingUrl: url });
  return (
    <article className="acc-card space-y-2">
      <div className="flex flex-wrap justify-between gap-2">
        <b>#{o.id}</b>
        <span className="text-sm text-muted-foreground">
          {new Date(o.placedAt).toLocaleString("en-IN")}
        </span>
      </div>
      <p className="text-sm">
        {o.items
          .map((l) => `${watches.find((w) => w.id === l.id)?.name ?? l.id} × ${l.qty}`)
          .join(", ")}{" "}
        · <b>{inr(o.total)}</b> · {o.payment === "cod" ? "Cash on delivery" : o.payment}
      </p>
      {o.address && (
        <p className="text-sm text-muted-foreground">
          {o.address.name}, {o.address.address}, {o.address.city}, {o.address.state} —{" "}
          {o.address.pincode} · {o.address.mobile}
        </p>
      )}
      <div className="grid gap-2 sm:grid-cols-3">
        <select
          className="rounded-md border border-input bg-background p-2 text-sm"
          value={status}
          onChange={(e) => setStatus(e.target.value)}
          aria-label="Status"
        >
          {ALL.map((s) => (
            <option key={s} value={s}>
              {STATUS_LABELS[s]}
            </option>
          ))}
        </select>
        <select
          className="rounded-md border border-input bg-background p-2 text-sm"
          value={courier}
          onChange={(e) => setCourier(e.target.value)}
          aria-label="Courier"
        >
          <option value="">Courier…</option>
          {Object.keys(COURIERS).map((c) => (
            <option key={c}>{c}</option>
          ))}
        </select>
        <Input
          placeholder="Tracking / AWB number"
          value={awb}
          onChange={(e) => setAwb(e.target.value)}
        />
      </div>
      {courier === "Other" && (
        <Input
          placeholder="Tracking link (https://…)"
          value={url}
          onChange={(e) => setUrl(e.target.value)}
        />
      )}
      <div className="flex flex-wrap items-center gap-3">
        <Button size="sm" disabled={busy} onClick={save}>
          {busy ? "Saving…" : "Save"}
        </Button>
        {link && (
          <a className="text-sm underline" href={link} target="_blank" rel="noreferrer">
            Track ↗
          </a>
        )}
        <Link to="/invoice/$orderId" params={{ orderId: o.id }} className="text-sm underline">
          Invoice
        </Link>
        {msg && <span className="text-sm">{msg}</span>}
      </div>
    </article>
  );
}

function TransferOwner({ onDone }: { onDone: () => void }) {
  const [email, setEmail] = useState("");
  const [msg, setMsg] = useState("");
  const [busy, setBusy] = useState(false);
  const MSGS: Record<string, string> = {
    no_account: "No account with that email. Ask them to sign up on the website first.",
    same: "That is already your account.",
    not_owner: "Only the owner can do this.",
  };
  async function go(e: React.FormEvent) {
    e.preventDefault();
    setMsg("");
    if (!email.includes("@")) {
      setMsg("Enter a valid email.");
      return;
    }
    if (!confirm(`Make ${email} the new store owner? You will lose seller access.`)) return;
    setBusy(true);
    const { data, error } = await supabase.rpc("transfer_store_owner", { _new_email: email });
    setBusy(false);
    if (error) {
      setMsg("Transfer failed, please try again.");
      return;
    }
    if (data === "ok") {
      alert(`${email} is now the store owner.`);
      onDone();
    } else setMsg(MSGS[data] ?? "Transfer failed.");
  }
  return (
    <form onSubmit={go} className="acc-card space-y-2">
      <h2 className="text-lg font-semibold">Transfer store ownership</h2>
      <p className="text-sm text-muted-foreground">
        The new owner must sign up on the website first. After transfer, only they can open this
        dashboard.
      </p>
      <Input
        type="email"
        placeholder="New owner email (e.g. company email)"
        value={email}
        onChange={(e) => setEmail(e.target.value)}
      />
      {msg && (
        <p role="alert" className="text-sm text-destructive">
          {msg}
        </p>
      )}
      <Button type="submit" disabled={busy}>
        {busy ? "Transferring…" : "Transfer ownership"}
      </Button>
    </form>
  );
}
