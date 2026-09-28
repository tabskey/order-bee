import {
  IsInt,
  IsNotEmpty,
  IsNumber,
  IsPositive,
  IsString,
  Max,
  MaxLength,
} from 'class-validator';

// Bounds match the column types (VARCHAR(255), INT, DECIMAL(12,2)) so
// oversized input is a 400, not a MySQL error surfacing as 500.
export class CreateOrderItemDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(255)
  productName: string;

  @IsInt()
  @IsPositive()
  @Max(1_000_000)
  quantity: number;

  @IsNumber({ maxDecimalPlaces: 2 })
  @IsPositive()
  @Max(9_999_999_999.99)
  price: number;
}
