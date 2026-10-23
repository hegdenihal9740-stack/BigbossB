CREATE TABLE IF NOT EXISTS public.profiles (
 id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
 display_name text NOT NULL DEFAULT '',
 phone text NOT NULL DEFAULT '',
 gender text NOT NULL DEFAULT '',
 birth_date date,
 address_line text NOT NULL DEFAULT '',
 locality text NOT NULL DEFAULT '',
 landmark text NOT NULL DEFAULT '',
 city text NOT NULL DEFAULT '',
 state text NOT NULL DEFAULT '',
 pincode text NOT NULL DEFAULT '',
 address_type text NOT NULL DEFAULT 'Home',
 created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE ON public.profiles TO authenticated;
GRANT ALL ON public.profiles TO service_role;
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Customers read own profile" ON public.profiles FOR SELECT TO authenticated USING (auth.uid() = id);
CREATE POLICY "Customers create own profile" ON public.profiles FOR INSERT TO authenticated WITH CHECK (auth.uid() = id);
CREATE POLICY "Customers update own profile" ON public.profiles FOR UPDATE TO authenticated USING (auth.uid() = id) WITH CHECK (auth.uid() = id);
CREATE OR REPLACE FUNCTION public.create_customer_profile() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
 INSERT INTO public.profiles (id, display_name) VALUES (NEW.id, COALESCE(NEW.raw_user_meta_data->>'display_name', NEW.raw_user_meta_data->>'full_name', '')) ON CONFLICT (id) DO NOTHING;
 RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS create_customer_profile ON auth.users;
CREATE TRIGGER create_customer_profile AFTER INSERT ON auth.users FOR EACH ROW EXECUTE FUNCTION public.create_customer_profile();

CREATE TABLE IF NOT EXISTS public.orders (
  id text PRIMARY KEY,
  user_id uuid NOT NULL,
  items jsonb NOT NULL DEFAULT '[]'::jsonb,
  total integer NOT NULL DEFAULT 0,
  payment text NOT NULL DEFAULT 'cod',
  address jsonb NOT NULL DEFAULT '{}'::jsonb,
  status text NOT NULL DEFAULT 'confirmed',
  created_at timestamptz NOT NULL DEFAULT now(),
  courier text, awb text, tracking_url text,
  cod_confirmed boolean NOT NULL DEFAULT false,
  seller_note text,
  updated_at timestamptz NOT NULL DEFAULT now(),
  payment_reference text
);
GRANT SELECT, INSERT, UPDATE ON public.orders TO authenticated;
GRANT ALL ON public.orders TO service_role;
ALTER TABLE public.orders ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users read own orders" ON public.orders FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "Users create own orders" ON public.orders FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);

CREATE TYPE public.app_role AS ENUM ('admin','user');
CREATE TABLE public.user_roles (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE, role public.app_role NOT NULL, UNIQUE(user_id, role));
GRANT SELECT ON public.user_roles TO authenticated;
GRANT ALL ON public.user_roles TO service_role;
ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;
CREATE OR REPLACE FUNCTION public.has_role(_user_id uuid, _role public.app_role) RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$ SELECT EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = _user_id AND role = _role) $$;
CREATE POLICY "Users read own roles" ON public.user_roles FOR SELECT TO authenticated USING (auth.uid() = user_id);

CREATE OR REPLACE FUNCTION public.claim_store_owner() RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF auth.uid() IS NULL THEN RETURN false; END IF;
  IF EXISTS (SELECT 1 FROM public.user_roles WHERE role = 'admin') THEN RETURN public.has_role(auth.uid(), 'admin'); END IF;
  IF lower(coalesce(auth.jwt()->>'email','')) <> 'connect.bigb@gmail.com' THEN RETURN false; END IF;
  INSERT INTO public.user_roles (user_id, role) VALUES (auth.uid(), 'admin');
  RETURN true;
