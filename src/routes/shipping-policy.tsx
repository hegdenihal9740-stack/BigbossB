import { createFileRoute } from '@tanstack/react-router';
import { PolicyPage, meta } from '@/components/PolicyPage';

export const Route = createFileRoute('/shipping-policy')({
  head: () => meta('Shipping Policy — BIG-B', 'Free delivery across India in 3–5 business days with tracked couriers.'),
  component: () => <PolicyPage title="Shipping policy">
    <h3>Delivery time</h3><p>Orders are dispatched within 1 business day after we confirm your order by phone. Delivery takes 3–5 business days in most PIN codes; remote areas may take up to 7 days.</p>
    <h3>Charges</h3><p>Delivery is free on every order across India.</p>
    <h3>Couriers &amp; tracking</h3><p>We ship with trusted couriers such as Delhivery, Blue Dart, DTDC and India Post. Once shipped, your courier name and tracking (AWB) number appear in My Orders with a live tracking link.</p>
    <h3>Cash on delivery</h3><p>For COD orders we call the mobile number you gave to confirm before dispatch. Orders we cannot confirm may be cancelled.</p>
  </PolicyPage>,
});
