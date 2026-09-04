import { join } from 'path';
import { defineConfig } from '@mikro-orm/postgresql';
import { Migrator } from '@mikro-orm/migrations';
import './load-env';
import { Document } from './documents/document.entity';
import { User } from './users/user.entity';

export default defineConfig({
  entities: [User, Document],
  clientUrl:
    process.env.DATABASE_URL ??
    'postgresql://postgres:postgres@localhost:5432/document_approval',
  // Naive starter: single shared EM is fine; no request-scoped context.
  allowGlobalContext: true,
  migrations: {
    path: join(__dirname, 'migrations'),
  },
  extensions: [Migrator],
});
