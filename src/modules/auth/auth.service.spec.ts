import { UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Repository } from 'typeorm';
import { AuthService } from './auth.service';
import { UserEntity } from './entities/user.entity';

const verifyIdToken = jest.fn();
jest.mock('google-auth-library', () => ({
  OAuth2Client: jest.fn().mockImplementation(() => ({ verifyIdToken })),
}));

function buildService(users: Partial<Repository<UserEntity>>) {
  const config = {
    get: (key: string) =>
      ({
        GOOGLE_CLIENT_ID: 'client-id',
        JWT_SECRET: 'secret',
        JWT_EXPIRES_IN: '1h',
      })[key],
  } as unknown as ConfigService;
  return new AuthService(users as Repository<UserEntity>, config as any);
}

describe('AuthService.loginWithGoogle', () => {
  beforeEach(() => {
    verifyIdToken.mockReset();
  });

  it('rejects an invalid Google ID token', async () => {
    verifyIdToken.mockRejectedValue(new Error('bad token'));
    const service = buildService({});

    await expect(
      service.loginWithGoogle({ idToken: 'bad' }),
    ).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it('rejects a token with an unverified email', async () => {
    verifyIdToken.mockResolvedValue({
      getPayload: () => ({ email: 'a@b.com', email_verified: false }),
    });
    const service = buildService({});

    await expect(
      service.loginWithGoogle({ idToken: 'ok' }),
    ).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it('provisions a new local user on first Google login', async () => {
    verifyIdToken.mockResolvedValue({
      getPayload: () => ({ email: 'new@test.local', email_verified: true }),
    });
    const insert = jest.fn().mockResolvedValue({ identifiers: [{ id: 7 }] });
    const findOne = jest.fn().mockResolvedValue(null);
    const findOneOrFail = jest.fn().mockResolvedValue({
      id: 7,
      email: 'new@test.local',
      role: 'USER',
    });
    const service = buildService({ insert, findOne, findOneOrFail });

    const result = await service.loginWithGoogle({ idToken: 'ok' });

    expect(insert).toHaveBeenCalledWith(
      expect.objectContaining({ email: 'new@test.local', role: 'USER' }),
    );
    expect(result.accessToken).toBeDefined();
  });

  it('reuses the existing local user on repeat Google login', async () => {
    verifyIdToken.mockResolvedValue({
      getPayload: () => ({ email: 'known@test.local', email_verified: true }),
    });
    const insert = jest.fn();
    const findOne = jest.fn().mockResolvedValue({
      id: 3,
      email: 'known@test.local',
      role: 'ADMIN',
    });
    const service = buildService({ insert, findOne });

    const result = await service.loginWithGoogle({ idToken: 'ok' });

    expect(insert).not.toHaveBeenCalled();
    expect(result.accessToken).toBeDefined();
  });

  it('rejects a soft-deleted account instead of re-provisioning it', async () => {
    verifyIdToken.mockResolvedValue({
      getPayload: () => ({ email: 'gone@test.local', email_verified: true }),
    });
    const insert = jest.fn();
    const findOne = jest.fn().mockResolvedValue({
      id: 4,
      email: 'gone@test.local',
      role: 'USER',
      deletedAt: new Date(),
    });
    const service = buildService({ insert, findOne });

    await expect(
      service.loginWithGoogle({ idToken: 'ok' }),
    ).rejects.toBeInstanceOf(UnauthorizedException);
    expect(insert).not.toHaveBeenCalled();
  });

  it('reuses the user created by a concurrent first login (duplicate email)', async () => {
    verifyIdToken.mockResolvedValue({
      getPayload: () => ({ email: 'race@test.local', email_verified: true }),
    });
    const insert = jest
      .fn()
      .mockRejectedValue(
        Object.assign(new Error('dup'), { code: 'ER_DUP_ENTRY' }),
      );
    const findOne = jest.fn().mockResolvedValue(null);
    const findOneOrFail = jest.fn().mockResolvedValue({
      id: 9,
      email: 'race@test.local',
      role: 'USER',
    });
    const service = buildService({ insert, findOne, findOneOrFail });

    const result = await service.loginWithGoogle({ idToken: 'ok' });

    expect(result.accessToken).toBeDefined();
  });
});
