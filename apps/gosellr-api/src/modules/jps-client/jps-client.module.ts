import { Module } from '@nestjs/common';
import { HttpModule } from '@nestjs/axios';
import { ConfigModule } from '@nestjs/config';
import { JpsClientService } from './jps-client.service';

@Module({
  imports: [
    HttpModule.register({
      timeout: 10_000,
      maxRedirects: 3,
    }),
    ConfigModule,
  ],
  providers: [JpsClientService],
  exports: [JpsClientService],
})
export class JpsClientModule {}
