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
import { IsInt, IsString, Length, Min } from 'class-validator';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { CurrentUser, AuthUser } from '../common/decorators/current-user.decorator';
import { ShippingService } from './shipping.service';

class GenerateShippingLabelDto {
  @IsString()
  @Length(1, 64)
  orderId!: string;

  @IsString()
  @Length(1, 32)
  carrier!: string;

  @IsString()
  @Length(1, 512)
  originAddress!: string;

  @IsString()
  @Length(1, 512)
  destinationAddress!: string;

  @IsInt()
  @Min(1)
  weightG!: number;
}

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
  @ApiOperation({
    summary: 'Gerar etiqueta de envio (vendedor)',
    description:
      'Only the seller of orderId can generate a label. Previously the endpoint accepted any authenticated user, allowing a bystander to burn the real seller\'s carrier credits / generate spurious tracking codes.',
  })
  @ApiResponse({ status: 201, description: 'Etiqueta gerada com sucesso' })
  generateLabel(
    @Body() body: GenerateShippingLabelDto,
    @CurrentUser() user: AuthUser,
  ) {
    return this.shippingService.generateShippingLabel(
      body.orderId,
      body.carrier,
      body.originAddress,
      body.destinationAddress,
      body.weightG,
      user.id,
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
  @ApiQuery({
    name: 'carrier',
    required: false,
    description: 'Filtrar por transportadora',
  })
  @ApiResponse({ status: 200, description: 'Lista de pontos de coleta' })
  getDropoffPoints(
    @Query('cep') cep: string,
    @Query('carrier') carrier?: string,
  ) {
    return this.shippingService.getDropoffPoints(cep, carrier);
  }
}
