import { Type } from "class-transformer";
import { IsString, IsNumber, IsInt, IsNotEmpty, IsOptional, Min } from "class-validator";

export class CreateProductDto {
  @IsString() @IsNotEmpty() name!: string;
  @IsString() @IsNotEmpty() category!: string;
  @Type(() => Number) @IsNumber() @Min(0) price!: number;
  @Type(() => Number) @IsInt() @Min(0) quantity!: number;
}

export class UpdateProductDto {
  @IsOptional() @IsString() @IsNotEmpty() name?: string;
  @IsOptional() @IsString() @IsNotEmpty() category?: string;
  @IsOptional() @Type(() => Number) @IsNumber() @Min(0) price?: number;
  @IsOptional() @Type(() => Number) @IsInt() @Min(0) quantity?: number;
}
