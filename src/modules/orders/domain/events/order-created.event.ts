export const ORDER_CREATED_EVENT = 'OrderCreatedEvent';

export interface OrderCreatedEvent {
  orderId: string;
  correlationId: string;
}
