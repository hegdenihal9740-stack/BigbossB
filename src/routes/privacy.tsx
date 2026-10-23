import { createFileRoute } from '@tanstack/react-router';
import { PolicyPage, meta } from '@/components/PolicyPage';
import { STORE_CONTACT } from '@/lib/store-info';

export const Route = createFileRoute('/privacy')({
  head: () => meta('Privacy Policy — BIG-B', 'How BIG-B uses information to support accounts, orders and customer service.'),
  component: () => <PolicyPage title="Privacy policy">
    <h3>Information we use</h3>
    <p>When you create an account, place an order or contact us, we use the details you provide, such as your name, email address, phone number, delivery address and order information.</p>
    <h3>How we use it</h3>
    <p>We use this information to manage your account, process and deliver orders, provide customer support, and meet applicable legal requirements.</p>
    <h3>Storage and sharing</h3>
    <p>Some shopping preferences may be stored in your browser. Account and order information may be processed by the services that operate those features and shared with delivery providers as needed to fulfill an order. We do not sell your personal information.</p>
    <h3>Your choices</h3>
    <p>You may contact us to ask about, correct or request deletion of your personal information, subject to records we must retain by law.</p>
    <h3>Contact</h3>
    <p>For privacy questions, email <a href={`mailto:${STORE_CONTACT.email}`}>{STORE_CONTACT.email}</a>.</p>
  </PolicyPage>,
});
