import {
  Controller,
  Get,
  Patch,
  Post,
  Param,
  Request,
  Query,
  UseGuards,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiBearerAuth,
  ApiQuery,
} from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { NotificationsService } from './notifications.service';
import { UserDocument } from '../users/user.schema';

interface AuthRequest extends Request {
  user: UserDocument;
}

@ApiTags('Notifications')
@Controller('notifications')
@UseGuards(JwtAuthGuard)
@ApiBearerAuth()
export class NotificationsController {
  constructor(private readonly notifications: NotificationsService) {}

  @Get()
  @ApiOperation({ summary: 'List my notifications (newest first)' })
  @ApiQuery({ name: 'limit', required: false, example: 50 })
  @ApiQuery({ name: 'unread', required: false, example: 'true' })
  async list(
    @Request() req: AuthRequest,
    @Query('limit') limit?: string,
    @Query('unread') unread?: string,
  ) {
    const userId = (req.user._id as unknown as { toString(): string }).toString();
    const docs = await this.notifications.list(userId, {
      limit: limit ? Number(limit) : undefined,
      onlyUnread: unread === 'true' || unread === '1',
    });
    return docs.map((d) => this.notifications.toPublic(d));
  }

  @Get('unread-count')
  @ApiOperation({ summary: 'Get my unread notification count' })
  async unreadCount(@Request() req: AuthRequest) {
    const userId = (req.user._id as unknown as { toString(): string }).toString();
    const count = await this.notifications.unreadCount(userId);
    return { count };
  }

  @Patch(':id/read')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Mark a single notification as read' })
  async markRead(@Request() req: AuthRequest, @Param('id') id: string) {
    const userId = (req.user._id as unknown as { toString(): string }).toString();
    const doc = await this.notifications.markRead(id, userId);
    return this.notifications.toPublic(doc);
  }

  @Post('read-all')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Mark every unread notification as read' })
  async markAllRead(@Request() req: AuthRequest) {
    const userId = (req.user._id as unknown as { toString(): string }).toString();
    return this.notifications.markAllRead(userId);
  }
}
