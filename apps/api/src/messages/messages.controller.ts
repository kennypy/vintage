import { Controller, Get, Post, Param, Body, UseGuards } from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { MessagesService } from './messages.service';

@ApiTags('messages')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller()
export class MessagesController {
  constructor(private readonly messagesService: MessagesService) {}

  @Get('conversations')
  @ApiOperation({ summary: 'List conversations' })
  listConversations() {
    return { message: 'TODO' };
  }

  @Get('conversations/:id/messages')
  @ApiOperation({ summary: 'Get messages in conversation' })
  getMessages(@Param('id') _id: string) {
    return { message: 'TODO' };
  }

  @Post('conversations/:id/messages')
  @ApiOperation({ summary: 'Send message in conversation' })
  sendMessage(@Param('id') _id: string, @Body() _body: any) {
    return { message: 'TODO' };
  }
}
