import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { FavoriteCollectionsController } from './favorite-collections.controller';
import { FavoriteCollectionsService } from './favorite-collections.service';

@Module({
  imports: [PrismaModule],
  controllers: [FavoriteCollectionsController],
  providers: [FavoriteCollectionsService],
  exports: [FavoriteCollectionsService],
})
export class FavoriteCollectionsModule {}
