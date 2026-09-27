export class SimulatedProcessingError extends Error {
  constructor(orderId: string) {
    super(`Simulated processing failure for order ${orderId}`);
  }
}
