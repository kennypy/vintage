import {
  Controller,
  Post,
  Patch,
  Param,
  Body,
  UseGuards,
} from '@nestjs/common';
import {
  ApiTags,
  ApiBearerAuth,
  ApiOperation,
  ApiResponse,
} from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { CurrentUser, AuthUser } from '../common/decorators/current-user.decorator';
import { OffersService } from './offers.service';
import { CreateOfferDto } from './dto/create-offer.dto';

@ApiTags('offers')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('offers')
export class OffersController {
  constructor(private readonly offersService: OffersService) {}

  @Post()
  @ApiOperation({ summary: 'Fazer oferta em um anúncio' })
  @ApiResponse({ status: 201, description: 'Oferta criada com sucesso' })
  create(@CurrentUser() user: AuthUser, @Body() dto: CreateOfferDto) {
    return this.offersService.create(user.id, dto);
  }

  @Patch(':id/accept')
  @ApiOperation({ summary: 'Vendedor aceita a oferta' })
  @ApiResponse({ status: 200, description: 'Oferta aceita' })
  accept(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.offersService.accept(id, user.id);
  }

  @Patch(':id/reject')
  @ApiOperation({ summary: 'Vendedor rejeita a oferta' })
  @ApiResponse({ status: 200, description: 'Oferta rejeitada' })
  reject(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.offersService.reject(id, user.id);
  }
}
