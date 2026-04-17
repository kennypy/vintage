import { PartialType } from '@nestjs/swagger';
import { IsOptional, IsEnum } from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';
import { CreateListingDto } from './create-listing.dto';

enum ListingStatus {
  ACTIVE = 'ACTIVE',
  PAUSED = 'PAUSED',
  SOLD = 'SOLD',
  DELETED = 'DELETED',
}

export class UpdateListingDto extends PartialType(CreateListingDto) {
  @ApiPropertyOptional({ enum: ListingStatus, example: 'PAUSED' })
  @IsOptional()
  @IsEnum(ListingStatus)
  status?: ListingStatus;
}
