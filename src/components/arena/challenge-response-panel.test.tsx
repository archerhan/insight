import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';

vi.mock('@/app/topics/[id]/actions', () => ({
  respondChallengeAction: vi.fn(async () => ({ error: null })),
  concedeChallengeAction: vi.fn(async () => ({ error: null })),
}));

import {
  concedeChallengeAction,
  respondChallengeAction,
} from '@/app/topics/[id]/actions';
import { ChallengeResponsePanel } from './challenge-response-panel';

const respondActionMock = vi.mocked(respondChallengeAction);
const concedeActionMock = vi.mocked(concedeChallengeAction);

const baseProps = {
  topicId: 'topic-1',
  challengeId: 'challenge-1',
  targetClaimId: 'claim-root',
  canPost: true,
};

afterEach(() => {
  cleanup();
  respondActionMock.mockClear();
  concedeActionMock.mockClear();
});

describe('未决红条作者操作 ChallengeResponsePanel', () => {
  it('默认展示回应表单与承认击穿入口', () => {
    render(<ChallengeResponsePanel {...baseProps} />);
    expect(screen.getByRole('button', { name: '回应这条反驳' })).toBeTruthy();
    expect(screen.getByRole('button', { name: '承认击穿' })).toBeTruthy();
    expect(screen.getByPlaceholderText(/例如：拿证可与在职期并行/)).toBeTruthy();
  });

  it('填写回应并提交会触发回应动作（带隐藏字段）', () => {
    render(<ChallengeResponsePanel {...baseProps} />);
    fireEvent.change(screen.getByPlaceholderText(/例如：拿证可与在职期并行/), {
      target: { value: '拿证可与在职期并行推进，不必然裸辞' },
    });
    fireEvent.click(screen.getByRole('button', { name: '提交回应' }));
    expect(respondActionMock).toHaveBeenCalled();
  });

  it('承认击穿需要二次确认：确认后触发 concede 动作，取消可返回', () => {
    render(<ChallengeResponsePanel {...baseProps} />);
    fireEvent.click(screen.getByRole('button', { name: '承认击穿' }));
    expect(screen.getByText(/确认承认这条反驳击穿了你的论点/)).toBeTruthy();
    expect(screen.getByText(/支撑型子论点变为悬空/)).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: '确认承认击穿' }));
    expect(concedeActionMock).toHaveBeenCalled();
  });

  it('未完成须知时提示先完成课程', () => {
    render(<ChallengeResponsePanel {...baseProps} canPost={false} />);
    expect(screen.getByText('完成《理性讨论须知》后即可回应。')).toBeTruthy();
    expect(screen.queryByRole('button', { name: '提交回应' })).toBeNull();
  });
});
