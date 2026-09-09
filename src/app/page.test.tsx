import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import Home from './page';

describe('占位首页', () => {
  it('渲染灼见标题并展示下一里程碑按钮', () => {
    render(<Home />);
    expect(screen.getByRole('heading', { name: '灼见' })).toBeTruthy();
    expect(screen.getByRole('button', { name: '认证与全局壳 · 下一里程碑' })).toBeTruthy();
  });
});
