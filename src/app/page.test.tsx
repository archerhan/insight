import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import Home from './page';

describe('广场占位首页', () => {
  it('渲染产品主张与 M1 入口', () => {
    render(<Home />);
    expect(screen.getByRole('heading', { name: /让观点接受检验/ })).toBeTruthy();
    expect(screen.getByRole('link', { name: /发起话题/ })).toBeTruthy();
    expect(screen.getByRole('link', { name: /先读《理性讨论须知》/ })).toBeTruthy();
  });
});
