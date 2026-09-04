import { Module } from '@nestjs/common';
import { MikroOrmModule } from '@mikro-orm/nestjs';
import config from './mikro-orm.config';
import { DocumentsModule } from './documents/documents.module';
import { SeedModule } from './seed/seed.module';
import { UsersModule } from './users/users.module';

@Module({
  imports: [
    MikroOrmModule.forRoot(config),
    UsersModule,
    DocumentsModule,
    SeedModule,
  ],
})
export class AppModule {}
