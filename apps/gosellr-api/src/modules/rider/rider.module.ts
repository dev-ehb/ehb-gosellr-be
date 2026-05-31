import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { Rider, RiderSchema } from './rider.schema';
import { RiderService } from './rider.service';
import { RiderController } from './rider.controller';
import { PssClientModule } from '../pss-client/pss-client.module';
import { JpsClientModule } from '../jps-client/jps-client.module';
import { AuthModule } from '../auth/auth.module';
import { UsersModule } from '../users/users.module';

@Module({
  imports: [
    MongooseModule.forFeature([{ name: Rider.name, schema: RiderSchema }]),
    PssClientModule,
    JpsClientModule,
    AuthModule,
    UsersModule,
  ],
  controllers: [RiderController],
  providers: [RiderService],
  exports: [RiderService],
})
export class RiderModule {}
