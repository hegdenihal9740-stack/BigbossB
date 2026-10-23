import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { watches } from "@/lib/watches";
import { prices } from "@/lib/cart";
import { BUILT_IN, ensureProducts, photoToDataUrl, slugify, type ProductRow } from "@/lib/products";
import { createStoreProduct, updateStoreProduct, updateStoreStock } from "@/lib/store.functions";
const BUILT_NAMES: Record<string, string> = {
  steel: "Steel Diver",
  black: "Black Skeleton",
  gold: "Gold Chronograph",
  rosegold: "Rose Gold",
};

export function ProductManager() {
  const [rows, setRows] = useState<ProductRow[]>([]);
  const [stock, setStock] = useState<Record<string, number>>({});
  const [msg, setMsg] = useState("");
  async function load() {
    const [{ data: p, error: productError }, { data: s, error: stockError }] = await Promise.all([
      supabase.from("products").select("*").order("created_at"),
      supabase.from("inventory").select("watch_id, stock"),
    ]);
    if (productError || stockError) {
      console.error("Could not load seller products and inventory.", productError ?? stockError);
      setMsg("Could not load watches or stock. Please refresh and try again.");
      return;
    }
    setRows(p ?? []);
    setStock(Object.fromEntries((s ?? []).map((r) => [r.watch_id, r.stock])));
    setMsg("");
  }
  useEffect(() => {
    void load().catch((error: unknown) => {
      console.error("Could not load seller products.", error);
      setMsg("Could not load watches or stock. Please try again.");
    });
  }, []);
  const refresh = async () => {
    await load();
    await ensureProducts(true);
  };

  async function saveStock(id: string, n: number) {
    const v = Math.max(0, Math.floor(n));
    try {
      await updateStoreStock({ data: { id, stock: v } });
      setMsg("Stock updated.");
      setStock((s) => ({ ...s, [id]: v }));
    } catch (error) {
      console.error("Could not update stock.", error);
      setMsg(error instanceof Error ? error.message : "Could not update stock.");
    }
  }

  const all = [
    ...BUILT_IN.map((id) => ({
      id,
      name: BUILT_NAMES[id]!,
      price: prices[id as keyof typeof prices],
      image: watches.find((w) => w.id === id)?.image as string,
      row: null as ProductRow | null,
    })),
    ...rows.map((r) => ({ id: r.id, name: r.name, price: r.price, image: r.image_url, row: r })),
  ];

  return (
    <div className="space-y-4">
      <AddWatch onAdded={refresh} />
      {msg && (
        <p className="text-sm" role="status">
          {msg}
        </p>
      )}
      <h2 className="text-lg font-semibold">Your watches & stock</h2>
      {all.map((p) => (
        <ProductRowCard
          key={p.id}
          {...p}
          stock={stock[p.id] ?? 0}
          onStock={(n) => saveStock(p.id, n)}
          onChanged={refresh}
        />
      ))}
    </div>
  );
}

function ProductRowCard({
  id,
  name,
  price,
  image,
  row,
  stock,
  onStock,
  onChanged,
}: {
  id: string;
  name: string;
  price: number;
  image: string;
  row: ProductRow | null;
  stock: number;
  onStock: (n: number) => void;
  onChanged: () => void;
}) {
  const [n, setN] = useState(String(stock));
  const [p, setP] = useState(String(price));
  const [err, setErr] = useState("");
  useEffect(() => setN(String(stock)), [stock]);
  async function patch(v: Partial<ProductRow>) {
    setErr("");
    try {
      await updateStoreProduct({ data: { id, changes: v } });
      await onChanged();
    } catch (error) {
      console.error("Could not update product.", error);
      setErr(error instanceof Error ? error.message : "Could not update product.");
    }
  }
  return (
    <article className="acc-card flex flex-wrap items-center gap-3">
      {image && <img src={image} alt={name} className="h-14 w-14 rounded object-cover" />}
      <div className="min-w-32 flex-1">
        <b>{name}</b>
        <p className="text-xs text-muted-foreground">
          {stock <= 0 ? "Out of stock" : `${stock} in stock`}
          {row && !row.active ? " · Hidden" : ""}
          {!row ? " · Original" : ""}
        </p>
      </div>
      <div className="flex items-center gap-1">
        <Button
          size="sm"
          variant="outline"
          onClick={() => onStock(stock - 1)}
          aria-label="Less stock"
        >
          −
        </Button>
        <Input
          className="w-16"
          inputMode="numeric"
          value={n}
          onChange={(e) => setN(e.target.value)}
          onBlur={() => Number(n) !== stock && onStock(Number(n) || 0)}
          aria-label="Stock"
        />
        <Button
          size="sm"
          variant="outline"
          onClick={() => onStock(stock + 1)}
          aria-label="More stock"
        >
          +
        </Button>
        <Button size="sm" variant="outline" onClick={() => onStock(0)}>
          Mark sold out
        </Button>
      </div>
      {row && (
        <div className="flex items-center gap-1">
          <span className="text-sm">₹</span>
          <Input
            className="w-24"
            inputMode="numeric"
            value={p}
            onChange={(e) => setP(e.target.value)}
            onBlur={() => Number(p) > 0 && Number(p) !== price && patch({ price: Number(p) })}
            aria-label="Price"
          />
          <Button size="sm" variant="outline" onClick={() => patch({ active: !row.active })}>
            {row.active ? "Hide" : "Show"}
          </Button>
        </div>
      )}
      {err && (
        <p role="alert" className="w-full text-sm text-destructive">
          {err}
        </p>
      )}
    </article>
  );
}

