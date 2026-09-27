import { IsIn } from 'class-validator';
import type { UserRole } from '../../auth/jwt-payload.interface';

export class ChangeRoleDto {
  @IsIn(['USER', 'ADMIN'])
  role: UserRole;
}
