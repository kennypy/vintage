import { IsInt, Min, Max, IsString, IsOptional, Length } from 'class-validator';

export class CreateReviewDto {
  orderId: string;
  ratedUserId: string;

  @IsInt()
  @Min(1)
  @Max(5)
  rating: number;

  @IsOptional()
  @IsString()
  @Length(0, 500)
  comment?: string;
}
