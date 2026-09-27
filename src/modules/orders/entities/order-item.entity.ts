import { Column, Entity, PrimaryGeneratedColumn } from 'typeorm';

@Entity('order_items')
export class OrderItemEntity {
  @PrimaryGeneratedColumn({ type: 'bigint' })
  id: string;

  @Column({ name: 'order_id', type: 'char', length: 36 })
  orderId: string;

  @Column({ name: 'product_id' })
  productId: number;

  @Column()
  quantity: number;

  @Column({ name: 'unit_price', type: 'decimal', precision: 12, scale: 2 })
  unitPrice: string;
}
