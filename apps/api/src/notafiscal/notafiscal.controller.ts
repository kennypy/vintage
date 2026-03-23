import { Controller, Get, Post, Param, Query, UseGuards } from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation, ApiQuery } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { NotaFiscalService } from './notafiscal.service';

@ApiTags('nota-fiscal')
@Controller('nota-fiscal')
export class NotaFiscalController {
  constructor(private readonly notaFiscalService: NotaFiscalService) {}

  @Get('tax-preview')
  @ApiOperation({ summary: 'Pré-visualizar cálculo de impostos' })
  @ApiQuery({ name: 'price', type: Number, description: 'Preço do item em BRL' })
  @ApiQuery({ name: 'originState', type: String, description: 'UF de origem (ex: SP)' })
  @ApiQuery({ name: 'destinationState', type: String, description: 'UF de destino (ex: RJ)' })
  taxPreview(
    @Query('price') price: number,
    @Query('originState') originState: string,
    @Query('destinationState') destinationState: string,
  ) {
    return this.notaFiscalService.calculateTax(
      Number(price),
      originState,
      destinationState,
    );
  }

  @Post(':orderId')
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard)
  @ApiOperation({ summary: 'Gerar NF-e para pedido' })
  generateNFe(@Param('orderId') orderId: string) {
    return this.notaFiscalService.generateNFe(orderId);
  }

  @Get(':orderId')
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard)
  @ApiOperation({ summary: 'Consultar NF-e do pedido' })
  getNFe(@Param('orderId') orderId: string) {
    return this.notaFiscalService.getNFe(orderId);
  }
}
