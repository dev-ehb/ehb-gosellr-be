import { Module } from '@nestjs/common';
import { HttpModule } from '@nestjs/axios';
import { ConfigModule } from '@nestjs/config';
import { PssClientService } from './pss-client.service';

@Module({
  imports: [
    HttpModule.register({
      timeout: 10_000,
      maxRedirects: 3,
    }),
    ConfigModule,
  ],
  providers: [PssClientService],
  exports: [PssClientService],
})
export class PssClientModule {}
