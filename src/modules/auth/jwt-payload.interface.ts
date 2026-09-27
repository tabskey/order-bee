export interface JwtPayload {
  sub: number;
  email: string;
  role: 'USER' | 'ADMIN';
}

export interface AuthenticatedUser {
  userId: number;
  email: string;
  role: 'USER' | 'ADMIN';
}
