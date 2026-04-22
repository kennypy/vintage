import {
  Injectable,
  NotFoundException,
  ForbiddenException,
  BadRequestException,
  UnauthorizedException,
  Logger,
} from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import * as bcrypt from 'bcrypt';
import * as crypto from 'crypto';
import { PrismaService } from '../prisma/prisma.service';
import { EmailService } from '../email/email.service';
import { ListingsService } from '../listings/listings.service';
import { AuditLogService } from '../audit-log/audit-log.service';
import { NotificationsService } from '../notifications/notifications.service';
import { CpfVaultService } from '../common/services/cpf-vault.service';
import { CronLockService } from '../common/services/cron-lock.service';
import { UpdateProfileDto } from './dto/update-profile.dto';
import { CreateAddressDto } from './dto/create-address.dto';
import { UpdateAddressDto } from './dto/update-address.dto';
import { DeleteAccountDto } from './dto/delete-account.dto';
import { isValidCPF } from '@vintage/shared';

/** In-memory store for OAuth-user deletion confirmation codes.
 *  (Acceptable for a low-volume, short-lived ephemeral flow; backed by
 *  a timestamp so expired entries are ignored and swept.) */
interface DeletionCodeEntry {
  codeHash: string;
  expiresAt: number;
}

@Injectable()
export class UsersService {
  private readonly logger = new Logger(UsersService.name);
  private readonly deletionCodes = new Map<string, DeletionCodeEntry>();
  private readonly DELETION_CODE_TTL_MS = 15 * 60 * 1000; // 15 minutes
  private readonly HARD_DELETE_GRACE_MS = 30 * 24 * 60 * 60 * 1000; // 30 days

  constructor(
    private prisma: PrismaService,
    private emailService: EmailService,
    private listings: ListingsService,
    private auditLog: AuditLogService,
    private cpfVault: CpfVaultService,
    private notifications: NotificationsService,
    private cronLock: CronLockService,
  ) {}

