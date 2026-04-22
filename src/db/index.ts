import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import * as schema from './schema';

const connectionString =
  process.env.DATABASE_URL ||
  "postgresql://postgres:password@localhost:5432/menu_catering";

// Disable prefetch as it is not supported for "Transaction" pool mode (useful in Supabase)
export const client = postgres(connectionString, { prepare: false });
export const db = drizzle(client, { schema });
