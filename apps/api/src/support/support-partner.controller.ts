import {
  Body,
  Controller,
  Headers,
  Param,
  Post,
  UseGuards,
} from '@nestjs/common';
import { ApiHeader, ApiOperation, ApiSecurity, ApiTags } from '@nestjs/swagger';
import { IsArray, IsOptional, IsString, Length } from 'class-validator';
import { CrmPartnerAuthGuard } from './crm-partner-auth.guard';
import { SupportService } from './support.service';

class AgentReplyDto {
  @IsString()
  @Length(1, 80)
  agentName!: string;

  @IsString()
  @Length(1, 5000)
  body!: string;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  attachmentUrls?: string[];
}

class AgentResolveDto {
  @IsString()
  @Length(1, 80)
  agentName!: string;

  @IsOptional()
  @IsString()
  @Length(1, 5000)
  note?: string;
}

/** HTTP's conventional idempotency header. Max 200 chars — real clients
 *  use UUIDs; the cap just rejects abusively long values early. */
const MAX_IDEMPOTENCY_KEY_LENGTH = 200;
function sanitizeIdempotencyKey(raw: string | undefined): string | undefined {
  if (typeof raw !== 'string') return undefined;
  const trimmed = raw.trim();
  if (!trimmed) return undefined;
  if (trimmed.length > MAX_IDEMPOTENCY_KEY_LENGTH) return undefined;
  return trimmed;
}

/**
 * CRM → Vintage partner API. All calls authenticated by shared
 * `X-Partner-Key`. CSRF is skipped here because this path lives under
 * `partner/*` which is already on the CSRF exclude list in AppModule.
 *
 * Both endpoints accept an `Idempotency-Key` header. Callers should
 * pass the outbound job UUID so a retry-after-response-side-timeout
 * returns the existing row instead of creating a duplicate. The key
 * is globally unique across all agent messages.
 *
 * These endpoints replace day-to-day use of AdminSupportController —
 * that one is now breakglass-only for incidents where CRM is down.
 */
@ApiTags('partner-support')
@ApiSecurity('partner-key')
@UseGuards(CrmPartnerAuthGuard)
@Controller('partner/support/tickets')
export class SupportPartnerController {
  constructor(private readonly support: SupportService) {}

  @Post(':id/reply')
  @ApiOperation({ summary: 'CRM agent posts a public reply visible to the user.' })
  @ApiHeader({
    name: 'Idempotency-Key',
    required: false,
    description: 'Retry-safe identifier (outbound job UUID).',
  })
  reply(
    @Param('id') id: string,
    @Body() dto: AgentReplyDto,
    @Headers('idempotency-key') idempotencyKey?: string,
  ) {
    return this.support.agentReply(id, {
      agentName: dto.agentName,
      body: dto.body,
      attachmentUrls: dto.attachmentUrls,
      idempotencyKey: sanitizeIdempotencyKey(idempotencyKey),
    });
  }

  @Post(':id/resolve')
  @ApiOperation({ summary: 'CRM agent resolves (closes) the ticket.' })
  @ApiHeader({
    name: 'Idempotency-Key',
    required: false,
    description: 'Retry-safe identifier (outbound job UUID). Dedupes the optional note.',
  })
  resolve(
    @Param('id') id: string,
    @Body() dto: AgentResolveDto,
    @Headers('idempotency-key') idempotencyKey?: string,
  ) {
    return this.support.agentResolve(id, {
      agentName: dto.agentName,
      note: dto.note,
      idempotencyKey: sanitizeIdempotencyKey(idempotencyKey),
    });
  }
}
