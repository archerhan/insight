import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/app/topics/[id]/actions', () => ({
  respondFollowupAction: vi.fn(async () => ({ error: null })),
}));

import { FollowupPrompt } from './followup-prompt';

describe('楼主回访提示条', () => {
  afterEach(cleanup);

  it('到期后展示后悔程度选项并可提交', () => {
    render(
      <FollowupPrompt
        topicId="topic-1"
        wave={30}
        dueAt="2000-01-01T00:00:00.000Z"
        overdue
      />,
    );
    expect(screen.getByRole('heading', { name: /楼主回访 · T\+30/ })).toBeTruthy();
    expect(screen.getByRole('radio', { name: /没有后悔/ })).toBeTruthy();
    expect(screen.getByRole('radio', { name: /部分后悔/ })).toBeTruthy();
    expect(screen.getByRole('radio', { name: /后悔了/ })).toBeTruthy();
    expect(screen.getByRole('button', { name: '确认并揭晓押注' })).toBeTruthy();
  });

  it('未到期时展示预计时间而非作答表单', () => {
    render(
      <FollowupPrompt
        topicId="topic-1"
        wave={30}
        dueAt="2999-01-01T00:00:00.000Z"
        overdue={false}
      />,
    );
    expect(screen.queryByRole('button', { name: '确认并揭晓押注' })).toBeNull();
    expect(screen.getByText(/预计 .* 生成回访提醒/)).toBeTruthy();
  });
});
