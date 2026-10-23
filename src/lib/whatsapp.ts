import { STORE_CONTACT } from '@/lib/store-info';

export const DEFAULT_WHATSAPP_MESSAGE = 'Hello BIG-B, I am interested in this watch.';

/** Opens a WhatsApp chat with the store, with the message pre-typed. */
export const whatsappLink = (text = DEFAULT_WHATSAPP_MESSAGE) =>
  `https://wa.me/${STORE_CONTACT.phone.replace(/\D/g, '')}?text=${encodeURIComponent(text)}`;
