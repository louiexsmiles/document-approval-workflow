import { config } from 'dotenv';
import { resolve } from 'path';

// Load backend/.env so `npm run start:dev` works without exporting DATABASE_URL.
config({ path: resolve(__dirname, '../.env') });
