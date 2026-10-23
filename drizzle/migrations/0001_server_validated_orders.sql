REVOKE UPDATE ON public.orders FROM authenticated;
REVOKE INSERT, UPDATE, DELETE ON public.products FROM authenticated;
REVOKE INSERT, UPDATE ON public.inventory FROM authenticated;
REVOKE ALL ON FUNCTION public.has_role(uuid, public.app_role) FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.has_role(_user_id uuid, _role public.app_role) RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT auth.uid() IS NOT NULL
    AND (
      _user_id = auth.uid()
      OR EXISTS (
        SELECT 1 FROM public.user_roles
        WHERE user_id = auth.uid() AND role = 'admin'
      )
    )
    AND EXISTS (
      SELECT 1 FROM public.user_roles
      WHERE user_id = _user_id AND role = _role
    )
$$;

GRANT EXECUTE ON FUNCTION public.has_role(uuid, public.app_role) TO authenticated;

CREATE OR REPLACE FUNCTION public.validate_customer_order() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  line jsonb;
  expected_price integer;
  expected_total integer := 0;
  verified_items jsonb := '[]'::jsonb;
  quantity integer;
  product_id text;
BEGIN
  IF auth.role() = 'service_role' THEN
    RETURN NEW;
  END IF;
  IF auth.uid() IS NULL OR NEW.user_id IS DISTINCT FROM auth.uid() THEN
    RAISE EXCEPTION 'Authentication required';
  END IF;
  IF NEW.payment <> 'cod' OR jsonb_typeof(NEW.items) IS DISTINCT FROM 'array' THEN
    RAISE EXCEPTION 'Invalid cash-on-delivery order';
  END IF;
  IF jsonb_array_length(NEW.items) < 1 OR jsonb_array_length(NEW.items) > 4 THEN
    RAISE EXCEPTION 'Invalid cash-on-delivery order';
  END IF;

  FOR line IN SELECT value FROM jsonb_array_elements(NEW.items) AS entries(value) LOOP
    product_id := line->>'id';
    IF product_id IS NULL OR product_id !~ '^[a-z0-9][a-z0-9-]{0,59}$'
      OR EXISTS (
        SELECT 1 FROM jsonb_array_elements(verified_items) AS saved(value)
        WHERE saved.value->>'id' = product_id
      ) THEN
      RAISE EXCEPTION 'Invalid or repeated order item';
    END IF;
    IF COALESCE(line->>'qty', '') !~ '^[0-9]+$' THEN
      RAISE EXCEPTION 'Invalid order quantity';
    END IF;
    quantity := (line->>'qty')::integer;
    IF quantity < 1 OR quantity > 20 THEN
      RAISE EXCEPTION 'Invalid order quantity';
    END IF;

    expected_price := CASE product_id
      WHEN 'steel' THEN 12800
      WHEN 'black' THEN 14500
      WHEN 'gold' THEN 18500
      WHEN 'rosegold' THEN 16900
      ELSE NULL
    END;
    IF expected_price IS NULL THEN
      SELECT price INTO expected_price FROM public.products
      WHERE id = product_id AND active = true;
    END IF;
    IF expected_price IS NULL OR expected_price < 1 THEN
      RAISE EXCEPTION 'Invalid or inactive product';
    END IF;

    expected_total := expected_total + expected_price * quantity;
    verified_items := verified_items || jsonb_build_array(
      jsonb_build_object('id', product_id, 'qty', quantity, 'price', expected_price)
    );
  END LOOP;

  NEW.user_id := auth.uid();
  NEW.payment := 'cod';
  NEW.items := verified_items;
  NEW.total := expected_total;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS orders_validate_customer ON public.orders;
DROP TRIGGER IF EXISTS orders_a_validate_customer ON public.orders;
-- BEFORE triggers run alphabetically; validate and normalize order items before reserving stock.
CREATE TRIGGER orders_a_validate_customer BEFORE INSERT ON public.orders
  FOR EACH ROW EXECUTE FUNCTION public.validate_customer_order();
REVOKE ALL ON FUNCTION public.validate_customer_order() FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.set_review_verified() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Authentication required';
  END IF;
  NEW.user_id := auth.uid();
  IF cardinality(NEW.photos) > 3 OR EXISTS (
    SELECT 1 FROM unnest(NEW.photos) AS photos(path)
    WHERE path NOT LIKE auth.uid()::text || '/%'
  ) THEN
    RAISE EXCEPTION 'Invalid review photo paths';
  END IF;
  IF NEW.product_id NOT IN ('steel', 'black', 'gold', 'rosegold')
    AND NOT EXISTS (SELECT 1 FROM public.products WHERE id = NEW.product_id) THEN
    RAISE EXCEPTION 'Unknown product';
  END IF;
  NEW.verified := EXISTS (
    SELECT 1
    FROM public.orders o
    CROSS JOIN LATERAL jsonb_array_elements(
      CASE WHEN jsonb_typeof(o.items) = 'array' THEN o.items ELSE '[]'::jsonb END
    ) AS items(line)
    WHERE o.user_id = auth.uid()
      AND o.status = 'delivered'
      AND line->>'id' = NEW.product_id
  );
  RETURN NEW;
END $$;

REVOKE ALL ON FUNCTION public.set_review_verified() FROM PUBLIC, anon, authenticated;

CREATE TABLE IF NOT EXISTS public.customer_carts (
  user_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  items jsonb NOT NULL DEFAULT '[]'::jsonb CHECK (jsonb_typeof(items) = 'array'),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE ON public.customer_carts TO authenticated;
ALTER TABLE public.customer_carts ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Customers manage own cart" ON public.customer_carts;
CREATE POLICY "Customers manage own cart" ON public.customer_carts
  FOR ALL TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

CREATE TABLE IF NOT EXISTS public.customer_wishlists (
  user_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  watch_ids text[] NOT NULL DEFAULT '{}',
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE ON public.customer_wishlists TO authenticated;
ALTER TABLE public.customer_wishlists ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Customers manage own wishlist" ON public.customer_wishlists;
CREATE POLICY "Customers manage own wishlist" ON public.customer_wishlists
  FOR ALL TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