END $$;
CREATE OR REPLACE FUNCTION public.store_has_owner() RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$ SELECT EXISTS (SELECT 1 FROM public.user_roles WHERE role = 'admin') $$;
CREATE OR REPLACE FUNCTION public.transfer_store_owner(_new_email text) RETURNS text LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE target uuid;
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin') THEN RETURN 'not_owner'; END IF;
  SELECT id INTO target FROM auth.users WHERE lower(email) = lower(trim(_new_email)) LIMIT 1;
  IF target IS NULL THEN RETURN 'no_account'; END IF;
  IF target = auth.uid() THEN RETURN 'same'; END IF;
  INSERT INTO public.user_roles (user_id, role) VALUES (target, 'admin') ON CONFLICT DO NOTHING;
  DELETE FROM public.user_roles WHERE user_id = auth.uid() AND role = 'admin';
  RETURN 'ok';
END $$;
REVOKE ALL ON FUNCTION public.transfer_store_owner(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.transfer_store_owner(text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.claim_store_owner() TO authenticated;
GRANT EXECUTE ON FUNCTION public.store_has_owner() TO authenticated;
GRANT EXECUTE ON FUNCTION public.has_role(uuid, public.app_role) TO authenticated;

CREATE POLICY "Admins read all orders" ON public.orders FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "Admins update orders" ON public.orders FOR UPDATE TO authenticated USING (public.has_role(auth.uid(), 'admin')) WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE TABLE public.inventory (watch_id text PRIMARY KEY, stock integer NOT NULL DEFAULT 0, updated_at timestamptz NOT NULL DEFAULT now());
GRANT SELECT ON public.inventory TO anon, authenticated;
GRANT INSERT, UPDATE ON public.inventory TO authenticated;
GRANT ALL ON public.inventory TO service_role;
ALTER TABLE public.inventory ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Anyone reads stock" ON public.inventory FOR SELECT TO anon, authenticated USING (true);
CREATE POLICY "Admins update stock" ON public.inventory FOR UPDATE TO authenticated USING (public.has_role(auth.uid(), 'admin')) WITH CHECK (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "Admins insert stock" ON public.inventory FOR INSERT TO authenticated WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE OR REPLACE FUNCTION public.reserve_stock() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE l jsonb; left_qty int;
BEGIN
  NEW.status := 'confirmed'; NEW.courier := NULL; NEW.awb := NULL; NEW.tracking_url := NULL; NEW.cod_confirmed := false;
  FOR l IN SELECT * FROM jsonb_array_elements(NEW.items) LOOP
    UPDATE public.inventory SET stock = stock - (l->>'qty')::int, updated_at = now()
      WHERE watch_id = l->>'id' AND stock >= (l->>'qty')::int RETURNING stock INTO left_qty;
    IF NOT FOUND THEN RAISE EXCEPTION 'OUT_OF_STOCK:%', l->>'id'; END IF;
  END LOOP;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS orders_reserve_stock ON public.orders;
CREATE TRIGGER orders_reserve_stock BEFORE INSERT ON public.orders FOR EACH ROW EXECUTE FUNCTION public.reserve_stock();
CREATE OR REPLACE FUNCTION public.touch_order() RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$ BEGIN NEW.updated_at := now(); RETURN NEW; END $$;
CREATE TRIGGER orders_touch BEFORE UPDATE ON public.orders FOR EACH ROW EXECUTE FUNCTION public.touch_order();
ALTER PUBLICATION supabase_realtime ADD TABLE public.orders;

CREATE TABLE public.products (
  id text PRIMARY KEY,
  name text NOT NULL,
  finish text NOT NULL DEFAULT '',
  price integer NOT NULL DEFAULT 0,
  list_price integer NOT NULL DEFAULT 0,
  description text NOT NULL DEFAULT '',
  details text[] NOT NULL DEFAULT '{}',
  image_url text NOT NULL DEFAULT '',
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.products TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.products TO authenticated;
GRANT ALL ON public.products TO service_role;
ALTER TABLE public.products ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Anyone reads active products" ON public.products FOR SELECT TO anon, authenticated USING (active OR public.has_role(auth.uid(), 'admin'));
CREATE POLICY "Admins insert products" ON public.products FOR INSERT TO authenticated WITH CHECK (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "Admins update products" ON public.products FOR UPDATE TO authenticated USING (public.has_role(auth.uid(), 'admin')) WITH CHECK (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "Admins delete products" ON public.products FOR DELETE TO authenticated USING (public.has_role(auth.uid(), 'admin'));

CREATE OR REPLACE FUNCTION public.cancel_order(_order_id text) RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE o public.orders; l jsonb; is_admin boolean;
BEGIN
  IF auth.uid() IS NULL THEN RETURN false; END IF;
  SELECT * INTO o FROM public.orders WHERE id = _order_id FOR UPDATE;
  IF NOT FOUND OR o.status = 'cancelled' THEN RETURN false; END IF;
  is_admin := public.has_role(auth.uid(), 'admin');
  IF NOT is_admin AND (o.user_id <> auth.uid() OR o.status NOT IN ('confirmed','packed')) THEN RETURN false; END IF;
  IF o.status <> 'delivered' THEN
    FOR l IN SELECT * FROM jsonb_array_elements(o.items) LOOP
      UPDATE public.inventory SET stock = stock + (l->>'qty')::int, updated_at = now() WHERE watch_id = l->>'id';
    END LOOP;
  END IF;
  UPDATE public.orders SET status = 'cancelled' WHERE id = _order_id;
  RETURN true;
END $$;
REVOKE EXECUTE ON FUNCTION public.cancel_order(text) FROM anon, public;
GRANT EXECUTE ON FUNCTION public.cancel_order(text) TO authenticated;

CREATE TABLE public.reviews (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id text NOT NULL,
  user_id uuid NOT NULL DEFAULT auth.uid(),
  author text NOT NULL CHECK (char_length(author) BETWEEN 1 AND 60),
  rating int NOT NULL CHECK (rating BETWEEN 1 AND 5),
  comment text NOT NULL CHECK (char_length(comment) BETWEEN 3 AND 1000),
  verified boolean NOT NULL DEFAULT false,
  photos text[] NOT NULL DEFAULT '{}',
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (product_id, user_id)
);
GRANT SELECT ON public.reviews TO anon;
GRANT SELECT, INSERT, DELETE ON public.reviews TO authenticated;
GRANT ALL ON public.reviews TO service_role;
ALTER TABLE public.reviews ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Anyone reads reviews" ON public.reviews FOR SELECT TO anon, authenticated USING (true);
CREATE POLICY "Users add own review" ON public.reviews FOR INSERT TO authenticated WITH CHECK (user_id = auth.uid());
CREATE POLICY "Users or admin delete reviews" ON public.reviews FOR DELETE TO authenticated USING (user_id = auth.uid() OR public.has_role(auth.uid(), 'admin'));
CREATE OR REPLACE FUNCTION public.set_review_verified() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  NEW.user_id := auth.uid();
  NEW.verified := EXISTS (SELECT 1 FROM public.orders WHERE user_id = auth.uid() AND status <> 'cancelled');
  RETURN NEW;
END $$;
CREATE TRIGGER reviews_verified BEFORE INSERT ON public.reviews FOR EACH ROW EXECUTE FUNCTION public.set_review_verified();

CREATE POLICY "Public reads product images" ON storage.objects FOR SELECT TO anon, authenticated USING (bucket_id = 'product-images');
CREATE POLICY "Admins upload product images" ON storage.objects FOR INSERT TO authenticated WITH CHECK (bucket_id = 'product-images' AND public.has_role(auth.uid(), 'admin'));
CREATE POLICY "Admins update product images" ON storage.objects FOR UPDATE TO authenticated USING (bucket_id = 'product-images' AND public.has_role(auth.uid(), 'admin'));
CREATE POLICY "Anyone views review photos" ON storage.objects FOR SELECT TO anon, authenticated USING (bucket_id = 'reviews');
CREATE POLICY "Users upload own review photos" ON storage.objects FOR INSERT TO authenticated WITH CHECK (bucket_id = 'reviews' AND (storage.foldername(name))[1] = auth.uid()::text);
CREATE POLICY "Users delete own review photos" ON storage.objects FOR DELETE TO authenticated USING (bucket_id = 'reviews' AND (storage.foldername(name))[1] = auth.uid()::text);

CREATE TABLE public.payment_intents (
  id text PRIMARY KEY,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  razorpay_order_id text NOT NULL UNIQUE,
  items jsonb NOT NULL,
  total integer NOT NULL CHECK (total > 0),
  address jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.payment_intents ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.payment_intents FROM anon, authenticated;
GRANT ALL ON public.payment_intents TO service_role;

INSERT INTO public.inventory (watch_id, stock) VALUES ('steel',10),('gold',10),('rosegold',10),('black',10) ON CONFLICT (watch_id) DO NOTHING;