import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Body,
  Param,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { AdminGuard } from '../common/guards/admin.guard';
import { CurrentUser, AuthUser } from '../common/decorators/current-user.decorator';
import { FeatureFlagsService } from './feature-flags.service';
import { CreateFeatureFlagDto } from './dto/create-feature-flag.dto';
import { UpdateFeatureFlagDto } from './dto/update-feature-flag.dto';

@ApiTags('Feature Flags')
@Controller()
export class FeatureFlagsController {
  constructor(private readonly featureFlagsService: FeatureFlagsService) {}

  @Get('feature-flags')
  findAll() {
    // Public endpoint: mobile + web clients need to know which features
    // are active on boot. Returns only { key, enabled } — internal
    // description / metadata / updatedAt stay admin-only so we don't
    // leak planned features or internal rollout context.
    return this.featureFlagsService.findAllPublic();
  }

  @Get('admin/feature-flags')
  @UseGuards(AdminGuard)
  @ApiBearerAuth()
  findAllAdmin() {
    return this.featureFlagsService.findAll();
  }

  @Post('admin/feature-flags')
  @UseGuards(AdminGuard)
  @ApiBearerAuth()
  create(@Body() dto: CreateFeatureFlagDto, @CurrentUser() user: AuthUser) {
    return this.featureFlagsService.create(dto, user.id);
  }

  @Patch('admin/feature-flags/:id')
  @UseGuards(AdminGuard)
  @ApiBearerAuth()
  update(
    @Param('id') id: string,
    @Body() dto: UpdateFeatureFlagDto,
    @CurrentUser() user: AuthUser,
  ) {
    return this.featureFlagsService.update(id, dto, user.id);
  }

  @Delete('admin/feature-flags/:id')
  @UseGuards(AdminGuard)
  @ApiBearerAuth()
  remove(@Param('id') id: string, @CurrentUser() user: AuthUser) {
    return this.featureFlagsService.remove(id, user.id);
  }
}
