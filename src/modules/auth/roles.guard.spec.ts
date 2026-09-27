import { ExecutionContext } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { AuthenticatedUser } from './jwt-payload.interface';
import { RolesGuard } from './roles.guard';

function contextFor(user: AuthenticatedUser): ExecutionContext {
  return {
    getHandler: () => jest.fn(),
    getClass: () => jest.fn(),
    switchToHttp: () => ({
      getRequest: () => ({ user }),
    }),
  } as unknown as ExecutionContext;
}

describe('RolesGuard', () => {
  it('allows access when no roles are required', () => {
    const reflector = {
      getAllAndOverride: () => undefined,
    } as unknown as Reflector;
    const guard = new RolesGuard(reflector);

    expect(
      guard.canActivate(contextFor({ userId: 1, email: 'u', role: 'USER' })),
    ).toBe(true);
  });

  it('allows access when the user has a required role', () => {
    const reflector = {
      getAllAndOverride: () => ['ADMIN'],
    } as unknown as Reflector;
    const guard = new RolesGuard(reflector);

    expect(
      guard.canActivate(contextFor({ userId: 1, email: 'a', role: 'ADMIN' })),
    ).toBe(true);
  });

  it('denies access when the user lacks a required role', () => {
    const reflector = {
      getAllAndOverride: () => ['ADMIN'],
    } as unknown as Reflector;
    const guard = new RolesGuard(reflector);

    expect(
      guard.canActivate(contextFor({ userId: 1, email: 'u', role: 'USER' })),
    ).toBe(false);
  });
});
