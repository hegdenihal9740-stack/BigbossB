import { watchPrices, type WatchTone } from "@/lib/watches";

export type PaymentLine = { id: string; qty: number };

export function getPaymentTotal(
  lines: PaymentLine[],
  customPrices: Record<string, number> = {},
): number {
  if (lines.length < 1 || lines.length > 4) {
    throw new Error("Your cart is empty or contains too many different items");
  }

  const seen = new Set<string>();
  return lines.reduce((total, line) => {
    const price = Object.hasOwn(watchPrices, line.id)
      ? watchPrices[line.id as WatchTone]
      : customPrices[line.id];
    if (
      !price ||
      !Number.isSafeInteger(price) ||
      price < 1 ||
      seen.has(line.id) ||
      !Number.isInteger(line.qty) ||
      line.qty < 1 ||
      line.qty > 20
    ) {
      throw new Error("Your cart contains an invalid item or quantity");
    }
    seen.add(line.id);
    return total + price * line.qty;
  }, 0);
}
