import {
  Controller,
  Get,
  Post,
  Param,
  Body,
  Query,
  UseGuards,
  DefaultValuePipe,
  ParseIntPipe,
  BadRequestException,
  NotFoundException,
  Req,
} from '@nestjs/common';
import type { Request } from 'express';
import { ApiBearerAuth, ApiTags, ApiOperation } from '@nestjs/swagger';
import { IsOptional, IsString, Length } from 'class-validator';
import { AdminGuard } from '../common/guards/admin.guard';
import { CurrentUser, AuthUser } from '../common/decorators/current-user.decorator';
import { PrismaService } from '../prisma/prisma.service';
import { OrdersService } from '../orders/orders.service';
import { AuditLogService } from '../audit-log/audit-log.service';

class ForceHoldDto {
  @IsOptional()
  @IsString()
  @Length(1, 1000)
  reason?: string;
}

/**
 * Admin-only overrides for the escrow hold window. Use when a fraud
 * investigation or customer-service call requires either releasing
 * funds early or re-holding funds that already settled. Every action
 * is audit-logged.
 */
@ApiTags('Admin Orders')
@Controller('admin/orders')
@UseGuards(AdminGuard)
@ApiBearerAuth()
export class AdminOrdersController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly orders: OrdersService,
    private readonly auditLog: AuditLogService,
  ) {}

  @Get('held')
  @ApiOperation({ summary: 'Listar pedidos em custódia (HELD)' })
  listHeld(
    @Query('page', new DefaultValuePipe(1), ParseIntPipe) page: number,
    @Query('pageSize', new DefaultValuePipe(20), ParseIntPipe) pageSize: number,
  ) {
    const take = Math.min(pageSize, 100);
    const skip = (Math.max(1, page) - 1) * take;
    return this.prisma.order.findMany({
      where: { status: 'HELD' },
      include: {
        listing: { select: { title: true } },
        buyer: { select: { id: true, name: true, email: true } },
        seller: { select: { id: true, name: true, email: true } },
      },
      orderBy: { escrowReleasesAt: 'asc' },
      skip,
      take,
    });
  }

  @Post(':id/force-release')
  @ApiOperation({ summary: 'Forçar liberação imediata do escrow' })
  async forceRelease(
    @CurrentUser() admin: AuthUser,
    @Param('id') id: string,
    @Body() dto: ForceHoldDto,
    @Req() req: Request,
  ) {
    const order = await this.prisma.order.findUnique({
      where: { id },
      select: { status: true, sellerId: true, itemPriceBrl: true },
    });
    if (!order) throw new NotFoundException('Pedido não encontrado');
    if (order.status !== 'HELD') {
      throw new BadRequestException(
        `Só é possível forçar liberação de pedidos em HELD (status atual: ${order.status})`,
      );
    }
    const result = await this.orders.finalizeEscrow(id);
    await this.auditLog.record({
      actorId: admin.id,
      action: 'admin.orders.force_release',
      targetType: 'order',
      targetId: id,
      metadata: {
        sellerId: order.sellerId,
        itemPriceBrl: Number(order.itemPriceBrl),
        reason: dto.reason,
      },
      ipAddress: req.ip,
      userAgent: req.headers['user-agent'],
    });
    return result;
  }

  @Post(':id/force-hold')
  @ApiOperation({ summary: 'Forçar re-hold de um pedido recém-completado' })
  async forceHold(
    @CurrentUser() admin: AuthUser,
    @Param('id') id: string,
    @Body() dto: ForceHoldDto,
    @Req() req: Request,
  ) {
    if (!dto.reason) {
      throw new BadRequestException('Motivo é obrigatório para forçar re-hold');
    }
    const order = await this.prisma.order.findUnique({
      where: { id },
      select: { status: true, sellerId: true, itemPriceBrl: true },
    });
    if (!order) throw new NotFoundException('Pedido não encontrado');
    if (order.status !== 'COMPLETED') {
      throw new BadRequestException(
        `Só é possível re-hold de pedidos COMPLETED (status atual: ${order.status})`,
      );
    }
    // Re-hold: move balance → pending on seller wallet, reopen escrow window.
    const itemAmount = Number(order.itemPriceBrl);
    const updated = await this.prisma.$transaction(async (tx) => {
      const sellerWallet = await tx.wallet.upsert({
        where: { userId: order.sellerId },
        create: { userId: order.sellerId, balanceBrl: 0, pendingBrl: 0 },
        update: {},
      });
      await tx.wallet.update({
        where: { id: sellerWallet.id },
        data: {
          balanceBrl: { decrement: itemAmount },
          pendingBrl: { increment: itemAmount },
        },
      });
      const releasesAt = new Date();
      releasesAt.setDate(releasesAt.getDate() + 2);
      return tx.order.update({
        where: { id },
        data: { status: 'HELD', escrowReleasesAt: releasesAt },
      });
    });
    await this.auditLog.record({
      actorId: admin.id,
      action: 'admin.orders.force_hold',
      targetType: 'order',
      targetId: id,
      metadata: {
        sellerId: order.sellerId,
        itemPriceBrl: itemAmount,
        reason: dto.reason,
      },
      ipAddress: req.ip,
      userAgent: req.headers['user-agent'],
    });
    return updated;
  }
}
