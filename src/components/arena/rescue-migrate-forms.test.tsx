import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';

vi.mock('@/app/topics/[id]/actions', () => ({
  rescueMigrateAction: vi.fn(async () => ({ error: null })),
}));

import { rescueMigrateAction } from '@/app/topics/[id]/actions';
import { RescueMigrateForms } from './rescue-migrate-forms';

const rescueActionMock = vi.mocked(rescueMigrateAction);

function claim(id: string, contentTitle: string) {
  return {
    id,
    parentId: 'claim-old',
    ancestors: ['claim-old'],
    relation: 'pro' as const,
    status: 'orphaned' as const,
    contentTitle,
    contentBody: null,
    authorId: 'u-owner',
    authorName: '小明',
    evidenceCount: 0,
    createdAt: new Date(),
    supersedesClaimId: null,
  };
}

afterEach(() => {
  cleanup();
  rescueActionMock.mockClear();
});

describe('抢救迁移 RescueMigrateForms', () => {
  it('列出旧版悬空子论点并提供迁移表单', () => {
    render(
      <RescueMigrateForms
        topicId="topic-1"
        newParentId="claim-new"
        claims={[
          claim('claim-orphan-1', '先入股旧院试运营半年可验证可行性'),
          claim('claim-orphan-2', '回城退路仍在'),
        ]}
      />,
    );
    expect(screen.getByText(/可抢救的悬空子论点（2）/)).toBeTruthy();
    expect(screen.getByText('先入股旧院试运营半年可验证可行性')).toBeTruthy();
    const buttons = screen.getAllByRole('button', { name: '迁移到本修订版' });
    expect(buttons).toHaveLength(2);
    fireEvent.click(buttons[0]);
    expect(rescueActionMock).toHaveBeenCalled();
  });

  it('空列表时不渲染入口', () => {
    render(<RescueMigrateForms topicId="topic-1" newParentId="claim-new" claims={[]} />);
    expect(screen.queryAllByRole('button', { name: '迁移到本修订版' })).toHaveLength(0);
  });
});
