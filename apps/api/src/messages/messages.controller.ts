import { Controller, Get, Post, Param, Body, Query, UseGuards } from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { CurrentUser, AuthUser } from '../common/decorators/current-user.decorator';
import { MessagesService } from './messages.service';

@ApiTags('messages')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller()
export class MessagesController {
  constructor(private readonly messagesService: MessagesService) {}

  @Get('conversations')
  @ApiOperation({ summary: 'Listar conversas' })
  listConversations(@CurrentUser() user: AuthUser) {
    return this.messagesService.getConversations(user.id);
  }

  @Post('conversations')
  @ApiOperation({ summary: 'Iniciar conversa' })
  startConversation(
    @Body() body: { otherUserId: string },
    @CurrentUser() user: AuthUser,
  ) {
    return this.messagesService.startConversation(user.id, body.otherUserId);
  }

  @Get('conversations/:id/messages')
  @ApiOperation({ summary: 'Ver mensagens da conversa' })
  getMessages(
    @Param('id') id: string,
    @CurrentUser() user: AuthUser,
    @Query('page') page: number = 1,
  ) {
    return this.messagesService.getMessages(id, user.id, page);
  }

  @Post('conversations/:id/messages')
  @ApiOperation({ summary: 'Enviar mensagem' })
  sendMessage(
    @Param('id') id: string,
    @Body() body: { body: string },
    @CurrentUser() user: AuthUser,
  ) {
    return this.messagesService.sendMessage(id, user.id, body.body);
  }
}
