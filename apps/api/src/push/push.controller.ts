import {
  Controller,
  Post,
  Delete,
  Body,
  UseGuards,
  Request,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { IsString, IsIn } from 'class-validator';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { PushService } from './push.service';

class RegisterDeviceTokenDto {
  @IsString()
  token!: string;

  @IsString()
  @IsIn(['ios', 'android'], { message: 'Plataforma deve ser "ios" ou "android"' })
  platform!: 'ios' | 'android';
}

class UnregisterDeviceTokenDto {
  @IsString()
  token!: string;
}

@ApiTags('push')
@Controller('push')
export class PushController {
  constructor(private pushService: PushService) {}

  @Post('register')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Registrar device token para push notifications' })
  async registerToken(
    @Request() req: { user: { id: string } },
    @Body() dto: RegisterDeviceTokenDto,
  ) {
    await this.pushService.registerDeviceToken(
      req.user.id,
      dto.token,
      dto.platform,
    );
    return { message: 'Token registrado com sucesso' };
  }

  @Delete('unregister')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Remover device token de push notifications' })
  async unregisterToken(
    @Request() req: { user: { id: string } },
    @Body() dto: UnregisterDeviceTokenDto,
  ) {
    await this.pushService.removeDeviceToken(req.user.id, dto.token);
    return { message: 'Token removido com sucesso' };
  }
}
