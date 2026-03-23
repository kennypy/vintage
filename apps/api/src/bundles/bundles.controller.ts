import {
  Controller, Get, Post, Delete, Param, Body, UseGuards,
} from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { CurrentUser, AuthUser } from '../common/decorators/current-user.decorator';
import { BundlesService } from './bundles.service';
import { CreateBundleDto } from './dto/create-bundle.dto';

@ApiTags('bundles')
@Controller('bundles')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
export class BundlesController {
  constructor(private readonly bundlesService: BundlesService) {}

  @Post()
  @ApiOperation({ summary: 'Criar pacote de anúncios' })
  create(@Body() dto: CreateBundleDto, @CurrentUser() user: AuthUser) {
    return this.bundlesService.create(user.id, dto);
  }

  @Get()
  @ApiOperation({ summary: 'Listar pacotes do usuário' })
  getUserBundles(@CurrentUser() user: AuthUser) {
    return this.bundlesService.getUserBundles(user.id);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Ver detalhes do pacote' })
  getBundle(@Param('id') id: string, @CurrentUser() user: AuthUser) {
    return this.bundlesService.getBundle(id, user.id);
  }

  @Delete(':id/items/:listingId')
  @ApiOperation({ summary: 'Remover anúncio do pacote' })
  removeItem(
    @Param('id') id: string,
    @Param('listingId') listingId: string,
    @CurrentUser() user: AuthUser,
  ) {
    return this.bundlesService.removeItem(id, listingId, user.id);
  }

  @Post(':id/checkout')
  @ApiOperation({ summary: 'Finalizar compra do pacote com frete combinado' })
  checkoutBundle(
    @Param('id') id: string,
    @Body() body: { addressId: string; paymentMethod: string },
    @CurrentUser() user: AuthUser,
  ) {
    return this.bundlesService.checkoutBundle(id, user.id, body.addressId, body.paymentMethod);
  }
}
