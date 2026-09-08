import { drizzle } from 'drizzle-orm/postgres-js';
import type { PostgresJsDatabase } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import * as schema from './schema';

export type Db = PostgresJsDatabase<typeof schema>;

let database: Db | undefined;

/** 懒加载：模块导入不读环境变量，首次真正访问数据库时才创建连接。 */
export function getDb(): Db {
  if (database) return database;
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    throw new Error('DATABASE_URL is not set');
  }
  /** Neon 无内置 RLS：所有访问收敛到本服务端 client，权限在 repository/service 层校验。 */
  const sql = postgres(connectionString, { max: 1, prepare: false });
  database = drizzle(sql, { schema });
  return database;
}

/**
 * 惰性代理：保留 `import { db }` 的既有调用方式，
 * 首次属性访问时才触发 getDb()（函数调用绑定真实 db，保证 this 正确）。
 */
export const db: Db = new Proxy({} as Db, {
  get(_target, prop) {
    const underlying = getDb() as unknown as Record<PropertyKey, unknown>;
    const value = underlying[prop];
    return typeof value === 'function' ? (value as (...args: unknown[]) => unknown).bind(underlying) : value;
  },
});
