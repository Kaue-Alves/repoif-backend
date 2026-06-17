import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { R2Service } from './r2.service';
import { R2Controller } from './r2.controller';

@Module({
  imports: [ConfigModule],
  providers: [R2Service],
  controllers: [R2Controller],
  exports: [R2Service],
})
export class R2Module {}
