import {
  Controller,
  Get,
  Post,
  Param,
  Body,
  Headers,
  Req,
  UseGuards,
  type RawBodyRequest,
} from '@nestjs/common';
import type { Request } from 'express';
import {
  ApiTags,
  ApiBearerAuth,
  ApiOperation,
  ApiResponse,
} from '@nestjs/swagger';
import { ThrottlerGuard, Throttle } from '@nestjs/throttler';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { CurrentUser, AuthUser } from '../common/decorators/current-user.decorator';
import { PaymentsService } from './payments.service';
import { CreateBoletoDto, CreateCardDto, CreatePixDto } from './dto/create-payment.dto';

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
    @Body() body: CreatePixDto,
  ) {
    return this.paymentsService.createPixPayment(body.orderId, user.id);
  }

  @Post('card')
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard)
  @ApiOperation({ summary: 'Criar pagamento via cartão de crédito' })
  @ApiResponse({ status: 201, description: 'Pagamento com cartão criado' })
  createCard(
    @CurrentUser() user: AuthUser,
    @Body() body: CreateCardDto,
  ) {
    return this.paymentsService.createCardPayment(
      body.orderId,
      user.id,
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
    @Body() body: CreateBoletoDto,
  ) {
    return this.paymentsService.createBoletoPayment(body.orderId, user.id);
  }

  @Post('webhook')
  @UseGuards(ThrottlerGuard)
  @Throttle({ default: { ttl: 60000, limit: 30 } })
  @ApiOperation({ summary: 'Receber webhook de pagamento (Mercado Pago)' })
  @ApiResponse({ status: 200, description: 'Webhook processado' })
  @ApiResponse({ status: 401, description: 'Assinatura inválida' })
  @ApiResponse({ status: 400, description: 'Payload inválido' })
  handleWebhook(
    @Req() req: RawBodyRequest<Request>,
    @Body() payload: Record<string, unknown>,
    @Headers('x-signature') signature?: string,
  ) {
    // HMAC verification MUST run on the exact bytes Mercado Pago signed.
    // main.ts opted into rawBody capture so req.rawBody contains those
    // bytes; passing the parsed JSON would let an attacker forge a
    // payload whose stringified form happens to match a known signature.
    const rawBody = req.rawBody;
    return this.paymentsService.handleWebhook(rawBody, payload, signature);
  }

  @Get(':id')
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard)
  @ApiOperation({ summary: 'Consultar status do pagamento' })
  @ApiResponse({ status: 200, description: 'Status do pagamento' })
  getStatus(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.paymentsService.getPaymentStatus(id, user.id);
  }
}
