import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { SearchController } from './search.controller';
import { SearchService } from './search.service';
import { SavedSearchesController } from './saved-searches.controller';
import { PrismaModule } from '../prisma/prisma.module';

@Module({
  imports: [ConfigModule, PrismaModule],
  controllers: [SearchController, SavedSearchesController],
  providers: [SearchService],
  exports: [SearchService],
})
export class SearchModule {}
