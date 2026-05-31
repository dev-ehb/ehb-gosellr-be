import { Module } from '@nestjs/common';
import { HttpModule } from '@nestjs/axios';
import { ConfigModule } from '@nestjs/config';
import { FranchisesClientService } from './franchises-client.service';

@Module({
  imports: [HttpModule.register({ timeout: 10_000, maxRedirects: 3 }), ConfigModule],
  providers: [FranchisesClientService],
  exports: [FranchisesClientService],
})
export class FranchisesClientModule {}
