import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { Seller, SellerSchema } from './seller.schema';
import { Product, ProductSchema } from '../products/product.schema';
import { SellerService } from './seller.service';
import { SellerController } from './seller.controller';
import { PssClientModule } from '../pss-client/pss-client.module';
import { JpsClientModule } from '../jps-client/jps-client.module';
import { FranchisesClientModule } from '../franchises-client/franchises-client.module';
import { AuthModule } from '../auth/auth.module';
import { UsersModule } from '../users/users.module';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: Seller.name, schema: SellerSchema },
      // Need Product model for the unlink "any products?" check.
      { name: Product.name, schema: ProductSchema },
    ]),
    PssClientModule,
    JpsClientModule,
    FranchisesClientModule,
    AuthModule,
    UsersModule,
  ],
  controllers: [SellerController],
  providers: [SellerService],
  exports: [SellerService],
})
export class SellerModule {}
