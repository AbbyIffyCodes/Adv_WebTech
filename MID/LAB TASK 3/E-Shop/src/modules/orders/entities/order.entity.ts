import { Column, CreateDateColumn, Entity, PrimaryGeneratedColumn, UpdateDateColumn } from "typeorm";

export enum OrderStatus {
  PENDING = "PENDING",
  PAID = "PAID",
  SHIPPED = "SHIPPED",
  CANCELLED = "CANCELLED",
}

@Entity({ name: "orders" })
export class Order {
  @PrimaryGeneratedColumn()
  id!: number;

  @Column({ name: "customer_name", type: "varchar" })
  customerName!: string;

  @Column({ name: "customer_email", type: "varchar" })
  customerEmail!: string;

  @Column({ name: "product_name", type: "varchar" })
  productName!: string;

  @Column({ type: "int" })
  quantity!: number;

  @Column({ name: "total_amount", type: "decimal", precision: 10, scale: 2 })
  totalAmount!: number;

  @Column({ type: "varchar", default: OrderStatus.PENDING })
  status!: OrderStatus;

  @CreateDateColumn({ name: "created_at" })
  createdAt!: Date;

  @UpdateDateColumn({ name: "updated_at" })
  updatedAt!: Date;
}
