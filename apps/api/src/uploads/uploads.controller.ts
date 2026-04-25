import {
  Controller,
  Post,
  Delete,
  Param,
  UseGuards,
  UseInterceptors,
  UploadedFile,
  BadRequestException,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import {
  ApiTags,
  ApiBearerAuth,
  ApiOperation,
  ApiResponse,
  ApiConsumes,
} from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { CurrentUser, AuthUser } from '../common/decorators/current-user.decorator';
import { UploadsService } from './uploads.service';
import { UploadImageResponse } from './dto/upload-response.dto';

// Stream-level upload limits enforced by Multer BEFORE the file is buffered
// in memory. The service-layer validateFileSize() runs only after the full
// payload has been read, so without these limits a 500 MB POST could exhaust
// process memory before being rejected. Multer aborts the upload as soon as
// `fileSize` is exceeded and surfaces a `LIMIT_FILE_SIZE` error to the
// controller, which our global exception filter translates to a 413.
const IMAGE_UPLOAD_LIMIT_BYTES = 10 * 1024 * 1024;   // 10 MB
const VIDEO_UPLOAD_LIMIT_BYTES = 100 * 1024 * 1024;  // 100 MB

/** Subset of Multer.File used in this controller. */
interface UploadedFileInfo {
  buffer: Buffer;
  originalname: string;
  mimetype: string;
  size: number;
}

@ApiTags('uploads')
@Controller('uploads')
export class UploadsController {
  constructor(private readonly uploadsService: UploadsService) {}

  @Post('listing-image')
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard)
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: IMAGE_UPLOAD_LIMIT_BYTES, files: 1 } }))
  @ApiConsumes('multipart/form-data')
  @ApiOperation({ summary: 'Upload de imagem para anúncio' })
  @ApiResponse({ status: 201, description: 'Imagem enviada com sucesso' })
  @ApiResponse({ status: 400, description: 'Arquivo inválido' })
  async uploadListingImage(
    @UploadedFile() file: UploadedFileInfo,
    @CurrentUser() user: AuthUser,
  ): Promise<UploadImageResponse> {
    if (!file || !file.buffer) {
      throw new BadRequestException('Nenhum arquivo enviado.');
    }

    return this.uploadsService.uploadListingImage(
      file.buffer,
      file.originalname,
      file.mimetype,
      user.id,
    );
  }

  @Post('avatar')
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard)
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: IMAGE_UPLOAD_LIMIT_BYTES, files: 1 } }))
  @ApiConsumes('multipart/form-data')
  @ApiOperation({ summary: 'Upload de avatar de perfil (JPEG/PNG, máx 10MB, 512x512)' })
  @ApiResponse({ status: 201, description: 'Avatar enviado', schema: { properties: { url: { type: 'string' }, key: { type: 'string' } } } })
  @ApiResponse({ status: 400, description: 'Arquivo inválido' })
  async uploadAvatar(
    @UploadedFile() file: UploadedFileInfo,
    @CurrentUser() user: AuthUser,
  ): Promise<{ url: string; key: string }> {
    if (!file || !file.buffer) {
      throw new BadRequestException('Nenhum arquivo enviado.');
    }
    return this.uploadsService.uploadAvatar(
      file.buffer,
      file.originalname,
      file.mimetype,
      user.id,
    );
  }

  @Post('listing-video')
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard)
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: VIDEO_UPLOAD_LIMIT_BYTES, files: 1 } }))
  @ApiConsumes('multipart/form-data')
  @ApiOperation({ summary: 'Upload de vídeo para anúncio (MP4/MOV, máx 100MB, 30s)' })
  @ApiResponse({ status: 201, description: 'Vídeo enviado com sucesso', schema: { properties: { url: { type: 'string' }, key: { type: 'string' } } } })
  @ApiResponse({ status: 400, description: 'Arquivo inválido' })
  async uploadListingVideo(
    @UploadedFile() file: UploadedFileInfo,
    @CurrentUser() user: AuthUser,
  ): Promise<{ url: string; key: string }> {
    if (!file || !file.buffer) {
      throw new BadRequestException('Nenhum arquivo de vídeo enviado.');
    }
    return this.uploadsService.uploadListingVideo(
      file.buffer,
      file.originalname,
      file.mimetype,
      user.id,
    );
  }

  @Delete(':key')
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard)
  @ApiOperation({
    summary: 'Remover imagem ou vídeo',
    description:
      'Only the owner of the resource can delete. Listing media is gated by listing.sellerId; avatars are gated by the path matching the user\'s current avatarUrl.',
  })
  @ApiResponse({ status: 200, description: 'Arquivo removido' })
  async deleteImage(
    @Param('key') key: string,
    @CurrentUser() user: AuthUser,
  ) {
    await this.uploadsService.deleteImage(key, user.id);
    return { deleted: true };
  }
}
