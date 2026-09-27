export type UserRole = 'USER' | 'ADMIN';

export interface JwtPayload {
  sub: number;
  email: string;
  role: UserRole;
}

export interface AuthenticatedUser {
  userId: number;
  email: string;
  role: UserRole;
}
