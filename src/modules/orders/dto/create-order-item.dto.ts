import {
  IsInt,
  IsNotEmpty,
  IsNumber,
  IsPositive,
  IsString,
} from 'class-validator';

export class CreateOrderItemDto {
  @IsString()
  @IsNotEmpty()
  productName: string;

  @IsInt()
  @IsPositive()
  quantity: number;

  @IsNumber({ maxDecimalPlaces: 2 })
  @IsPositive()
  price: number;
}
