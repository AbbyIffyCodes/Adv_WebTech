import { Body, Controller, Get, Param, ParseIntPipe, Patch, Post } from "@nestjs/common";
import { OrdersService } from "./orders.service";
import { CreateOrderDto, UpdateOrderDto } from "./dto/order.dto";

@Controller("orders")
export class OrdersController {
  constructor(private readonly orders: OrdersService) {}
  @Get() findAll() { return this.orders.findAll(); }
  @Post() create(@Body() dto: CreateOrderDto) { return this.orders.create(dto); }
  @Patch(":id") update(@Param("id", ParseIntPipe) id: number, @Body() dto: UpdateOrderDto) { return this.orders.update(id, dto); }
}
