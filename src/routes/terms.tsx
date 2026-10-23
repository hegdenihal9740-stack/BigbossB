import { createFileRoute, Link } from '@tanstack/react-router';
import { PolicyPage, meta } from '@/components/PolicyPage';

export const Route = createFileRoute('/terms')({
  head: () => meta('Terms & Conditions — BIG-B', 'Terms for browsing, ordering and using BIG-B services.'),
  component: () => <PolicyPage title="Terms & conditions">
    <h3>Orders and availability</h3>
    <p>Placing an order is a request to purchase. Orders are subject to product availability and confirmation by BIG-B. We will contact you if an item is unavailable or an order cannot be fulfilled.</p>
    <h3>Product information and pricing</h3>
    <p>We aim to keep product descriptions, images and prices accurate, but display variations may occur. We may correct errors or update product information and prices before an order is confirmed.</p>
    <h3>Delivery, returns and warranty</h3>
    <p>Delivery, replacement and warranty terms are described in our <Link to="/shipping-policy">Shipping Policy</Link> and <Link to="/returns">Returns &amp; Warranty</Link> pages.</p>
    <h3>Acceptable use</h3>
    <p>Please use this website lawfully and do not interfere with its operation, attempt unauthorized access, or misuse another customer's information.</p>
    <h3>Changes and contact</h3>
    <p>These terms may be updated from time to time. Continued use of the website after an update means you accept the revised terms. For questions, use our <Link to="/contact">Contact page</Link>.</p>
  </PolicyPage>,
});
