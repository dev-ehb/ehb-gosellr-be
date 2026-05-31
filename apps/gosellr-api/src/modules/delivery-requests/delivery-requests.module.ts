import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { DeliveryRequest, DeliveryRequestSchema } from './delivery-request.schema';
import { DeliveryRequestsService } from './delivery-requests.service';
import {
  OrderDeliveryRequestsController,
  RiderDeliveryRequestsController,
} from './delivery-requests.controller';
import { AuthModule } from '../auth/auth.module';
import { OrdersModule } from '../orders/orders.module';
import { JpsClientModule } from '../jps-client/jps-client.module';
import { RiderModule } from '../rider/rider.module';
import { UsersModule } from '../users/users.module';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: DeliveryRequest.name, schema: DeliveryRequestSchema },
    ]),
    AuthModule,
    OrdersModule,
    JpsClientModule,
    RiderModule,
    UsersModule,
  ],
  controllers: [OrderDeliveryRequestsController, RiderDeliveryRequestsController],
  providers: [DeliveryRequestsService],
  exports: [DeliveryRequestsService],
})
export class DeliveryRequestsModule {}
