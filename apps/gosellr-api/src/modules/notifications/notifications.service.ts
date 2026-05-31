import {
  Injectable,
  Logger,
  NotFoundException,
  ForbiddenException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import {
  Notification,
  NotificationDocument,
  NotificationType,
} from './notification.schema';

export interface CreateNotificationInput {
  user_id: string;
  type: NotificationType;
  title: string;
  message?: string;
  link?: string | null;
  metadata?: Record<string, unknown>;
}

/**
 * Pure CRUD for the notification inbox. Does NOT emit the WebSocket push
 * itself — callers (OrdersService, DeliveryRequestsService, ...) are
 * responsible for fan-out via OrdersGateway after a successful create.
 *
 * Keeping this service free of gateway deps avoids a circular-import knot
 * between OrdersModule and NotificationsModule.
 */
@Injectable()
export class NotificationsService {
  private readonly logger = new Logger(NotificationsService.name);

  constructor(
    @InjectModel(Notification.name)
    private readonly notificationModel: Model<NotificationDocument>,
  ) {}

  // ── Writes ─────────────────────────────────────────────────────────────────

  async create(input: CreateNotificationInput): Promise<NotificationDocument> {
    try {
      return await this.notificationModel.create({
        user_id: new Types.ObjectId(input.user_id),
        type: input.type,
        title: input.title,
        message: input.message ?? '',
        link: input.link ?? null,
        metadata: input.metadata ?? {},
        read: false,
        read_at: null,
      });
    } catch (err) {
      this.logger.error(`create(${input.user_id}, ${input.type}) failed: ${String(err)}`);
      throw err;
    }
  }

  /** Convenience: silently swallow errors so the calling business-flow doesn't break. */
  async createSafe(input: CreateNotificationInput): Promise<NotificationDocument | null> {
    try {
      return await this.create(input);
    } catch {
      return null;
    }
  }

  async markRead(id: string, userId: string): Promise<NotificationDocument> {
    const doc = await this.notificationModel.findById(id).exec();
    if (!doc) throw new NotFoundException('Notification not found');
    if (doc.user_id.toString() !== userId) {
      throw new ForbiddenException('Not your notification');
    }
    if (!doc.read) {
      doc.read = true;
      doc.read_at = new Date();
      await doc.save();
    }
    return doc;
  }

  async markAllRead(userId: string): Promise<{ updated: number }> {
    const res = await this.notificationModel.updateMany(
      { user_id: new Types.ObjectId(userId), read: false },
      { $set: { read: true, read_at: new Date() } },
    ).exec();
    return { updated: res.modifiedCount ?? 0 };
  }

  // ── Reads ──────────────────────────────────────────────────────────────────

  async list(userId: string, opts: { limit?: number; onlyUnread?: boolean } = {}) {
    const limit = Math.min(opts.limit ?? 50, 200);
    const filter: Record<string, unknown> = {
      user_id: new Types.ObjectId(userId),
    };
    if (opts.onlyUnread) filter['read'] = false;
    return this.notificationModel
      .find(filter)
      .sort({ created_at: -1 })
      .limit(limit)
      .exec();
  }

  async unreadCount(userId: string): Promise<number> {
    return this.notificationModel
      .countDocuments({ user_id: new Types.ObjectId(userId), read: false })
      .exec();
  }

  // ── Serialization ──────────────────────────────────────────────────────────

  toPublic(doc: NotificationDocument) {
    return {
      id: (doc._id as unknown as { toString(): string }).toString(),
      user_id: doc.user_id.toString(),
      type: doc.type,
      title: doc.title,
      message: doc.message,
      link: doc.link,
      metadata: doc.metadata ?? {},
      read: doc.read,
      read_at: doc.read_at?.toISOString() ?? null,
      created_at: (doc as unknown as { created_at?: Date }).created_at?.toISOString()
        ?? new Date().toISOString(),
    };
  }
}

export type NotificationPublic = ReturnType<NotificationsService['toPublic']>;
