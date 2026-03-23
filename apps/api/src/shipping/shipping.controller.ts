import {
  Controller,
  Post,
  Get,
  Body,
  Param,
  Query,
  UseGuards,
} from '@nestjs/common';
import {
  ApiTags,
  ApiBearerAuth,
  ApiOperation,
  ApiQuery,
  ApiResponse,
} from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { ShippingService } from './shipping.service';

@ApiTags('shipping')
@Controller('shipping')
export class ShippingController {
  constructor(private readonly shippingService: ShippingService) {}

  @Post('rates')
  @ApiOperation({ summary: 'Calcular opções de frete' })
  @ApiResponse({ status: 200, description: 'Opções de frete calculadas' })
  calculateRates(
    @Body()
    body: {
      originCep: string;
      destinationCep: string;
      weightG: number;
      length?: number;
      width?: number;
      height?: number;
    },
  ) {
    return this.shippingService.calculateRates(
      body.originCep,
      body.destinationCep,
      body.weightG,
      body.length,
      body.width,
      body.height,
    );
  }

  @Post('label')
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard)
  @ApiOperation({ summary: 'Gerar etiqueta de envio (vendedor)' })
  @ApiResponse({ status: 201, description: 'Etiqueta gerada com sucesso' })
  generateLabel(
    @Body()
    body: {
      orderId: string;
      carrier: string;
      originAddress: string;
      destinationAddress: string;
      weightG: number;
    },
  ) {
    return this.shippingService.generateShippingLabel(
      body.orderId,
      body.carrier,
      body.originAddress,
      body.destinationAddress,
      body.weightG,
    );
  }

  @Get('tracking/:code')
  @ApiOperation({ summary: 'Consultar rastreamento do envio' })
  @ApiResponse({ status: 200, description: 'Eventos de rastreamento' })
  getTracking(@Param('code') code: string) {
    return this.shippingService.getTrackingStatus(code);
  }

  @Get('dropoff-points')
  @ApiOperation({ summary: 'Buscar pontos de coleta próximos' })
  @ApiQuery({ name: 'cep', required: true, description: 'CEP para busca' })
  @ApiQuery({ name: 'carrier', required: false, description: 'Filtrar por transportadora' })
  @ApiResponse({ status: 200, description: 'Lista de pontos de coleta' })
  getDropoffPoints(
    @Query('cep') cep: string,
    @Query('carrier') carrier?: string,
  ) {
    return this.shippingService.getDropoffPoints(cep, carrier);
  }
}
