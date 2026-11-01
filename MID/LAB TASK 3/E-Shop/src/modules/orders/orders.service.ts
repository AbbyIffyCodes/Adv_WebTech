import { Injectable, NotFoundException } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { Repository } from "typeorm";
import { Order } from "./entities/order.entity";
import { CreateOrderDto, UpdateOrderDto } from "./dto/order.dto";

@Injectable()
export class OrdersService {
  constructor(@InjectRepository(Order) private readonly orders: Repository<Order>) {}
  findAll(): Promise<Order[]> { return this.orders.find({ order: { createdAt: "DESC" } }); }
  create(dto: CreateOrderDto): Promise<Order> { return this.orders.save(this.orders.create(dto)); }
  async update(id: number, dto: UpdateOrderDto): Promise<Order> {
    const order = await this.orders.findOne({ where: { id } });
    if (!order) throw new NotFoundException(`Order ${id} not found`);
    Object.assign(order, dto); return this.orders.save(order);
  }
}