function AddWatch({ onAdded }: { onAdded: () => void }) {
  const empty = {
    name: "",
    finish: "",
    price: "",
    list: "",
    stock: "10",
    description: "",
    details: "",
  };
  const [f, setF] = useState(empty);
  const [img, setImg] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const set = (k: keyof typeof empty) => (e: { target: { value: string } }) =>
    setF((s) => ({ ...s, [k]: e.target.value }));

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setErr("");
    const price = Number(f.price),
      stock = Number(f.stock);
    if (
      !f.name.trim() ||
      !img ||
      !Number.isSafeInteger(price) ||
      price < 1 ||
      !Number.isSafeInteger(stock) ||
      stock < 0
    ) {
      setErr("Add a name, a photo, a whole-number price and valid stock.");
      return;
    }
    const listPrice = f.list ? Number(f.list) : price;
    if (!Number.isSafeInteger(listPrice) || listPrice < price) {
      setErr("MRP must be a whole number at least as high as the price.");
      return;
    }
    setBusy(true);
    const id = `${slugify(f.name) || "watch"}-${crypto.randomUUID().slice(0, 8)}`;
    const details = f.details
      .split(/[\n,]/)
      .map((s) => s.trim())
      .filter(Boolean);
    try {
      await createStoreProduct({
        data: {
          product: {
            id,
            name: f.name.trim(),
            finish: f.finish.trim(),
            price,
            list_price: listPrice,
            description: f.description.trim(),
            details,
            image_url: img,
          },
          stock: Math.max(0, Math.floor(stock || 0)),
        },
      });
      setF(empty);
      setImg("");
      await onAdded();
    } catch (error) {
      console.error("Could not add product.", error);
      setErr(error instanceof Error ? error.message : "Could not add the watch.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} className="acc-card space-y-2">
      <h2 className="text-lg font-semibold">Add new watch</h2>
      <label className="block text-sm">
        Photo
        <input
          type="file"
          accept="image/*"
          className="mt-1 block text-sm"
          onChange={async (e) => {
            const file = e.target.files?.[0];
            if (file)
              try {
                setImg(await photoToDataUrl(file));
              } catch {
                setErr("Could not read that photo.");
              }
          }}
        />
      </label>
      {img && <img src={img} alt="Preview" className="h-32 w-32 rounded object-cover" />}
      <Input placeholder="Watch name (e.g. Titanium Diver)" value={f.name} onChange={set("name")} />
      <Input
        placeholder="Finish (e.g. Brushed titanium)"
        value={f.finish}
        onChange={set("finish")}
      />
      <div className="grid grid-cols-3 gap-2">
        <Input placeholder="Price ₹" inputMode="numeric" value={f.price} onChange={set("price")} />
        <Input placeholder="MRP ₹" inputMode="numeric" value={f.list} onChange={set("list")} />
        <Input placeholder="Stock" inputMode="numeric" value={f.stock} onChange={set("stock")} />
      </div>
      <textarea
        className="w-full rounded-md border border-input bg-background p-2 text-sm"
        rows={3}
        placeholder="Short description"
        value={f.description}
        onChange={set("description")}
      />
      <Input
        placeholder="Features, comma separated (e.g. 42mm case, Sapphire glass)"
        value={f.details}
        onChange={set("details")}
      />
      {err && (
        <p className="text-sm text-destructive" role="alert">
          {err}
        </p>
      )}
      <Button type="submit" disabled={busy}>
        {busy ? "Adding…" : "Add watch"}
      </Button>
    </form>
  );
}
