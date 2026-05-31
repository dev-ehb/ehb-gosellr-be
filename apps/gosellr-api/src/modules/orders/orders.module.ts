import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { Order, OrderSchema } from './order.schema';
import { OrdersService } from './orders.service';
import { OrdersController } from './orders.controller';
import { OrdersGateway } from './orders.gateway';
import { AuthModule } from '../auth/auth.module';
import { CartModule } from '../cart/cart.module';
import { JpsClientModule } from '../jps-client/jps-client.module';
import { UsersModule } from '../users/users.module';
import { RiderModule } from '../rider/rider.module';

@Module({
  imports: [
    MongooseModule.forFeature([{ name: Order.name, schema: OrderSchema }]),
    AuthModule,
    CartModule,
    JpsClientModule,
    UsersModule,
    RiderModule,
  ],
  controllers: [OrdersController],
  providers: [OrdersService, OrdersGateway],
  exports: [OrdersService, OrdersGateway],
})
export class OrdersModule {}
