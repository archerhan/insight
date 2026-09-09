import { describe, expect, it, vi } from 'vitest';

const handlersMock = { GET: vi.fn(), POST: vi.fn() };

vi.mock('next-auth', () => ({
  default: vi.fn(() => ({
    handlers: handlersMock,
    auth: vi.fn(),
    signIn: vi.fn(),
    signOut: vi.fn(),
  })),
}));

const authModule = await import('./auth');

describe('Auth.js 装配', () => {
  it('导出 route handler 与服务端会话方法', () => {
    expect(authModule.handlers).toBe(handlersMock);
    expect(typeof authModule.auth).toBe('function');
    expect(typeof authModule.signIn).toBe('function');
    expect(typeof authModule.signOut).toBe('function');
  });
});
