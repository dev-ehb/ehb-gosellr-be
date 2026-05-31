import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { ProductsController } from './products.controller';
import { ProductsService } from './products.service';
import { Product, ProductSchema } from './product.schema';
import { Seller, SellerSchema } from '../seller/seller.schema';
import { PssClientModule } from '../pss-client/pss-client.module';
import { JpsClientModule } from '../jps-client/jps-client.module';
import { AuthModule } from '../auth/auth.module';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: Product.name, schema: ProductSchema },
      // Inject Seller directly (not via SellerModule) to avoid a circular dep
      // between products and seller modules.
      { name: Seller.name, schema: SellerSchema },
    ]),
    PssClientModule,
    JpsClientModule,
    AuthModule,
  ],
  controllers: [ProductsController],
  providers: [ProductsService],
  exports: [ProductsService],
})
export class ProductsModule {}
