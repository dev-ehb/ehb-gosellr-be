import { Global, Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { Notification, NotificationSchema } from './notification.schema';
import { NotificationsService } from './notifications.service';
import { NotificationsController } from './notifications.controller';
import { AuthModule } from '../auth/auth.module';

/**
 * Marked @Global so any module can inject NotificationsService without
 * adding it to its `imports`. Avoids circular-dep tangles when the orders
 * and delivery-requests modules need to write notifications.
 *
 * NotificationsService itself has no upward deps — it's pure Mongo CRUD.
 * WebSocket fan-out happens at the caller site via OrdersGateway, which
 * already exists and is exported from OrdersModule.
 */
@Global()
@Module({
  imports: [
    MongooseModule.forFeature([
      { name: Notification.name, schema: NotificationSchema },
    ]),
    AuthModule,
  ],
  controllers: [NotificationsController],
  providers: [NotificationsService],
  exports: [NotificationsService],
})
export class NotificationsModule {}
