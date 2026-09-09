import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';

vi.mock('@/app/topics/[id]/actions', () => ({
  postSupportAction: vi.fn(async () => ({ error: null })),
  postRebutalAction: vi.fn(async () => ({ error: null })),
}));

import { postRebutalAction, postSupportAction } from '@/app/topics/[id]/actions';
import { ArenaComposer } from './arena-composer';

const postSupportActionMock = vi.mocked(postSupportAction);
const postRebutalActionMock = vi.mocked(postRebutalAction);

const baseProps = {
  topicId: 'topic-1',
  focusId: 'claim-root',
  focusTitle: '裸辞去大理开民宿，是实现自由生活的现实路径',
  focusBody: null,
  loginHref: '/login?callbackUrl=%2Ftopics%2Ftopic-1',
  guideHref: '/guide',
};

afterEach(() => {
  cleanup();
  postSupportActionMock.mockClear();
  postRebutalActionMock.mockClear();
});

describe('对线输入条 ArenaComposer', () => {
  it('未登录时展示登录与须知入口，不渲染表单', () => {
    render(<ArenaComposer {...baseProps} canPost={false} focusOwnedByViewer={false} />);
    expect(screen.getByText('想参与对线？')).toBeTruthy();
    expect(screen.getByRole('link', { name: '登录 / 注册' }).getAttribute('href')).toBe(
      '/login?callbackUrl=%2Ftopics%2Ftopic-1',
    );
    expect(screen.queryByText('提交支持')).toBeNull();
  });

  it('默认支持模式：一句话支持 + 可选正文，可提交', () => {
    render(<ArenaComposer {...baseProps} canPost focusOwnedByViewer={false} />);
    expect(screen.getByText('支持这一点').getAttribute('aria-pressed')).toBe('true');
    expect(screen.getByPlaceholderText(/先租后买/)).toBeTruthy();
    fireEvent.change(screen.getByPlaceholderText(/先租后买/), {
      target: { value: '先入股旧院试运营半年，试错成本可控' },
    });
    fireEvent.click(screen.getByRole('button', { name: '提交支持' }));
    expect(postSupportActionMock).toHaveBeenCalled();
  });

  it('反驳模式先复述：不合格复述提示改写，合格后解锁反驳输入框', () => {
    render(<ArenaComposer {...baseProps} canPost focusOwnedByViewer={false} />);
    fireEvent.click(screen.getByRole('button', { name: '反驳这一点' }));
    expect(screen.getByText(/第一步 · 复述对方核心观点/)).toBeTruthy();

    fireEvent.change(screen.getByPlaceholderText(/先写下对方观点的复述/), {
      target: { value: '完全无关的一段内容' },
    });
    fireEvent.click(screen.getByRole('button', { name: '检查复述' }));
    expect(screen.getByText(/没有覆盖对方观点的核心内容/)).toBeTruthy();
    expect(screen.queryByPlaceholderText(/直接针对对方主张/)).toBeNull();

    fireEvent.change(screen.getByPlaceholderText(/先写下对方观点的复述/), {
      target: {
        value: '你主张裸辞去大理开民宿是实现自由生活的现实路径',
      },
    });
    fireEvent.click(screen.getByRole('button', { name: '检查复述' }));
    expect(screen.getByText('复述检验通过，请写下反驳')).toBeTruthy();
    expect(screen.getByPlaceholderText(/直接针对对方主张/)).toBeTruthy();

    fireEvent.change(screen.getByPlaceholderText(/直接针对对方主张/), {
      target: { value: '民宿牌照拿证周期长，现金流撑不住' },
    });
    fireEvent.click(screen.getByRole('button', { name: '提交反驳（挂红计时）' }));
    expect(postRebutalActionMock).toHaveBeenCalled();
  });

  it('反驳自己的论点时给出提示并禁用反驳分段', () => {
    render(<ArenaComposer {...baseProps} canPost focusOwnedByViewer />);
    const rebuttalButton = screen.getByRole('button', { name: '反驳这一点' });
    fireEvent.click(rebuttalButton);
    expect(screen.getByText(/不能反驳自己/)).toBeTruthy();
    expect(screen.queryByText(/第一步 · 复述/)).toBeNull();
  });
});
