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
import { UploadsService } from './uploads.service';
import { UploadImageResponse } from './dto/upload-response.dto';

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
  @UseInterceptors(FileInterceptor('file'))
  @ApiConsumes('multipart/form-data')
  @ApiOperation({ summary: 'Upload de imagem para anúncio' })
  @ApiResponse({ status: 201, description: 'Imagem enviada com sucesso' })
  @ApiResponse({ status: 400, description: 'Arquivo inválido' })
  async uploadListingImage(
    @UploadedFile() file: UploadedFileInfo,
  ): Promise<UploadImageResponse> {
    if (!file || !file.buffer) {
      throw new BadRequestException('Nenhum arquivo enviado.');
    }

    return this.uploadsService.uploadListingImage(
      file.buffer,
      file.originalname,
      file.mimetype,
    );
  }

  @Delete(':key')
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard)
  @ApiOperation({ summary: 'Remover imagem' })
  @ApiResponse({ status: 200, description: 'Imagem removida' })
  async deleteImage(@Param('key') key: string) {
    await this.uploadsService.deleteImage(key);
    return { deleted: true };
  }
}
