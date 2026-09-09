import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';

vi.mock('@/app/topics/[id]/actions', () => ({
  publishConclusionAction: vi.fn(async () => ({ error: null })),
}));

import { publishConclusionAction } from '@/app/topics/[id]/actions';
import { ConclusionWizard } from './conclusion-wizard';

const publishActionMock = vi.mocked(publishConclusionAction);

const roots = [
  {
    id: 'root-1',
    contentTitle: '先用年假试住验证，成本可控',
    authorId: 'u-other',
    authorName: '老张',
    status: 'active',
    openChallengeCount: 1,
    createdAt: new Date('2026-08-12T00:00:00Z'),
  },
  {
    id: 'root-2',
    contentTitle: '民宿是生意不是生活',
    authorId: 'u-2',
    authorName: '阿May',
    status: 'responded',
    openChallengeCount: 0,
    createdAt: new Date('2026-08-13T00:00:00Z'),
  },
];

const openChallenges = [
  {
    id: 'challenge-1',
    targetClaimId: 'root-1',
    challengerClaimId: 'claim-con',
    challengerTitle: '淡季现金流撑不住 6 个月',
    challengerBody: null,
    challengerAuthorId: 'u-3',
    challengerAuthorName: '阿哲',
    openedAt: new Date('2026-09-01T00:00:00Z'),
    defaultLossAt: new Date('2026-09-15T00:00:00Z'),
    phase: 'orange' as const,
    openedDays: 5,
    targetTitle: '先用年假试住验证，成本可控',
    targetAuthorName: '老张',
  },
];

function renderWizard() {
  return render(
    <ConclusionWizard
      topicId="topic-1"
      roots={roots}
      openChallenges={openChallenges}
    />,
  );
}

afterEach(() => {
  cleanup();
  publishActionMock.mockClear();
});

describe('出结论书向导（M4：采纳 + 带险关闭勾选）', () => {
  it('默认预选全部理由层条目并展示未决风险勾选区', () => {
    renderWizard();
    expect(screen.getByText('采纳进结论书的理由（2/2）')).toBeTruthy();
    expect(screen.getByText(/带险关闭：以下 1 条反驳仍未回应/)).toBeTruthy();

    const rootBoxes = document.querySelectorAll('input[name="adoptedClaimId"]');
    expect(rootBoxes.length).toBe(2);
    expect((rootBoxes[0] as HTMLInputElement).checked).toBe(true);
  });

  it('漏勾任何一条未决反驳时发布按钮保持禁用', () => {
    renderWizard();
    const publishButton = screen.getByRole('button', { name: '发布结论书' }) as HTMLButtonElement;
    expect(publishButton.disabled).toBe(true);
    expect(screen.getByText(/还剩 1 条风险未确认/)).toBeTruthy();
  });

  it('逐条勾选未决反驳后发布可用，提交时携带采纳与风险 ids', () => {
    renderWizard();
    const riskBox = document.querySelector(
      'input[name="acknowledgedChallengeId"]',
    ) as HTMLInputElement;
    fireEvent.click(riskBox);
    fireEvent.change(document.querySelector('textarea[name="verdictText"]') as HTMLTextAreaElement, {
      target: { value: '不建议直接裸辞：先用年假完成实地验证，再决定是否投入。' },
    });
    const publishButton = screen.getByRole('button', { name: '发布结论书' }) as HTMLButtonElement;
    expect(publishButton.disabled).toBe(false);

    fireEvent.click(publishButton);
    expect(publishActionMock).toHaveBeenCalledTimes(1);
  });

  it('全部取消采纳时给出提示并禁用发布', () => {
    renderWizard();
    const boxes = Array.from(
      document.querySelectorAll('input[name="adoptedClaimId"]'),
    ) as HTMLInputElement[];
    for (const box of boxes) fireEvent.click(box);
    const publishButton = screen.getByRole('button', { name: '发布结论书' }) as HTMLButtonElement;
    expect(publishButton.disabled).toBe(true);
    expect(screen.getByText('请至少勾选一条采纳理由')).toBeTruthy();
    expect(screen.getByText('采纳进结论书的理由（0/2）')).toBeTruthy();
  });

  it('失败时展示服务端错误', async () => {
    publishActionMock.mockResolvedValueOnce({ error: '还有 1 条未决反驳未确认' } as never);
    renderWizard();
    const riskBox = document.querySelector(
      'input[name="acknowledgedChallengeId"]',
    ) as HTMLInputElement;
    fireEvent.click(riskBox);
    fireEvent.change(document.querySelector('textarea[name="verdictText"]') as HTMLTextAreaElement, {
      target: { value: '不建议直接裸辞：先用年假完成实地验证，再决定是否投入。' },
    });
    fireEvent.click(screen.getByRole('button', { name: '发布结论书' }));
    expect(await screen.findByText('还有 1 条未决反驳未确认')).toBeTruthy();
  });
});
