export interface OrderTotalItem {
  quantity: number;
  unitPriceCents: number;
}

export function calculateOrderTotal(items: OrderTotalItem[]): number {
  return items.reduce(
    (total, item) => total + item.quantity * item.unitPriceCents,
    0,
  );
}
