import {
  Controller,
  Get,
  Post,
  Param,
  Body,
  Headers,
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
import { PaymentsService } from './payments.service';

@ApiTags('payments')
@Controller('payments')
export class PaymentsController {
  constructor(private readonly paymentsService: PaymentsService) {}

  @Post('pix')
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard)
  @ApiOperation({ summary: 'Criar pagamento via PIX' })
  @ApiResponse({ status: 201, description: 'Pagamento PIX criado' })
  createPix(
    @CurrentUser() user: AuthUser,
    @Body() body: { orderId: string; amountBrl: number },
  ) {
    return this.paymentsService.createPixPayment(body.orderId, body.amountBrl);
  }

  @Post('card')
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard)
  @ApiOperation({ summary: 'Criar pagamento via cartão de crédito' })
  @ApiResponse({ status: 201, description: 'Pagamento com cartão criado' })
  createCard(
    @CurrentUser() user: AuthUser,
    @Body() body: { orderId: string; amountBrl: number; installments: number },
  ) {
    return this.paymentsService.createCardPayment(
      body.orderId,
      body.amountBrl,
      body.installments,
    );
  }

  @Post('boleto')
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard)
  @ApiOperation({ summary: 'Criar pagamento via boleto bancário' })
  @ApiResponse({ status: 201, description: 'Boleto gerado' })
  createBoleto(
    @CurrentUser() user: AuthUser,
    @Body() body: { orderId: string; amountBrl: number },
  ) {
    return this.paymentsService.createBoletoPayment(
      body.orderId,
      body.amountBrl,
    );
  }

  @Post('webhook')
  @ApiOperation({ summary: 'Receber webhook de pagamento (Mercado Pago)' })
  @ApiResponse({ status: 200, description: 'Webhook processado' })
  handleWebhook(
    @Body() payload: Record<string, unknown>,
    @Headers('x-signature') signature?: string,
  ) {
    return this.paymentsService.handleWebhook(payload, signature);
  }

  @Get(':id')
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard)
  @ApiOperation({ summary: 'Consultar status do pagamento' })
  @ApiResponse({ status: 200, description: 'Status do pagamento' })
  getStatus(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.paymentsService.getPaymentStatus(id);
  }
}
