import {
  Body,
  Controller,
  Param,
  Post,
  UseGuards,
} from '@nestjs/common';
import { ApiOperation, ApiSecurity, ApiTags } from '@nestjs/swagger';
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

/**
 * CRM → Vintage partner API. All calls authenticated by shared
 * `X-Partner-Key`. CSRF is skipped here because this path lives under
 * `partner/*` which is already on the CSRF exclude list in AppModule.
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
  @ApiOperation({
    summary: 'CRM agent posts a public reply visible to the user.',
  })
  reply(@Param('id') id: string, @Body() dto: AgentReplyDto) {
    return this.support.agentReply(id, {
      agentName: dto.agentName,
      body: dto.body,
      attachmentUrls: dto.attachmentUrls,
    });
  }

  @Post(':id/resolve')
  @ApiOperation({
    summary: 'CRM agent resolves (closes) the ticket.',
  })
  resolve(@Param('id') id: string, @Body() dto: AgentResolveDto) {
    return this.support.agentResolve(id, { agentName: dto.agentName, note: dto.note });
  }
}
