import { Controller, Post, Body, UseGuards } from '@nestjs/common';
import {
  ApiTags,
  ApiBearerAuth,
  ApiOperation,
  ApiResponse,
} from '@nestjs/swagger';
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
