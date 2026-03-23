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
import { OrdersService } from './orders.service';
import { CreateOrderDto } from './dto/create-order.dto';
import { ShipOrderDto } from './dto/ship-order.dto';

@ApiTags('orders')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('orders')
export class OrdersController {
  constructor(private readonly ordersService: OrdersService) {}

  @Post()
  @ApiOperation({ summary: 'Criar pedido a partir de um anúncio' })
  @ApiResponse({ status: 201, description: 'Pedido criado com sucesso' })
  create(@CurrentUser() user: AuthUser, @Body() dto: CreateOrderDto) {
    return this.ordersService.create(user.id, dto);
  }

  @Get()
  @ApiOperation({ summary: 'Listar pedidos do usuário (como comprador ou vendedor)' })
  @ApiQuery({ name: 'role', enum: ['buyer', 'seller'], required: false })
  @ApiQuery({ name: 'page', required: false, type: Number })
  @ApiQuery({ name: 'pageSize', required: false, type: Number })
  findAll(
    @CurrentUser() user: AuthUser,
    @Query('role', new DefaultValuePipe('buyer')) role: 'buyer' | 'seller',
    @Query('page', new DefaultValuePipe(1), ParseIntPipe) page: number,
    @Query('pageSize', new DefaultValuePipe(20), ParseIntPipe) pageSize: number,
  ) {
    return this.ordersService.findUserOrders(user.id, role, page, pageSize);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Detalhes do pedido' })
  @ApiResponse({ status: 200, description: 'Detalhes do pedido' })
  findOne(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.ordersService.findOne(id, user.id);
  }

  @Patch(':id/ship')
  @ApiOperation({ summary: 'Vendedor marca pedido como enviado' })
  @ApiResponse({ status: 200, description: 'Pedido marcado como enviado' })
  ship(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Body() dto: ShipOrderDto,
  ) {
    return this.ordersService.markShipped(id, user.id, dto);
  }

  @Patch(':id/confirm')
  @ApiOperation({ summary: 'Comprador confirma recebimento ("Tudo certo")' })
  @ApiResponse({ status: 200, description: 'Recebimento confirmado, fundos liberados' })
  confirm(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.ordersService.confirmReceipt(id, user.id);
  }
}
