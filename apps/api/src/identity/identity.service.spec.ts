import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { BadRequestException, NotFoundException } from '@nestjs/common';
import { IdentityService } from './identity.service';
import { PrismaService } from '../prisma/prisma.service';
import { SerproClient } from './serpro.client';

jest.mock('@vintage/shared', () => ({
  isValidCPF: jest.fn().mockReturnValue(true),
}));

const mockPrisma = {
  user: {
    findUnique: jest.fn(),
    update: jest.fn(),
  },
  cpfVerificationLog: {
    create: jest.fn().mockResolvedValue({}),
  },
  $transaction: jest.fn(),
};

const mockSerpro = {
  verify: jest.fn(),
};

function makeService(enforce: boolean) {
  const module = Test.createTestingModule({
    providers: [
      IdentityService,
      { provide: PrismaService, useValue: mockPrisma },
      { provide: SerproClient, useValue: mockSerpro },
      {
        provide: ConfigService,
        useValue: {
          get: jest.fn((k: string, def?: string) =>
            k === 'IDENTITY_VERIFICATION_ENABLED'
              ? enforce
                ? 'true'
                : 'false'
              : def ?? '',
          ),
        },
      },
    ],
  }).compile();
  return module.then((m: TestingModule) => m.get<IdentityService>(IdentityService));
}

describe('IdentityService', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    // Default tx semantics — execute the ops list against mockPrisma.
    mockPrisma.$transaction.mockImplementation((ops: Promise<unknown>[]) =>
      Promise.all(ops),
    );
  });

  describe('enforceEnabled=false (launch default)', () => {
    it('short-circuits with CONFIG_ERROR and never calls Serpro', async () => {
      const svc = await makeService(false);
      mockPrisma.user.findUnique.mockResolvedValue({
        id: 'u1',
        cpf: '52998224725',
        name: 'Jane',
        cpfIdentityVerified: false,
      });

      const result = await svc.verifyCpf('u1', '1990-01-01');

      expect(result.status).toBe('CONFIG_ERROR');
      expect(result.identityVerified).toBe(false);
      expect(mockSerpro.verify).not.toHaveBeenCalled();
    });
  });

  describe('enforceEnabled=true — happy path', () => {
    it('flips cpfIdentityVerified and persists birthDate on VERIFIED', async () => {
      const svc = await makeService(true);
      mockPrisma.user.findUnique.mockResolvedValue({
        id: 'u1',
        cpf: '52998224725',
        name: 'Jane',
        cpfIdentityVerified: false,
      });
      mockSerpro.verify.mockResolvedValue({
        result: 'VERIFIED',
        situacao: 'REGULAR',
      });

      const result = await svc.verifyCpf('u1', '1990-01-01');

      expect(result.status).toBe('VERIFIED');
      expect(result.identityVerified).toBe(true);
      // The tx wraps both the User update AND the audit log write.
      expect(mockPrisma.$transaction).toHaveBeenCalled();
      expect(mockPrisma.user.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'u1' },
          data: expect.objectContaining({ cpfIdentityVerified: true }),
        }),
      );
      expect(mockPrisma.cpfVerificationLog.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            userId: 'u1',
            provider: 'SERPRO',
            result: 'VERIFIED',
          }),
        }),
      );
    });

    it('short-circuits when the user is already verified', async () => {
      const svc = await makeService(true);
      mockPrisma.user.findUnique.mockResolvedValue({
        id: 'u1',
        cpf: '52998224725',
        name: 'Jane',
        cpfIdentityVerified: true,
      });

      const result = await svc.verifyCpf('u1', '1990-01-01');

      expect(result.status).toBe('VERIFIED');
      expect(mockSerpro.verify).not.toHaveBeenCalled();
      // No DB write — the flag was already set.
      expect(mockPrisma.user.update).not.toHaveBeenCalled();
    });
  });

  describe('enforceEnabled=true — failure paths', () => {
    beforeEach(() => {
      mockPrisma.user.findUnique.mockResolvedValue({
        id: 'u1',
        cpf: '52998224725',
        name: 'Jane',
        cpfIdentityVerified: false,
      });
    });

    it.each([
      ['NAME_MISMATCH', /nome completo e data de nascimento/],
      ['CPF_SUSPENDED', /suspenso/],
      ['CPF_CANCELED', /cancelado ou nulo/],
      ['DECEASED', /titular falecido/],
      ['PROVIDER_ERROR', /Tente novamente/],
    ])('logs + returns status %s without flipping the flag', async (status, msg) => {
      const svc = await makeService(true);
      mockSerpro.verify.mockResolvedValue({ result: status });

      const result = await svc.verifyCpf('u1', '1990-01-01');

      expect(result.status).toBe(status);
      expect(result.identityVerified).toBe(false);
      expect(result.message).toMatch(msg);
      expect(mockPrisma.user.update).not.toHaveBeenCalled();
      expect(mockPrisma.cpfVerificationLog.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            userId: 'u1',
            provider: 'SERPRO',
            result: status,
          }),
        }),
      );
    });

    it('refuses bad birthDate format', async () => {
      const svc = await makeService(true);
      await expect(svc.verifyCpf('u1', '01/01/1990')).rejects.toThrow(
        BadRequestException,
      );
      expect(mockSerpro.verify).not.toHaveBeenCalled();
    });

    it('throws NotFound when the user row is missing', async () => {
      mockPrisma.user.findUnique.mockResolvedValueOnce(null);
      const svc = await makeService(true);
      await expect(svc.verifyCpf('ghost', '1990-01-01')).rejects.toThrow(
        NotFoundException,
      );
    });

    it('refuses when the user has no CPF linked', async () => {
      mockPrisma.user.findUnique.mockResolvedValueOnce({
        id: 'u1',
        cpf: null,
        name: 'Jane',
        cpfIdentityVerified: false,
      });
      const svc = await makeService(true);
      await expect(svc.verifyCpf('u1', '1990-01-01')).rejects.toThrow(
        /Adicione um CPF/,
      );
    });
  });

  describe('CPF is hashed in the audit log (never the raw value)', () => {
    it('stores SHA256(cpf) not the raw number', async () => {
      const svc = await makeService(true);
      mockPrisma.user.findUnique.mockResolvedValue({
        id: 'u1',
        cpf: '52998224725',
        name: 'Jane',
        cpfIdentityVerified: false,
      });
      mockSerpro.verify.mockResolvedValue({ result: 'VERIFIED' });

      await svc.verifyCpf('u1', '1990-01-01');

      const call = mockPrisma.cpfVerificationLog.create.mock.calls[0][0];
      expect(call.data.cpfHash).toHaveLength(64); // SHA256 hex
      expect(call.data.cpfHash).not.toContain('52998224725');
    });
  });
});
