import { Body, Controller, DefaultValuePipe, Get, Param, ParseIntPipe, Post, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { IsArray, IsEnum, IsOptional, IsString, Length } from 'class-validator';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { AdminGuard } from '../common/guards/admin.guard';
import { AuthUser, CurrentUser } from '../common/decorators/current-user.decorator';
import { SupportService } from './support.service';

class CreateTicketDto {
  @IsString()
  @Length(3, 200)
  subject!: string;

  @IsString()
  @Length(10, 5000)
  body!: string;

  @IsOptional()
  @IsEnum(['ORDER_ISSUE', 'PAYMENT', 'SHIPPING', 'REFUND', 'ACCOUNT', 'LISTING', 'FRAUD', 'OTHER'])
  category?: string;

  @IsOptional()
  @IsEnum(['LOW', 'NORMAL', 'HIGH', 'URGENT'])
  priority?: string;

  @IsOptional()
  @IsString()
  @Length(8, 128)
  orderId?: string;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  attachments?: string[];
}

class ReplyDto {
  @IsString()
  @Length(1, 5000)
  body!: string;
}

class ResolveDto {
  @IsOptional()
  @IsString()
  @Length(1, 5000)
  note?: string;
}

@ApiTags('support')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('support/tickets')
export class SupportController {
  constructor(private readonly support: SupportService) {}

  @Post()
  @ApiOperation({ summary: 'Abrir um ticket de suporte' })
  create(@CurrentUser() user: AuthUser, @Body() dto: CreateTicketDto) {
    return this.support.createTicket(user.id, dto);
  }

  @Get()
  @ApiOperation({ summary: 'Listar meus tickets' })
  list(
    @CurrentUser() user: AuthUser,
    @Query('page', new DefaultValuePipe(1), ParseIntPipe) page: number,
    @Query('pageSize', new DefaultValuePipe(20), ParseIntPipe) pageSize: number,
  ) {
    return this.support.getMyTickets(user.id, page, pageSize);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Ver detalhes de um ticket' })
  get(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.support.getTicket(id, user.id, false);
  }

  @Post(':id/reply')
  @ApiOperation({ summary: 'Responder a um ticket' })
  reply(@CurrentUser() user: AuthUser, @Param('id') id: string, @Body() dto: ReplyDto) {
    return this.support.replyToTicket(id, user.id, dto, false);
  }
}

@ApiTags('Admin Support')
@ApiBearerAuth()
@UseGuards(AdminGuard)
@Controller('admin/support/tickets')
export class AdminSupportController {
  constructor(private readonly support: SupportService) {}

  @Get(':id')
  @ApiOperation({ summary: 'Agent view of a ticket' })
  get(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.support.getTicket(id, user.id, true);
  }

  @Post(':id/reply')
  @ApiOperation({ summary: 'Agent reply' })
  reply(@CurrentUser() user: AuthUser, @Param('id') id: string, @Body() dto: ReplyDto) {
    return this.support.replyToTicket(id, user.id, dto, true);
  }

  @Post(':id/resolve')
  @ApiOperation({ summary: 'Resolve (close) a ticket' })
  resolve(@CurrentUser() user: AuthUser, @Param('id') id: string, @Body() dto: ResolveDto) {
    return this.support.resolveTicket(id, user.id, dto.note);
  }
}
