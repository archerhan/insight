import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';

vi.mock('@/app/topics/[id]/actions', () => ({
  reviseClaimAction: vi.fn(async () => ({ error: null })),
}));

import { reviseClaimAction } from '@/app/topics/[id]/actions';
import { ReviseClaimForm } from './revise-claim-form';

const reviseActionMock = vi.mocked(reviseClaimAction);

afterEach(() => {
  cleanup();
  reviseActionMock.mockClear();
});

describe('修订观点表单 ReviseClaimForm', () => {
  it('展开后可修改主张并提交修订', () => {
    render(
      <ReviseClaimForm
        topicId="topic-1"
        claimId="claim-old"
        claimTitle="裸辞去大理开民宿，是实现自由生活的现实路径"
      />,
    );
    expect(screen.getByRole('button', { name: '修订观点' })).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: '修订观点' }));
    expect(screen.getByText(/旧版归档/)).toBeTruthy();

    const input = screen.getByDisplayValue('裸辞去大理开民宿，是实现自由生活的现实路径');
    fireEvent.change(input, {
      target: { value: '先驻留大理三个月完成调研再决定是否裸辞' },
    });
    fireEvent.click(screen.getByRole('button', { name: '发布修订' }));
    expect(reviseActionMock).toHaveBeenCalled();
  });

  it('可以取消关闭表单', () => {
    render(
      <ReviseClaimForm topicId="topic-1" claimId="claim-old" claimTitle="原主张" />,
    );
    fireEvent.click(screen.getByRole('button', { name: '修订观点' }));
    fireEvent.click(screen.getByRole('button', { name: '取消' }));
    expect(screen.queryByText(/旧版归档/)).toBeNull();
  });
});
