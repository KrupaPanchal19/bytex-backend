import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
} from '@nestjs/common';
import { IsIn, IsOptional, IsString, Length } from 'class-validator';
import { NotificationsService } from './notifications.service';

class TestNotificationDto {
  @IsOptional()
  @IsIn(['info', 'warning', 'critical'])
  level?: 'info' | 'warning' | 'critical' = 'info';

  @IsString()
  @Length(1, 120)
  title: string;

  @IsString()
  @Length(1, 500)
  message: string;
}

@Controller('notifications')
export class NotificationsController {
  constructor(private readonly service: NotificationsService) {}

  @Get()
  list(@Query('unread') unread?: string) {
    return this.service.list(unread === 'true');
  }

  @Get('channels')
  channels() {
    return { active: this.service.activeChannels() };
  }

  // Manual trigger — lets a reviewer prove the notification medium works on demand.
  @Post('test')
  test(@Body() dto: TestNotificationDto) {
    return this.service.dispatch({
      level: dto.level ?? 'info',
      title: dto.title,
      message: dto.message,
    });
  }

  @Post('read-all')
  markAllRead() {
    return this.service.markAllRead().then(() => ({ ok: true }));
  }

  @Post(':id/read')
  markRead(@Param('id', ParseUUIDPipe) id: string) {
    return this.service.markRead(id).then(() => ({ ok: true }));
  }
}
