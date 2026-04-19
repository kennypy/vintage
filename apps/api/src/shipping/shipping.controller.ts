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
import { IsInt, IsOptional, IsString, Length, Matches, Max, Min } from 'class-validator';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { CurrentUser, AuthUser } from '../common/decorators/current-user.decorator';
import { ShippingService } from './shipping.service';

// Brazilian CEP: 8 digits, optionally hyphenated (NNNNN-NNN). We accept both
// so the mobile / web clients don't have to strip formatting.
const CEP_REGEX = /^\d{5}-?\d{3}$/;

// Ceilings are picked to comfortably cover real P2P parcels (a heavy coat ~3kg,
// a large box ~100cm) while rejecting nonsense (weightG: 999999999 → burns
// third-party API quota, or worse produces a quote we'd honour).
const MAX_WEIGHT_G = 30_000; // 30 kg — above any Correios sedex ceiling
const MAX_DIMENSION_CM = 150; // 150 cm — above Correios' 100 cm rule

class CalculateRatesDto {
  @IsString()
  @Matches(CEP_REGEX, { message: 'originCep deve estar no formato NNNNN-NNN' })
  originCep!: string;

  @IsString()
  @Matches(CEP_REGEX, { message: 'destinationCep deve estar no formato NNNNN-NNN' })
  destinationCep!: string;

  @IsInt()
  @Min(1)
  @Max(MAX_WEIGHT_G)
  weightG!: number;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(MAX_DIMENSION_CM)
  length?: number;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(MAX_DIMENSION_CM)
  width?: number;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(MAX_DIMENSION_CM)
  height?: number;
}

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
  @Max(MAX_WEIGHT_G)
  weightG!: number;
}

class TrackingCodeParam {
  @IsString()
  @Matches(/^[A-Za-z0-9]{6,40}$/, {
    message: 'Código de rastreamento inválido',
  })
  code!: string;
}

class DropoffPointsQuery {
  @IsString()
  @Matches(CEP_REGEX, { message: 'cep deve estar no formato NNNNN-NNN' })
  cep!: string;

  @IsOptional()
  @IsString()
  @Length(1, 32)
  carrier?: string;
}

@ApiTags('shipping')
@Controller('shipping')
export class ShippingController {
  constructor(private readonly shippingService: ShippingService) {}

  @Post('rates')
  @ApiOperation({ summary: 'Calcular opções de frete' })
  @ApiResponse({ status: 200, description: 'Opções de frete calculadas' })
  calculateRates(@Body() body: CalculateRatesDto) {
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
  getTracking(@Param() params: TrackingCodeParam) {
    return this.shippingService.getTrackingStatus(params.code);
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
  getDropoffPoints(@Query() query: DropoffPointsQuery) {
    return this.shippingService.getDropoffPoints(query.cep, query.carrier);
  }
}
