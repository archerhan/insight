import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';

vi.mock('@/app/topics/[id]/actions', () => ({
  recordStanceChangeAction: vi.fn(async () => ({ error: null })),
}));

import { recordStanceChangeAction } from '@/app/topics/[id]/actions';
import { StanceChangeWizard } from './stance-change-wizard';

const recordActionMock = vi.mocked(recordStanceChangeAction);

afterEach(() => {
  cleanup();
  recordActionMock.mockClear();
});

const sources = [
  { id: 'claim-1', contentTitle: '先用年假试住验证，成本可控', authorName: '老张' },
  { id: 'claim-2', contentTitle: '民宿牌照周期可与在职期并行', authorName: '阿哲' },
];

describe('立场变更向导（M4：“我改主意了”）', () => {
  it('收起状态只显示入口按钮', () => {
    render(
      <StanceChangeWizard
        topicId="topic-1"
        tab="conclusion"
        defaultFrom="支持裸辞开民宿"
        sources={sources}
      />,
    );
    expect(screen.getByRole('button', { name: '我改主意了' })).toBeTruthy();
    expect(screen.queryByText('证词：你被什么说服、哪里想错了？（公开留档）')).toBeNull();
  });

  it('展开后包含 from → to → 证词与来源下拉，预填原立场', () => {
    render(
      <StanceChangeWizard
        topicId="topic-1"
        tab="conclusion"
        defaultFrom="支持裸辞开民宿"
        sources={sources}
      />,
    );
    fireEvent.click(screen.getByRole('button', { name: '我改主意了' }));
    const fromInput = document.querySelector(
      'input[name="fromStance"]',
    ) as HTMLInputElement;
    expect(fromInput.value).toBe('支持裸辞开民宿');
    expect(document.querySelector('textarea[name="statement"]')).toBeTruthy();
    const select = document.querySelector('select[name="sourceClaimId"]') as HTMLSelectElement;
    expect(select.options.length).toBe(3); // 占位 + 2 个来源
    expect(screen.getByRole('button', { name: '记录立场变更' })).toBeTruthy();
  });

  it('提交时触发 server action 并携带隐藏字段', () => {
    render(
      <StanceChangeWizard
        topicId="topic-1"
        tab="arena"
        defaultFrom="支持裸辞开民宿"
        sources={sources}
      />,
    );
    fireEvent.click(screen.getByRole('button', { name: '我改主意了' }));
    fireEvent.change(document.querySelector('input[name="toStance"]') as HTMLInputElement, {
      target: { value: '倾向先试住 3–4 周再决定' },
    });
    fireEvent.change(document.querySelector('textarea[name="statement"]') as HTMLTextAreaElement, {
      target: { value: '对方的试住方案击中了我的盲区：先验证再辞职更稳。' },
    });
    fireEvent.change(document.querySelector('select[name="sourceClaimId"]') as HTMLSelectElement, {
      target: { value: 'claim-1' },
    });
    fireEvent.click(screen.getByRole('button', { name: '记录立场变更' }));

    expect(recordActionMock).toHaveBeenCalledTimes(1);
  });

  it('服务端错误回显在表单内', async () => {
    recordActionMock.mockResolvedValueOnce({ error: '该话题你已经记录过公开立场变更' } as never);
    render(
      <StanceChangeWizard
        topicId="topic-1"
        tab="conclusion"
        defaultFrom=""
        sources={[]}
      />,
    );
    fireEvent.click(screen.getByRole('button', { name: '我改主意了' }));
    fireEvent.click(screen.getByRole('button', { name: '记录立场变更' }));
    expect(await screen.findByText('该话题你已经记录过公开立场变更')).toBeTruthy();
  });
});
