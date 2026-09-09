import { describe, expect, it, vi } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';

vi.mock('next/font/google', () => ({
  Geist: () => ({ className: '', variable: '--font-sans' }),
  Geist_Mono: () => ({ className: '', variable: '--font-mono' }),
}));

import RootLayout, { metadata } from './layout';

describe('全局布局', () => {
  it('使用中文语言与灼见元信息', () => {
    const markup = renderToStaticMarkup(
      <RootLayout params={Promise.resolve({})}>
        <main>内容</main>
      </RootLayout>,
    );
    expect(markup).toContain('lang="zh-CN"');
    expect(metadata.title).toBe('灼见');
  });
});
