import { Injectable } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { ReserveResult } from './domain/reserve-result.enum';
import { InsufficientStockError } from './errors/insufficient-stock.error';

interface OrderItemRow {
  product_id: number;
  quantity: number;
}

interface MysqlWriteResult {
  affectedRows: number;
}

@Injectable()
export class StockService {
  constructor(@InjectDataSource() private readonly dataSource: DataSource) {}

  // ADR-0001: claim + reserve in one transaction; on insufficient stock, a
  // second short transaction marks the order FAILED.
  async reserve(orderId: string): Promise<ReserveResult> {
    try {
      return await this.dataSource.transaction(async (manager) => {
        const claim: MysqlWriteResult = await manager.query(
          `UPDATE orders SET status = 'PROCESSED', processed_at = NOW()
           WHERE id = ? AND status = 'PENDING'`,
          [orderId],
        );
        if (claim.affectedRows === 0) {
          return ReserveResult.ALREADY_PROCESSED;
        }

        const items: OrderItemRow[] = await manager.query(
          `SELECT product_id, quantity FROM order_items
           WHERE order_id = ? ORDER BY product_id ASC`,
          [orderId],
        );

        for (const item of items) {
          const reserved: MysqlWriteResult = await manager.query(
            `UPDATE products SET stock = stock - ?
             WHERE id = ? AND stock >= ?`,
            [item.quantity, item.product_id, item.quantity],
          );
          if (reserved.affectedRows === 0) {
            throw new InsufficientStockError(item.product_id);
          }
        }

        return ReserveResult.RESERVED;
      });
    } catch (error) {
      if (error instanceof InsufficientStockError) {
        await this.dataSource.query(
          `UPDATE orders SET status = 'FAILED', failure_reason = ?
           WHERE id = ? AND status = 'PENDING'`,
          ['estoque insuficiente', orderId],
        );
        return ReserveResult.INSUFFICIENT_STOCK;
      }
      throw error;
    }
  }
}