  /** Full profile for the authenticated user — includes wallet balance and listing count. */
  async getMyProfile(userId: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        email: true,
        name: true,
        phone: true,
        avatarUrl: true,
        bio: true,
        verified: true,
        // OWNER-ONLY fields: the public endpoint `getProfile` does NOT select
        // these. We expose them on /users/me so the client can tell whether
        // the user needs to add a CPF (OAuth signup leaves this null) and
        // whether Receita Federal verification has run.
        // The DB holds only ciphertext (cpfEncrypted); we decrypt below
        // before the response leaves the service.
        cpfEncrypted: true,
        cpfChecksumValid: true,
        cpfIdentityVerified: true,
        socialProvider: true,
        vacationMode: true,
        ratingAvg: true,
        ratingCount: true,
        followerCount: true,
        followingCount: true,
        createdAt: true,
        wallet: { select: { balanceBrl: true } },
        _count: { select: { listings: { where: { status: 'ACTIVE' } } } },
      },
    });

    if (!user) throw new NotFoundException('Usuário não encontrado');

    const { wallet, _count, cpfEncrypted, ...rest } = user;
    const cpf = cpfEncrypted ? this.cpfVault.decrypt(cpfEncrypted) : null;
    return {
      ...rest,
      cpf,
      walletBalance: Number(wallet?.balanceBrl ?? 0),
      listingCount: _count.listings,
    };
  }

  async getProfile(userId: string) {
    // Public profile — no auth guard. Only fields a stranger visiting
    // a seller's storefront legitimately needs. Critically this must
    // NOT return email or phone; pen-test track 2 (finding D-04) found
    // that the previous projection exposed both to unauthenticated
    // callers, letting anyone with a user id (trivially harvested
    // from listings / reviews / follower lists) doxx the owner and
    // enumerate every registered email + phone for spam / credential
    // stuffing / LGPD-actionable contact harvest. /users/me remains
    // the authenticated path for the owner's own contact info.
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        name: true,
        avatarUrl: true,
        bio: true,
        verified: true,
        cpfIdentityVerified: true,
        vacationMode: true,
        ratingAvg: true,
        ratingCount: true,
        followerCount: true,
        followingCount: true,
        createdAt: true,
      },
    });

    if (!user) {
      throw new NotFoundException('Usuário não encontrado');
    }

    return user;
  }

  async updateProfile(userId: string, currentUserId: string, dto: UpdateProfileDto) {
    if (userId !== currentUserId) {
      throw new ForbiddenException('Você só pode editar seu próprio perfil');
    }

    return this.prisma.user.update({
      where: { id: userId },
      data: {
        ...(dto.name !== undefined && { name: dto.name }),
        ...(dto.bio !== undefined && { bio: dto.bio }),
        ...(dto.phone !== undefined && { phone: dto.phone }),
        // Empty string means "remove avatar" — persist NULL, not "".
        ...(dto.avatarUrl !== undefined && {
          avatarUrl: dto.avatarUrl === '' ? null : dto.avatarUrl,
        }),
      },
      select: {
        id: true,
        name: true,
        bio: true,
        phone: true,
        avatarUrl: true,
      },
    });
  }

  /**
   * Add a CPF to an account that was created without one (OAuth signup).
   * CPF is set-once: once stored, it cannot be changed via this endpoint —
   * a change would orphan every payout/NF-e record tied to the account.
   * Corrections go through support and touch the DB directly.
   *
   * Enumeration-resistant by design:
   *   - A single `updateMany({ where: { id, cpf: null } })` is the only
   *     DB interaction. There is NO pre-flight `findUnique` — the earlier
   *     version had one, which produced a measurable timing difference
   *     between "user already has CPF" (fast early return) and "CPF taken
   *     elsewhere" (full update + exception), turning the endpoint into
   *     a timing oracle under session-cookie theft scenarios.
   *   - Every failure path (user doesn't exist, user already has CPF,
   *     CPF belongs to another account, concurrent race) returns the
   *     SAME BadRequestException with the SAME message. The server-side
   *     distinction is logged structurally for support without being
   *     revealed to the client.
   *
   * Race safety:
   *   - The single UPDATE with `WHERE cpf IS NULL` is atomic in Postgres
   *     — a concurrent setCpf for the same user locks the row, and the
   *     losing side sees `count = 0`.
   *   - The DB-level @unique on User.cpf catches concurrent DIFFERENT-user
   *     sets of the same CPF (P2002). Collapsed into the same uniform
   *     error.
   */
  async setCpf(userId: string, rawCpf: string) {
    const cleanCpf = rawCpf.replace(/\D/g, '');
    if (!isValidCPF(cleanCpf)) {
      throw new BadRequestException('CPF inválido.');
    }

    const UNIFORM_ERROR =
      'Não foi possível cadastrar este CPF. Se você já tem um CPF cadastrado, entre em contato com o suporte.';

    try {
      const result = await this.prisma.user.updateMany({
        // Set-once: refuse if either the encrypted ciphertext OR the
        // lookup hash is already populated. Both should move together
        // — defensive double-null ensures a partially-written row
        // (shouldn't exist, but let's be explicit) can't be claimed.
        where: { id: userId, cpfEncrypted: null, cpfLookupHash: null },
        // Modulo-11 passed (isValidCPF check above). Identity KYC
        // (cpfIdentityVerified) stays default false until the Serpro
        // / Caf flow confirms the CPF + name at Receita.
        data: {
          cpfEncrypted: this.cpfVault.encrypt(cleanCpf),
          cpfLookupHash: this.cpfVault.lookupHash(cleanCpf),
          cpfChecksumValid: true,
        },
      });
      if (result.count === 0) {
        // Covers: user doesn't exist, user already has a CPF, or a
        // concurrent writer claimed the slot first. The client never
        // learns which.
        this.logger.warn(
          `setCpf: no rows updated for user ${userId} (not found, already set, or raced).`,
        );
        throw new BadRequestException(UNIFORM_ERROR);
      }
    } catch (err) {
      if (err instanceof BadRequestException) throw err;
      const code = (err as { code?: string })?.code;
      if (code === 'P2002') {
        this.logger.warn(`setCpf: CPF already on another account (P2002).`);
        throw new BadRequestException(UNIFORM_ERROR);
      }
      throw err;
    }

    return { success: true };
  }

  async getUserListings(userId: string, page: number = 1, pageSize: number = 20) {
    page = Math.max(1, Number(page) || 1);
    pageSize = Math.min(100, Math.max(1, Number(pageSize) || 20));
    const skip = (page - 1) * pageSize;

    const [items, total] = await Promise.all([
      this.prisma.listing.findMany({
        where: { sellerId: userId, status: 'ACTIVE' },
        include: {
          images: { orderBy: { position: 'asc' }, take: 1 },
          category: { select: { namePt: true, slug: true } },
        },
        orderBy: { createdAt: 'desc' },
        skip,
        take: pageSize,
      }),
      this.prisma.listing.count({
        where: { sellerId: userId, status: 'ACTIVE' },
      }),
    ]);

    return {
      items,
      total,
      page,
      pageSize,
      hasMore: skip + items.length < total,
    };
  }

  // --- Addresses ---

  async getAddresses(userId: string) {
    return this.prisma.address.findMany({
      where: { userId },
      orderBy: [{ isDefault: 'desc' }, { id: 'asc' }],
    });
  }

  async createAddress(userId: string, dto: CreateAddressDto) {
    // If this is the first address or marked as default, unset other defaults
    if (dto.isDefault) {
      await this.prisma.address.updateMany({
        where: { userId, isDefault: true },
        data: { isDefault: false },
      });
    }

    const count = await this.prisma.address.count({ where: { userId } });

    return this.prisma.address.create({
      data: {
        userId,
        label: dto.label,
        street: dto.street,
        number: dto.number,
        complement: dto.complement ?? null,
        neighborhood: dto.neighborhood,
        city: dto.city,
        state: dto.state,
        cep: dto.cep.replace(/\D/g, '').replace(/(\d{5})(\d{3})/, '$1-$2'),
        isDefault: dto.isDefault ?? count === 0, // First address is default
      },
    });
  }

  async updateAddress(
    userId: string,
    addressId: string,
    dto: UpdateAddressDto,
  ) {
    const address = await this.prisma.address.findFirst({
      where: { id: addressId, userId },
    });
    if (!address) {
      throw new NotFoundException('Endereço não encontrado');
    }

    // Default flip: clear any other default in the same tx so the
    // user never sees two defaults between writes. If the caller is
    // only flipping `isDefault: true`, no other field update happens.
    await this.prisma.$transaction(async (tx) => {
      if (dto.isDefault === true && !address.isDefault) {
        await tx.address.updateMany({
          where: { userId, isDefault: true },
          data: { isDefault: false },
        });
      }

      await tx.address.update({
        where: { id: addressId },
        data: {
          ...(dto.label !== undefined ? { label: dto.label } : {}),
          ...(dto.street !== undefined ? { street: dto.street } : {}),
          ...(dto.number !== undefined ? { number: dto.number } : {}),
          ...(dto.complement !== undefined ? { complement: dto.complement ?? null } : {}),
          ...(dto.neighborhood !== undefined ? { neighborhood: dto.neighborhood } : {}),
          ...(dto.city !== undefined ? { city: dto.city } : {}),
          ...(dto.state !== undefined ? { state: dto.state } : {}),
          ...(dto.cep !== undefined
            ? { cep: dto.cep.replace(/\D/g, '').replace(/(\d{5})(\d{3})/, '$1-$2') }
            : {}),
          ...(dto.isDefault !== undefined ? { isDefault: dto.isDefault } : {}),
        },
      });
    });

    return this.prisma.address.findUniqueOrThrow({ where: { id: addressId } });
  }

  async deleteAddress(userId: string, addressId: string) {
    const address = await this.prisma.address.findFirst({
      where: { id: addressId, userId },
    });

    if (!address) {
      throw new NotFoundException('Endereço não encontrado');
    }

    await this.prisma.address.delete({ where: { id: addressId } });

    // If deleted address was default, make the first remaining one default
    if (address.isDefault) {
      const first = await this.prisma.address.findFirst({
        where: { userId },
        orderBy: { id: 'asc' },
      });
      if (first) {
        await this.prisma.address.update({
          where: { id: first.id },
          data: { isDefault: true },
        });
      }
    }

    return { deleted: true };
  }

  // --- Follow ---

  async followUser(followerId: string, followingId: string) {
    if (followerId === followingId) {
      throw new ForbiddenException('Você não pode seguir a si mesmo');
    }

    const target = await this.prisma.user.findUnique({ where: { id: followingId } });
    if (!target) {
      throw new NotFoundException('Usuário não encontrado');
    }

    const upserted = await this.prisma.follow.upsert({
      where: { followerId_followingId: { followerId, followingId } },
      create: { followerId, followingId },
      update: {},
      // createdAt tells us whether this is a NEW follow (same ms as
      // just now) or an idempotent re-call. We only fire the notification
      // on the first edge so a client retrying doesn't spam the target.
      select: { createdAt: true },
    });
    const isNewEdge = Date.now() - upserted.createdAt.getTime() < 1000;

    await Promise.all([
      this.prisma.user.update({ where: { id: followingId }, data: { followerCount: { increment: 1 } } }),
      this.prisma.user.update({ where: { id: followerId }, data: { followingCount: { increment: 1 } } }),
    ]);

    if (isNewEdge) {
      const follower = await this.prisma.user.findUnique({
        where: { id: followerId },
        select: { name: true },
      });
      this.notifications
        .createNotification(
          followingId,
          'NEW_FOLLOWER',
          'Você tem um novo seguidor',
          `${follower?.name ?? 'Alguém'} começou a te seguir.`,
          { followerId },
          'followers',
        )
        .catch(() => {
          /* never let notification failure break a follow */
        });
    }

    return { following: true };
  }

  async unfollowUser(followerId: string, followingId: string) {
    const existing = await this.prisma.follow.findUnique({
      where: { followerId_followingId: { followerId, followingId } },
    });

    if (!existing) return { following: false };

    await this.prisma.follow.delete({
      where: { followerId_followingId: { followerId, followingId } },
    });

    await Promise.all([
      this.prisma.user.update({ where: { id: followingId }, data: { followerCount: { decrement: 1 } } }),
      this.prisma.user.update({ where: { id: followerId }, data: { followingCount: { decrement: 1 } } }),
    ]);

    return { following: false };
  }

  async listFollowers(userId: string, page = 1, pageSize = 30) {
    page = Math.max(1, Number(page) || 1);
    pageSize = Math.min(100, Math.max(1, Number(pageSize) || 30));
    const skip = (page - 1) * pageSize;

    const [rows, total] = await Promise.all([
      this.prisma.follow.findMany({
        where: { followingId: userId },
        orderBy: { createdAt: 'desc' },
        skip,
        take: pageSize,
        include: {
          follower: {
            select: {
              id: true,
              name: true,
              avatarUrl: true,
              ratingAvg: true,
              ratingCount: true,
              followerCount: true,
            },
          },
        },
      }),
      this.prisma.follow.count({ where: { followingId: userId } }),
    ]);

    return {
      items: rows.map((r) => ({
        id: r.follower.id,
        name: r.follower.name,
        avatarUrl: r.follower.avatarUrl,
        ratingAvg: r.follower.ratingAvg,
        ratingCount: r.follower.ratingCount,
        followerCount: r.follower.followerCount,
        followedAt: r.createdAt,
      })),
      total,
      page,
      totalPages: Math.max(1, Math.ceil(total / pageSize)),
    };
  }

  async listFollowing(userId: string, page = 1, pageSize = 30) {
    page = Math.max(1, Number(page) || 1);
    pageSize = Math.min(100, Math.max(1, Number(pageSize) || 30));
    const skip = (page - 1) * pageSize;

    const [rows, total] = await Promise.all([
      this.prisma.follow.findMany({
        where: { followerId: userId },
        orderBy: { createdAt: 'desc' },
        skip,
        take: pageSize,
        include: {
          following: {
            select: {
              id: true,
              name: true,
              avatarUrl: true,
              ratingAvg: true,
              ratingCount: true,
              followerCount: true,
            },
          },
        },
      }),
      this.prisma.follow.count({ where: { followerId: userId } }),
    ]);

    return {
      items: rows.map((r) => ({
        id: r.following.id,
        name: r.following.name,
        avatarUrl: r.following.avatarUrl,
        ratingAvg: r.following.ratingAvg,
        ratingCount: r.following.ratingCount,
        followerCount: r.following.followerCount,
        followedAt: r.createdAt,
      })),
      total,
      page,
      totalPages: Math.max(1, Math.ceil(total / pageSize)),
    };
  }

  // --- Storefront ---

  async getStorefront(username: string, page: number = 1, pageSize: number = 20) {
    page = Math.max(1, Number(page) || 1);
    pageSize = Math.min(100, Math.max(1, Number(pageSize) || 20));
    // Search by name field (case-insensitive) since User model has no username field
    const user = await this.prisma.user.findFirst({
      where: { name: { equals: username, mode: 'insensitive' } },
      select: {
        id: true,
        name: true,
        avatarUrl: true,
        bio: true,
        verified: true,
        cpfIdentityVerified: true,
        ratingAvg: true,
        ratingCount: true,
        followerCount: true,
        followingCount: true,
        createdAt: true,
      },
    });

    if (!user) {
      throw new NotFoundException('Loja não encontrada');
    }

    const skip = (page - 1) * pageSize;

    const [items, total] = await Promise.all([
      this.prisma.listing.findMany({
        where: { sellerId: user.id, status: 'ACTIVE' },
        include: {
          images: { orderBy: { position: 'asc' }, take: 1 },
          category: { select: { namePt: true, slug: true } },
          brand: { select: { name: true } },
        },
        orderBy: { createdAt: 'desc' },
        skip,
        take: pageSize,
      }),
      this.prisma.listing.count({
        where: { sellerId: user.id, status: 'ACTIVE' },
      }),
    ]);

    return {
      seller: user,
      listings: {
        items,
        total,
        page,
        pageSize,
        hasMore: skip + items.length < total,
      },
    };
  }

  async updateCoverPhoto(userId: string, coverPhotoUrl: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { id: true },
    });

    if (!user) {
      throw new NotFoundException('Usuário não encontrado');
    }

    return this.prisma.user.update({
      where: { id: userId },
      data: { coverPhotoUrl },
      select: {
        id: true,
        coverPhotoUrl: true,
      },
    });
  }

  // --- Vacation Mode ---

  async toggleVacationMode(userId: string, enabled: boolean, untilDate?: string) {
    const data: Record<string, unknown> = { vacationMode: enabled };

    if (enabled && untilDate) {
      data.vacationUntil = new Date(untilDate);
    } else if (!enabled) {
      data.vacationUntil = null;
    }

    const user = await this.prisma.user.update({
      where: { id: userId },
      data,
      select: { vacationMode: true, vacationUntil: true },
    });

    // Pause/unpause all listings. Collect ids BEFORE the updateMany so
    // we can reconcile search afterwards — syncSearchIndex re-reads
    // the row and indexes/removes based on the new status.
    const fromStatus = enabled ? 'ACTIVE' : 'PAUSED';
    const toStatus = enabled ? 'PAUSED' : 'ACTIVE';
    const affected = await this.prisma.listing.findMany({
      where: { sellerId: userId, status: fromStatus },
      select: { id: true },
    });
    await this.prisma.listing.updateMany({
      where: { sellerId: userId, status: fromStatus },
      data: { status: toStatus },
    });
    for (const { id } of affected) {
      this.listings.syncSearchIndex(id).catch(() => {});
    }

    return user;
  }

  // --- Account Deletion ---

  /**
   * OAuth-only users must confirm their identity via an emailed 6-digit code.
   * Returns without disclosing whether the user has a password set.
   */
  async requestDeletionConfirmation(userId: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, email: true, name: true, deletedAt: true },
    });

    if (!user) throw new NotFoundException('Usuário não encontrado');
    if (user.deletedAt) throw new BadRequestException('Conta já foi excluída');

    // Generate a cryptographically random 6-digit code
    const code = (crypto.randomInt(0, 1_000_000)).toString().padStart(6, '0');
    const codeHash = crypto.createHash('sha256').update(code).digest('hex');

    this.deletionCodes.set(user.id, {
      codeHash,
      expiresAt: Date.now() + this.DELETION_CODE_TTL_MS,
    });

    // Fire-and-forget email; never block response nor log the code
    this.emailService
      .sendDeletionConfirmationCode(user.email, user.name, code)
      .catch((e) => {
        this.logger.warn(
          `Falha ao enviar código de exclusão: ${String(e).slice(0, 200)}`,
        );
      });

    return {
      success: true,
      message:
        'Enviamos um código de 6 dígitos para o seu email. Use-o em até 15 minutos.',
    };
  }

  private verifyDeletionCode(userId: string, token: string): boolean {
    const entry = this.deletionCodes.get(userId);
    if (!entry) return false;
    if (Date.now() > entry.expiresAt) {
      this.deletionCodes.delete(userId);
      return false;
    }
    const providedHash = crypto
      .createHash('sha256')
      .update(token)
      .digest('hex');
    // Constant-time compare to avoid timing attacks
    if (providedHash.length !== entry.codeHash.length) return false;
    const ok = crypto.timingSafeEqual(
      Buffer.from(providedHash, 'hex'),
      Buffer.from(entry.codeHash, 'hex'),
    );
    if (ok) this.deletionCodes.delete(userId);
    return ok;
  }

  async deleteAccount(userId: string, dto: DeleteAccountDto) {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) throw new NotFoundException('Usuário não encontrado');
    if (user.deletedAt) {
      throw new BadRequestException('Conta já foi excluída');
    }

    const isOAuthOnly = !!user.socialProvider && !user.passwordHash;
    // Heuristic: users with a provider set but still having a passwordHash can
    // use either flow. Always accept whichever method they provide.
    if (dto.password) {
      const ok = await bcrypt.compare(dto.password, user.passwordHash ?? '');
      if (!ok) throw new UnauthorizedException('Senha incorreta');
    } else if (dto.confirmToken) {
      if (!this.verifyDeletionCode(userId, dto.confirmToken)) {
        throw new UnauthorizedException(
          'Código de confirmação inválido ou expirado',
        );
      }
    } else {
      throw new BadRequestException(
        isOAuthOnly
          ? 'Envie o código de confirmação (confirmToken) recebido por email'
          : 'A senha é obrigatória para excluir a conta',
      );
    }

    const now = new Date();
    const anonymizedEmail = `deleted-${user.id}@deleted.vintage.br`;

    // Snapshot the set of listings that will be DELETED inside the tx
    // so we can drop them from search once the commit lands.
    const listingsToDelete = await this.prisma.listing.findMany({
      where: { sellerId: userId, status: { in: ['ACTIVE', 'PAUSED'] } },
      select: { id: true },
    });

    await this.prisma.$transaction(async (tx) => {
      // Soft-delete: anonymize PII, set deletedAt, mark as banned to block login
      await tx.user.update({
        where: { id: userId },
        data: {
          deletedAt: now,
          isBanned: true,
          bannedAt: now,
          bannedReason: 'Conta excluída pelo usuário',
          email: anonymizedEmail,
          name: 'Usuário excluído',
          cpfEncrypted: null,
          cpfLookupHash: null,
          cnpj: null,
          phone: null,
          avatarUrl: null,
          coverPhotoUrl: null,
          bio: null,
          socialProvider: null,
          socialProviderId: null,
          twoFaSecret: null,
          twoFaEnabled: false,
          twoFaMethod: 'TOTP',
          twoFaPhone: null,
          twoFaPhoneVerifiedAt: null,
        },
      });

      // Saved PIX keys carry PII by definition (CPF / email / phone). The
      // anonymization above scrubs the User row, but leaving PayoutMethod
      // rows intact would still expose the raw values. Delete outright —
      // the user already kept the rows out of the anonymized response via
      // the maskPixKey view, but the DB must not retain them.
      //
      // Also clears the ON DELETE RESTRICT FK that would otherwise block
      // the 30-day hard-delete sweep if it ever graduates to a true
      // User row delete.
      await tx.payoutMethod.deleteMany({ where: { userId } });

      // Cancel active listings
      await tx.listing.updateMany({
        where: { sellerId: userId, status: { in: ['ACTIVE', 'PAUSED'] } },
        data: { status: 'DELETED' },
      });

      // Flag pending orders as buyer so support can refund unpaid ones
      // (we intentionally do NOT touch PAID/SHIPPED orders — those need manual
      // handling by support; those are preserved in the audit trail).
      await tx.order.updateMany({
        where: { buyerId: userId, status: 'PENDING' },
        data: { status: 'CANCELLED' },
      });

      // Block offers from this user
      await tx.offer.updateMany({
        where: { buyerId: userId, status: 'PENDING' },
        data: { status: 'REJECTED' },
      });

      // LGPD: consent history must be purged alongside PII (the linked
      // ipHash / user-agent rows re-identify the deleted account). We
      // delete inline inside the same transaction so the commit atomicity
      // matches the User row anonymization — no window where the User
      // row is anonymized but the consent trail still points at them.
      await tx.consentRecord.deleteMany({ where: { userId } });

      // Create audit record
      await tx.deletionAuditLog.create({
        data: {
          userId,
          reason: dto.reason ?? null,
        },
      });
    });

    // Evict now-DELETED listings from search. Fire-and-forget — the
    // DB state is already correct; the index is best-effort.
    for (const { id } of listingsToDelete) {
      this.listings.syncSearchIndex(id).catch(() => {});
    }

    this.logger.log(`Conta ${userId} soft-deleted (hard-delete em 30 dias)`);
    return { success: true };
  }

  /**
   * Scheduled sweep that hard-deletes soft-deleted users after the 30-day
   * LGPD retention window. Cascades via Prisma relations.
   */
  @Cron(CronExpression.EVERY_DAY_AT_3AM)
  async hardDeleteExpiredAccounts() {
    // Distributed lock — without it, every running API instance will
    // fire this sweep at 03:00 UTC simultaneously. Each pass is
    // already defensive (idempotent updateMany on deletionAuditLog
    // keyed by hardDeletedAt: null) but the parallel $transaction
    // calls still compete for the same cascading deletes and produce
    // noisy Prisma P2025 / constraint-race errors in the logs. Other
    // cron jobs in this repo all follow the same acquire-early-
    // return pattern (see apps/api/src/orders/orders-cron.service.ts).
    if (!(await this.cronLock.acquire('users:hardDeleteExpired'))) return;
    const cutoff = new Date(Date.now() - this.HARD_DELETE_GRACE_MS);
    const expired = await this.prisma.user.findMany({
      where: {
        deletedAt: { not: null, lt: cutoff },
        deletionAuditLogs: { some: { hardDeletedAt: null } },
      },
      select: { id: true },
      take: 50, // bounded to avoid long transactions
    });

    for (const u of expired) {
      try {
        await this.prisma.$transaction(async (tx) => {
          // Cascade child records that don't have onDelete: Cascade set
          await tx.favorite.deleteMany({ where: { userId: u.id } });
          await tx.priceDropAlert.deleteMany({ where: { userId: u.id } });
          await tx.savedSearch.deleteMany({ where: { userId: u.id } });
          await tx.address.deleteMany({ where: { userId: u.id } });
          await tx.deviceToken.deleteMany({ where: { userId: u.id } });
          await tx.notification.deleteMany({ where: { userId: u.id } });
          await tx.loginEvent.deleteMany({ where: { userId: u.id } });
          // Defense-in-depth — soft-delete already cleared these, but if a
          // user was soft-deleted before the cleanup landed, sweep them now.
          await tx.payoutMethod.deleteMany({ where: { userId: u.id } });
          await tx.userBlock.deleteMany({
            where: { OR: [{ blockerId: u.id }, { blockedId: u.id }] },
          });
          await tx.follow.deleteMany({
            where: { OR: [{ followerId: u.id }, { followingId: u.id }] },
          });
          // Preserve messages/listings/orders references (they remain linked
          // to the anonymized user record). Mark the audit entry as finalized.
          await tx.deletionAuditLog.updateMany({
            where: { userId: u.id, hardDeletedAt: null },
            data: { hardDeletedAt: new Date() },
          });
        });
        this.logger.log(`Hard-deleted expired user data for ${u.id}`);
      } catch (e) {
        this.logger.error(
          `Falha ao hard-delete usuário ${u.id}: ${String(e).slice(0, 200)}`,
        );
      }
    }
  }

  // --- Blocking ---

  async blockUser(blockerId: string, blockedId: string) {
    if (blockerId === blockedId) {
      throw new BadRequestException('Você não pode bloquear a si mesmo');
    }
    const target = await this.prisma.user.findUnique({
      where: { id: blockedId },
      select: { id: true },
    });
    if (!target) throw new NotFoundException('Usuário não encontrado');

    await this.prisma.userBlock.upsert({
      where: { blockerId_blockedId: { blockerId, blockedId } },
      create: { blockerId, blockedId },
      update: {},
    });

    return { blocked: true };
  }

  async unblockUser(blockerId: string, blockedId: string) {
    const existing = await this.prisma.userBlock.findUnique({
      where: { blockerId_blockedId: { blockerId, blockedId } },
    });
    if (!existing) return { blocked: false };

    await this.prisma.userBlock.delete({
      where: { blockerId_blockedId: { blockerId, blockedId } },
    });

    return { blocked: false };
  }

  async listBlocks(userId: string) {
    const rows = await this.prisma.userBlock.findMany({
      where: { blockerId: userId },
      orderBy: { createdAt: 'desc' },
      select: {
        blockedId: true,
        createdAt: true,
        blocked: {
          select: { id: true, name: true, avatarUrl: true },
        },
      },
    });

    return {
      items: rows.map((r) => ({
        userId: r.blockedId,
        blockedAt: r.createdAt,
        name: r.blocked.name,
        avatarUrl: r.blocked.avatarUrl,
      })),
      blockedIds: rows.map((r) => r.blockedId),
    };
  }

  /**
   * Checks whether messaging/offers between two users should be blocked.
   * Returns true if EITHER user has blocked the other, OR either is banned.
   */
  async isInteractionBlocked(a: string, b: string): Promise<boolean> {
    const [users, blocks] = await Promise.all([
      this.prisma.user.findMany({
        where: { id: { in: [a, b] } },
        select: { id: true, isBanned: true, deletedAt: true },
      }),
      this.prisma.userBlock.findFirst({
        where: {
          OR: [
            { blockerId: a, blockedId: b },
            { blockerId: b, blockedId: a },
          ],
        },
        select: { id: true },
      }),
    ]);
    if (users.some((u) => u.isBanned || u.deletedAt)) return true;
    return !!blocks;
  }

  // --- Admin Methods ---

  async listUsersAdmin(
    page: number,
    pageSize: number,
    search: string | undefined,
    adminId: string,
  ) {
    const skip = (page - 1) * pageSize;

    // Privacy audit trail — an admin who types an email into the search
    // box is effectively doing a targeted lookup against our user base.
    // Log every such query (with the admin's id + the substring) so a
    // compromised admin account can't silently enumerate emails
    // without leaving evidence. Audit entry is best-effort — a logging
    // failure must not break the admin tool.
    if (search && search.includes('@')) {
      this.logger.warn(
        `[privacy-audit] admin ${adminId} ran email-substring lookup: ${search.slice(0, 64)}`,
      );
    }

    const where = search
      ? {
          OR: [
            { name: { contains: search, mode: 'insensitive' as const } },
            { email: { contains: search, mode: 'insensitive' as const } },
          ],
        }
      : {};

    const [items, total] = await Promise.all([
      this.prisma.user.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip,
        take: pageSize,
        select: {
          id: true,
          name: true,
          email: true,
          role: true,
          isBanned: true,
          bannedReason: true,
          verified: true,
          createdAt: true,
          _count: {
            select: {
              listings: true,
              ordersBuyer: true,
              ordersSeller: true,
            },
          },
        },
      }),
      this.prisma.user.count({ where }),
    ]);

    return {
      items: items.map((u) => ({
        id: u.id,
        name: u.name,
        email: u.email,
        role: u.role,
        isBanned: u.isBanned,
        bannedReason: u.bannedReason,
        verified: u.verified,
        createdAt: u.createdAt,
        listingCount: u._count.listings,
        ordersBought: u._count.ordersBuyer,
        ordersSold: u._count.ordersSeller,
      })),
      total,
      page,
      pageSize,
      hasMore: skip + pageSize < total,
    };
  }

  async promoteToAdmin(userId: string, actorId: string | null = null) {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) throw new NotFoundException('Usuário não encontrado.');
    if (user.role === 'ADMIN') {
      throw new BadRequestException('Usuário já é administrador.');
    }

    await this.prisma.user.update({
      where: { id: userId },
      data: { role: 'ADMIN' },
    });

    await this.auditLog.record({
      actorId,
      action: 'user.promote_to_admin',
      targetType: 'user',
      targetId: userId,
      metadata: { previousRole: user.role },
    });

    return { success: true, message: `Usuário ${user.name} promovido a administrador.` };
  }

  // ── Notification preferences ──────────────────────────────────────────
  //
  // Stored flat on User (9 bool columns) rather than a separate table —
  // the set is fixed, there's no history requirement, and every pref
  // lookup happens in the same query as the user row anyway.
  //
  // Web's UI uses flat field names (orders, messages, ...); DB uses
  // `notif`-prefixed names to avoid collision and keep them grouped at
  // the end of the User row. The mapping is explicit below so a rename
  // on either side doesn't silently drift.
  async getNotificationPreferences(userId: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: {
        pushEnabled: true,
        emailEnabled: true,
        notifOrders: true,
        notifMessages: true,
        notifOffers: true,
        notifFollowers: true,
        notifPriceDrops: true,
        notifPromotions: true,
        notifNews: true,
        notifReviews: true,
        notifFavorites: true,
        notifDailyCap: true,
      },
    });
    if (!user) throw new NotFoundException('Usuário não encontrado.');
    return {
      pushEnabled: user.pushEnabled,
      emailEnabled: user.emailEnabled,
      orders: user.notifOrders,
      messages: user.notifMessages,
      offers: user.notifOffers,
      followers: user.notifFollowers,
      priceDrops: user.notifPriceDrops,
      promotions: user.notifPromotions,
      news: user.notifNews,
      reviews: user.notifReviews,
      favorites: user.notifFavorites,
      dailyCap: user.notifDailyCap,
    };
  }

  async updateNotificationPreferences(
    userId: string,
    patch: {
      pushEnabled?: boolean;
      emailEnabled?: boolean;
      orders?: boolean;
      messages?: boolean;
      offers?: boolean;
      followers?: boolean;
      priceDrops?: boolean;
      promotions?: boolean;
      news?: boolean;
      reviews?: boolean;
      favorites?: boolean;
      dailyCap?: number;
    },
  ) {
    // Build the DB patch only with fields the client actually sent.
    // Prisma treats undefined as "leave unchanged", so we could hand it
    // `{ notifOrders: patch.orders }` directly — but being explicit keeps
    // the column rename mapping in one place (grep-friendly).
    const data: Record<string, boolean | number> = {};
    if (patch.pushEnabled !== undefined) data.pushEnabled = patch.pushEnabled;
    if (patch.emailEnabled !== undefined) data.emailEnabled = patch.emailEnabled;
    if (patch.orders !== undefined) data.notifOrders = patch.orders;
    if (patch.messages !== undefined) data.notifMessages = patch.messages;
    if (patch.offers !== undefined) data.notifOffers = patch.offers;
    if (patch.followers !== undefined) data.notifFollowers = patch.followers;
    if (patch.priceDrops !== undefined) data.notifPriceDrops = patch.priceDrops;
    if (patch.promotions !== undefined) data.notifPromotions = patch.promotions;
    if (patch.news !== undefined) data.notifNews = patch.news;
    if (patch.reviews !== undefined) data.notifReviews = patch.reviews;
    if (patch.favorites !== undefined) data.notifFavorites = patch.favorites;
    if (patch.dailyCap !== undefined) {
      // 0 = unlimited, max 100 = defence against a client sending a
      // deranged value that would make the counter useless.
      data.notifDailyCap = Math.max(0, Math.min(100, Math.floor(patch.dailyCap)));
    }

    await this.prisma.user.update({ where: { id: userId }, data });
    return this.getNotificationPreferences(userId);
  }
}
