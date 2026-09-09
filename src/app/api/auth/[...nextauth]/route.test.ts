import { describe, expect, it, vi } from 'vitest';

const getMock = vi.fn();
const postMock = vi.fn();

vi.mock('@/auth', () => ({
  handlers: { GET: getMock, POST: postMock },
}));

const route = await import('./route');

describe('NextAuth Route Handler', () => {
  it('原样导出 GET / POST 处理器', () => {
    expect(route.GET).toBe(getMock);
    expect(route.POST).toBe(postMock);
  });
});
