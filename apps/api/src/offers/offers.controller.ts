import {
  Controller,
  Get,
  Post,
  Patch,
  Param,
  Body,
  Query,
  UseGuards,
  DefaultValuePipe,
  ParseIntPipe,
} from '@nestjs/common';
import {
  ApiTags,
  ApiBearerAuth,
  ApiOperation,
  ApiQuery,
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

  @Get()
  @ApiOperation({ summary: 'Listar ofertas do usuário (recebidas ou enviadas)' })
  @ApiQuery({ name: 'type', enum: ['received', 'sent'], required: false })
  @ApiQuery({ name: 'page', required: false, type: Number })
  @ApiQuery({ name: 'pageSize', required: false, type: Number })
  findAll(
    @CurrentUser() user: AuthUser,
    @Query('type', new DefaultValuePipe('received')) type: 'received' | 'sent',
    @Query('page', new DefaultValuePipe(1), ParseIntPipe) page: number,
    @Query('pageSize', new DefaultValuePipe(20), ParseIntPipe) pageSize: number,
  ) {
    return this.offersService.findUserOffers(user.id, type, page, pageSize);
  }

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
