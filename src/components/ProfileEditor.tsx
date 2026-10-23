import { useEffect, useState, type FormEvent } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

export type Profile = {
  display_name: string;
  phone: string;
  gender: string;
  birth_date: string;
  address_line: string;
  locality: string;
  landmark: string;
  city: string;
  state: string;
  pincode: string;
  address_type: string;
};
const EMPTY: Profile = {
  display_name: "",
  phone: "",
  gender: "",
  birth_date: "",
  address_line: "",
  locality: "",
  landmark: "",
  city: "",
  state: "",
  pincode: "",
  address_type: "Home",
};

export function validateProfile(p: Profile): string | null {
  if (!p.display_name.trim()) return "Please enter your full name.";
  if (p.phone && !/^[6-9]\d{9}$/.test(p.phone)) return "Mobile number must be 10 digits.";
  if (p.pincode && !/^\d{6}$/.test(p.pincode)) return "Pincode must be 6 digits.";
  return null;
}

function Field({
  label,
  children,
  wide,
}: {
  label: string;
  children: React.ReactNode;
  wide?: boolean;
}) {
  return (
    <label className={`block space-y-2 text-sm ${wide ? "sm:col-span-2" : ""}`}>
      <span>{label}</span>
      {children}
    </label>
  );
}

export function ProfileEditor({ userId, email }: { userId: string; email: string }) {
  const [p, setP] = useState<Profile>(EMPTY);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");
  const [err, setErr] = useState("");
  const [pw, setPw] = useState("");
  const [pw2, setPw2] = useState("");
  const [pwBusy, setPwBusy] = useState(false);
  const [pwMsg, setPwMsg] = useState("");
  const [pwErr, setPwErr] = useState("");

  useEffect(() => {
    let active = true;
    setLoading(true);
    setErr("");
    void (async () => {
      try {
        const { data, error } = await supabase
          .from("profiles")
          .select("*")
          .eq("id", userId)
          .maybeSingle();
        if (error) throw error;
        if (!active) return;
        setP(data ? { ...EMPTY, ...data, birth_date: data.birth_date ?? "" } : EMPTY);
      } catch (error) {
        console.error("Could not load the customer profile.", error);
        if (active)
          setErr("Your profile could not be loaded. Check your connection and try again.");
      } finally {
        if (active) setLoading(false);
      }
    })();
    return () => {
      active = false;
    };
  }, [userId]);

  const set = (k: keyof Profile) => (e: { target: { value: string } }) =>
    setP((prev) => ({ ...prev, [k]: e.target.value }));

  async function save(e: FormEvent) {
    e.preventDefault();
    setMsg("");
    setErr("");
    const problem = validateProfile(p);
    if (problem) {
      setErr(problem);
      return;
    }
    setBusy(true);
    try {
      const { error } = await supabase.from("profiles").upsert({
        id: userId,
        ...p,
        display_name: p.display_name.trim(),
        phone: p.phone.trim(),
        address_line: p.address_line.trim(),
        locality: p.locality.trim(),
        landmark: p.landmark.trim(),
        city: p.city.trim(),
        state: p.state.trim(),
        pincode: p.pincode.trim(),
        birth_date: p.birth_date || null,
      });
      if (error) throw error;
      setMsg("Your profile has been saved.");
    } catch (error) {
      console.error("Could not save the customer profile.", error);
      setErr("Could not save your profile. Check your connection and try again.");
    } finally {
      setBusy(false);
    }
  }

  async function changePassword(e: FormEvent) {
    e.preventDefault();
    setPwMsg("");
    setPwErr("");
    if (pw.length < 8) {
      setPwErr("Password must be at least 8 characters.");
      return;
    }
    if (pw !== pw2) {
      setPwErr("Passwords do not match.");
      return;
    }
    setPwBusy(true);
    const { error } = await supabase.auth.updateUser({ password: pw });
    setPwBusy(false);
    if (error) setPwErr(error.message);
    else {
      setPwMsg("Your password has been changed.");
      setPw("");
      setPw2("");
    }
  }

  return (
    <div className="space-y-10">
      <form onSubmit={save} className="space-y-6">
        <h2 className="text-lg font-semibold">Personal information</h2>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Full name">
            <Input
              autoComplete="name"
              required
              maxLength={100}
              value={p.display_name}
              onChange={set("display_name")}
            />
          </Field>
          <Field label="Email address">
            <Input value={email} disabled />
          </Field>
          <Field label="Mobile number">
            <Input
              inputMode="numeric"
              maxLength={10}
              autoComplete="tel"
              value={p.phone}
              onChange={set("phone")}
            />
          </Field>
          <Field label="Gender">
            <select
              className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 text-sm"
              value={p.gender}
              onChange={set("gender")}
            >
              <option value="">Prefer not to say</option>
              <option>Male</option>
              <option>Female</option>
              <option>Other</option>
            </select>
          </Field>
          <Field label="Date of birth">
            <Input type="date" value={p.birth_date} onChange={set("birth_date")} />
          </Field>
        </div>
        <h2 className="pt-2 text-lg font-semibold">Address</h2>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="House no, building, street" wide>
            <Input
              autoComplete="street-address"
              maxLength={200}
              value={p.address_line}
              onChange={set("address_line")}
            />
          </Field>
          <Field label="Locality / area">
            <Input maxLength={100} value={p.locality} onChange={set("locality")} />
          </Field>
          <Field label="Landmark (optional)">
            <Input maxLength={100} value={p.landmark} onChange={set("landmark")} />
          </Field>
          <Field label="City">
            <Input
              autoComplete="address-level2"
              maxLength={60}
              value={p.city}
              onChange={set("city")}
            />
          </Field>
          <Field label="State">
            <Input
              autoComplete="address-level1"
              maxLength={60}
              value={p.state}
              onChange={set("state")}
            />
          </Field>
          <Field label="Pincode">
            <Input
              inputMode="numeric"
              maxLength={6}
              autoComplete="postal-code"
              value={p.pincode}
              onChange={set("pincode")}
            />
          </Field>
          <Field label="Address type">
            <select
              className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 text-sm"
              value={p.address_type}
              onChange={set("address_type")}
            >
              <option>Home</option>
              <option>Work</option>
            </select>
          </Field>
        </div>
        {err && (
          <p role="alert" className="text-sm text-destructive">
            {err}
          </p>
        )}
        {msg && (
          <p role="status" className="text-sm">
            {msg}
          </p>
        )}
        <Button disabled={busy || loading} className="w-full" type="submit">
          {loading ? "Loading profile…" : busy ? "Saving…" : "Save profile"}
        </Button>
      </form>

      <form onSubmit={changePassword} className="space-y-4 border-t border-border pt-8">
        <h2 className="text-lg font-semibold">Change password</h2>
        <Field label="New password">
          <Input
            type="password"
            autoComplete="new-password"
            minLength={8}
            required
            value={pw}
            onChange={(e) => setPw(e.target.value)}
          />
        </Field>
        <Field label="Confirm new password">
          <Input
            type="password"
            autoComplete="new-password"
            minLength={8}
            required
            value={pw2}
            onChange={(e) => setPw2(e.target.value)}
          />
        </Field>
        {pwErr && (
          <p role="alert" className="text-sm text-destructive">
            {pwErr}
          </p>
        )}
        {pwMsg && (
          <p role="status" className="text-sm">
            {pwMsg}
          </p>
        )}
        <Button disabled={pwBusy} variant="outline" className="w-full" type="submit">
          {pwBusy ? "Updating…" : "Change password"}
        </Button>
      </form>
    </div>
  );
}
