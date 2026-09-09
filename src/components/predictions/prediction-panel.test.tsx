import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/app/topics/[id]/actions', () => ({
  placePredictionAction: vi.fn(async () => ({ error: null })),
}));

import { PredictionPanel } from './prediction-panel';

const baseProps = {
  topicId: 'topic-1',
  revealAt: '2026-12-01T00:00:00Z',
  openCount: 2,
  totalCount: 3,
  openCap: 20,
  regretOpenCount: 1,
  noRegretOpenCount: 1,
  settled: false,
  realityResultLabel: null,
  userPrediction: null,
  gateError: null,
  canRegister: false,
  loginHref: null,
};

describe('话题页立帖为证登记卡', () => {
  afterEach(cleanup);

  it('可登记时展示一句话押注表单与方向选择', () => {
    render(<PredictionPanel {...baseProps} canRegister loginHref={null} />);
    expect(screen.getByRole('heading', { name: '立帖为证' })).toBeTruthy();
    expect(screen.getByRole('textbox', { name: /你的押注原话/ })).toBeTruthy();
    expect(screen.getByRole('radio', { name: '押楼主会后悔' })).toBeTruthy();
    expect(screen.getByRole('radio', { name: '押楼主不会后悔' })).toBeTruthy();
    expect(screen.getByRole('button', { name: '立帖为证' })).toBeTruthy();
  });

  it('已登记时只读展示记录与状态，不再给表单', () => {
    render(
      <PredictionPanel
        {...baseProps}
        userPrediction={{
          statement: '我押你三个月内会后悔',
          outcomeLabel: '押楼主会后悔',
          chipLabel: '待揭晓',
          chipTone: 'amber',
          createdAtLabel: '2026/9/1',
        }}
      />,
    );
    expect(screen.getByText('我押你三个月内会后悔')).toBeTruthy();
    expect(screen.getByText('待揭晓')).toBeTruthy();
    expect(screen.queryByRole('button', { name: '立帖为证' })).toBeNull();
  });

  it('未登录给登录引导链接', () => {
    render(<PredictionPanel {...baseProps} loginHref="/login?callbackUrl=%2Ftopics%2Ftopic-1" />);
    expect(screen.getByRole('link', { name: '登录后立帖为证' }).getAttribute('href')).toBe(
      '/login?callbackUrl=%2Ftopics%2Ftopic-1',
    );
  });

  it('已揭晓时展示现实结果', () => {
    render(
      <PredictionPanel
        {...baseProps}
        settled
        realityResultLabel="楼主没有后悔"
        gateError={null}
      />,
    );
    expect(screen.getByText('已揭晓：楼主没有后悔')).toBeTruthy();
  });

  it('达到数量上限时展示原因', () => {
    render(
      <PredictionPanel
        {...baseProps}
        gateError="该话题押注已满 20 条（数量封顶）"
        loginHref={null}
      />,
    );
    expect(screen.getByText(/数量封顶/)).toBeTruthy();
    expect(screen.queryByRole('link', { name: '登录后立帖为证' })).toBeNull();
  });
});
