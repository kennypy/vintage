import { IsEnum, IsOptional, IsString, MaxLength } from 'class-validator';

export enum AdPlacement {
  DASHBOARD = 'dashboard',
  SEARCH = 'search',
  LISTING = 'listing',
  FEED = 'feed',
}

export class ServeAdDto {
  @IsEnum(AdPlacement)
  placement!: AdPlacement;

  // Opaque session ID from the client
  @IsString()
  @MaxLength(64)
  sessionId!: string;

  // SHA256 device fingerprint (client-computed)
  @IsOptional()
  @IsString()
  @MaxLength(64)
  deviceId?: string;
}
