import { createFileRoute } from '@tanstack/react-router';
import { PolicyPage, meta } from '@/components/PolicyPage';

export const Route = createFileRoute('/returns')({
  head: () => meta('Returns & Refunds — BIG-B', '7-day replacement and 2-year warranty on every watch.'),
  component: () => <PolicyPage title="Returns & refunds">
    <h3>7-day replacement</h3><p>If your watch arrives damaged, defective or different from what you ordered, contact us within 7 days of delivery for a free replacement. Please record a video while opening the parcel.</p>
    <h3>Condition</h3><p>Watches must be unused, with original box, tags and invoice.</p>
    <h3>Refunds</h3><p>If a replacement is not available, we refund the full amount to your bank account or UPI within 5–7 business days after the item is picked up.</p>
    <h3>Warranty</h3><p>Every watch carries a 2-year manufacturer warranty against movement defects.</p>
  </PolicyPage>,
});
