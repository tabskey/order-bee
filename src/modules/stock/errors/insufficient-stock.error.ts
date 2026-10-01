export class InsufficientStockError extends Error {
  constructor(public readonly productId: number) {
    super(`Insufficient stock for product ${productId}`);
  }
}
