import { BusinessError } from '../../../shared/errors/business-error';

export class ProductsNotFoundError extends BusinessError {
  constructor(public readonly productNames: string[]) {
    super(`Products not found: ${productNames.join(', ')}`);
  }
}
