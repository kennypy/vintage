import { Controller, Post, Body, UseGuards } from '@nestjs/common';
import {
  ApiTags,
  ApiBearerAuth,
  ApiOperation,
  ApiResponse,
} from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { AdminGuard } from '../common/guards/admin.guard';
import { CouponsService } from './coupons.service';
import { ValidateCouponDto } from './dto/validate-coupon.dto';
import { CreateCouponDto } from './dto/create-coupon.dto';

@ApiTags('coupons')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('coupons')
export class CouponsController {
  constructor(private readonly couponsService: CouponsService) {}

  @Post('validate')
  // Tight throttle on coupon code validation. Without it, an
  // authenticated user could brute-force the code namespace by
  // spamming /validate (our codes are short enough that naive
  // enumeration is feasible within an hour). 20 attempts per 15 minutes
  // is well above normal checkout flow and well below brute-force rates.
  @Throttle({ default: { limit: 20, ttl: 15 * 60 * 1000 } })
  @ApiOperation({ summary: 'Validar cupom de desconto e calcular desconto' })
  @ApiResponse({ status: 200, description: 'Cupom válido com valor do desconto' })
  @ApiResponse({ status: 404, description: 'Cupom não encontrado' })
  @ApiResponse({ status: 400, description: 'Cupom inválido, expirado ou esgotado' })
  validate(@Body() dto: ValidateCouponDto) {
    return this.couponsService.validate(dto.code, dto.orderTotal);
  }

  @Post()
  @UseGuards(AdminGuard)
  @ApiOperation({ summary: 'Criar novo cupom (admin)' })
  @ApiResponse({ status: 201, description: 'Cupom criado com sucesso' })
  create(@Body() dto: CreateCouponDto) {
    return this.couponsService.create(dto);
  }
}
