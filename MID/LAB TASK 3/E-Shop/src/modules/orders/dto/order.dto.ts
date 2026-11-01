import { IsEmail, IsEnum, IsNotEmpty, IsNumber, IsOptional, IsString, IsInt, Min } from "class-validator";
import { Type } from "class-transformer";
import { OrderStatus } from "../entities/order.entity";

export class CreateOrderDto {
  @IsString() @IsNotEmpty() customerName!: string;
  @IsEmail() @IsNotEmpty() customerEmail!: string;
  @IsString() @IsNotEmpty() productName!: string;
  @Type(() => Number) @IsInt() @Min(1) quantity!: number;
  @Type(() => Number) @IsNumber() @Min(0) totalAmount!: number;
  @IsOptional() @IsEnum(OrderStatus) status?: OrderStatus = OrderStatus.PENDING;
}

export class UpdateOrderDto {
  @IsOptional() @IsString() @IsNotEmpty() customerName?: string;
  @IsOptional() @IsEmail() customerEmail?: string;
  @IsOptional() @IsString() @IsNotEmpty() productName?: string;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) quantity?: number;
  @IsOptional() @Type(() => Number) @IsNumber() @Min(0) totalAmount?: number;
  @IsOptional() @IsEnum(OrderStatus) status?: OrderStatus;
}
