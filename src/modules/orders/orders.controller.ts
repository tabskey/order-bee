import { randomUUID } from 'node:crypto';
import { Body, Controller, Post, Req, UseGuards } from '@nestjs/common';
import type { Request } from 'express';
import { CurrentUser } from '../auth/current-user.decorator';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import type { AuthenticatedUser } from '../auth/jwt-payload.interface';
import { CreateOrderDto } from './dto/create-order.dto';
import { OrdersService } from './orders.service';

@UseGuards(JwtAuthGuard)
@Controller('orders')
export class OrdersController {
  constructor(private readonly ordersService: OrdersService) {}

  @Post()
  create(
    @Body() dto: CreateOrderDto,
    @CurrentUser() user: AuthenticatedUser,
    @Req() request: Request & { id?: string },
  ) {
    const correlationId = request.id ?? randomUUID();
    return this.ordersService.create(dto, user.userId, correlationId);
  }
}
