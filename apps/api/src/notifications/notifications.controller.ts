import { Controller, Get, Patch, Param, Post, Query, UseGuards, Body } from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { CurrentUser, AuthUser } from '../common/decorators/current-user.decorator';
import { NotificationsService } from './notifications.service';
import { FcmService } from './fcm.service';

@ApiTags('notifications')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('notifications')
export class NotificationsController {
  constructor(
    private readonly notificationsService: NotificationsService,
    private readonly fcmService: FcmService,
  ) {}

  @Get()
  @ApiOperation({ summary: 'Listar notificações' })
  findAll(@CurrentUser() user: AuthUser, @Query('page') page: number = 1) {
    return this.notificationsService.getNotifications(user.id, page);
  }

  @Patch(':id/read')
  @ApiOperation({ summary: 'Marcar como lida' })
  markAsRead(@Param('id') id: string, @CurrentUser() user: AuthUser) {
    return this.notificationsService.markAsRead(id, user.id);
  }

  @Post('read-all')
  @ApiOperation({ summary: 'Marcar todas como lidas' })
  markAllAsRead(@CurrentUser() user: AuthUser) {
    return this.notificationsService.markAllAsRead(user.id);
  }

  @Post('device-token/register')
  @ApiOperation({ summary: 'Registrar token de dispositivo para push notifications' })
  registerDeviceToken(
    @CurrentUser() user: AuthUser,
    @Body() body: { token: string },
  ) {
    return this.fcmService.registerDeviceToken(user.id, body.token);
  }
}
