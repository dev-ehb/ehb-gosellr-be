import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { MongooseModule } from '@nestjs/mongoose';
import { AuthModule } from './modules/auth/auth.module';
import { UsersModule } from './modules/users/users.module';
import { ProductsModule } from './modules/products/products.module';
import { PssClientModule } from './modules/pss-client/pss-client.module';
import { JpsClientModule } from './modules/jps-client/jps-client.module';
import { WebhooksModule } from './modules/webhooks/webhooks.module';
import { EmailModule } from './modules/email/email.module';
import { SellerModule } from './modules/seller/seller.module';
import { RiderModule } from './modules/rider/rider.module';
import { CartModule } from './modules/cart/cart.module';
import { OrdersModule } from './modules/orders/orders.module';
import { DeliveryRequestsModule } from './modules/delivery-requests/delivery-requests.module';
import { NotificationsModule } from './modules/notifications/notifications.module';
import { HomeModule } from './modules/home/home.module';
import { WishlistModule } from './modules/wishlist/wishlist.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true, envFilePath: '.env' }),
    MongooseModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        uri: config.getOrThrow<string>('MONGODB_URI'),
      }),
    }),
    AuthModule,
    UsersModule,
    ProductsModule,
    PssClientModule,
    JpsClientModule,
    WebhooksModule,
    EmailModule,
    SellerModule,
    RiderModule,
    CartModule,
    OrdersModule,
    DeliveryRequestsModule,
    NotificationsModule,
    HomeModule,
    WishlistModule,
  ],
})
export class AppModule {}
