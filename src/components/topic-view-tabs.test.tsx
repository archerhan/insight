import { render, screen, cleanup } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const usePathnameMock = vi.fn();
const useSearchParamsMock = vi.fn();

vi.mock('next/navigation', () => ({
  usePathname: () => usePathnameMock(),
  useSearchParams: () => useSearchParamsMock(),
}));

import { TopicViewTabs } from './topic-view-tabs';

describe('议题三视图切换条', () => {
  afterEach(cleanup);

  beforeEach(() => {
    usePathnameMock.mockReturnValue('/topics/abc');
    useSearchParamsMock.mockReturnValue(new URLSearchParams('tab=arena'));
  });

  it('渲染三个视图并高亮当前视图', () => {
    render(<TopicViewTabs />);
    const tabs = screen.getAllByRole('tab');
    expect(tabs.map((tab) => tab.textContent)).toEqual(['结论书', '对线', '论证地图']);
    const arena = screen.getByRole('tab', { name: '对线' });
    expect(arena.getAttribute('aria-selected')).toBe('true');
    expect(screen.getByRole('tab', { name: '结论书' }).getAttribute('aria-selected')).toBe('false');
  });

  it('非法 tab 值回退到页面提供的默认视图', () => {
    useSearchParamsMock.mockReturnValue(new URLSearchParams('tab=weird'));
    render(<TopicViewTabs defaultView="conclusion" />);
    expect(screen.getByRole('tab', { name: '结论书' }).getAttribute('aria-selected')).toBe('true');
  });

  it('点击链接生成带 tab 参数的深链', () => {
    useSearchParamsMock.mockReturnValue(new URLSearchParams('focus=claim-1&tab=arena'));
    render(<TopicViewTabs />);
    expect(screen.getByRole('tab', { name: '论证地图' }).getAttribute('href')).toBe(
      '/topics/abc?focus=claim-1&tab=map',
    );
  });
});
