import { createFileRoute } from '@tanstack/react-router';
import { PolicyPage, meta } from '@/components/PolicyPage';
import { STORE_CONTACT, STORE_CONTACT_EMAIL_URL } from '@/lib/store-info';
import { whatsappLink } from '@/lib/whatsapp';

export const Route = createFileRoute('/contact')({
  head: () => meta('Contact & Support — BIG-B', 'Reach BIG-B support by phone, WhatsApp or email.'),
  component: () => <PolicyPage title="Contact us">
    <p>We are happy to help with orders, delivery and returns.</p>
    <h3>Phone / WhatsApp</h3><p><a href={`tel:${STORE_CONTACT.phone}`}>{STORE_CONTACT.phone}</a> · <a href={whatsappLink()} target="_blank" rel="noopener noreferrer">Chat on WhatsApp</a></p>
    <h3>Email</h3><p><a href={STORE_CONTACT_EMAIL_URL} target="_blank" rel="noopener noreferrer">{STORE_CONTACT.email}</a></p>
    <h3>Hours</h3><p>{STORE_CONTACT.hours}</p>
    <h3>Address</h3><p>{STORE_CONTACT.address}</p>
  </PolicyPage>,
});
