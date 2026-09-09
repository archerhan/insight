import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';

vi.mock('./actions', () => ({
  publishTopicAction: vi.fn(async () => ({ error: null })),
}));

import { NewTopicWizard } from './topic-wizard';

describe('发起话题三步向导（M2）', () => {
  afterEach(cleanup);

  it('第一步：展示两种类型并按类型切换说明', () => {
    render(<NewTopicWizard initialType="decision" />);
    expect(screen.getByRole('button', { name: /我在做选择/ })).toBeTruthy();
    expect(screen.getByRole('button', { name: /我要验证一个观点/ })).toBeTruthy();
    expect(screen.getByText(/要不要裸辞/)).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: /我要验证一个观点/ }));
    expect(screen.getByText(/请把主张写成一句可被检验的话/)).toBeTruthy();
  });

  it('第二步：标题与根立场为空时阻止进入第三步', () => {
    render(<NewTopicWizard initialType="decision" />);
    fireEvent.click(screen.getByRole('button', { name: /下一步/ }));

    fireEvent.click(screen.getByRole('button', { name: /下一步/ }));
    expect(screen.getByRole('alert').textContent).toContain('标题需要 4–80 字');
    expect(screen.queryByText('发布话题')).toBeNull();
  });

  it('第三步：可勾选倾向与标签，最终表单带发布字段', () => {
    render(<NewTopicWizard initialType="claim" />);
    fireEvent.click(screen.getByRole('button', { name: /下一步/ }));

    fireEvent.change(screen.getByLabelText(/标题/), {
      target: { value: 'AI 编程是否提高效率？' },
    });
    fireEvent.change(screen.getByLabelText(/我的立场主张/), {
      target: { value: '在熟悉代码库的前提下，AI 编程能显著提高开发效率' },
    });
    fireEvent.click(screen.getByRole('button', { name: '倾向支持' }));
    fireEvent.click(screen.getByRole('button', { name: '科技' }));
    fireEvent.click(screen.getByRole('button', { name: /添加第一条论据/ }));
    fireEvent.change(screen.getByLabelText(/你最希望被检验/), {
      target: { value: '团队两个月实测样板任务耗时减半' },
    });
    fireEvent.click(screen.getByRole('button', { name: /下一步/ }));

    expect(screen.getByText('发布话题')).toBeTruthy();
    expect(screen.getByRole('switch', { name: '立帖为证' }).getAttribute('aria-checked')).toBe('true');
    expect(screen.getByText('AI 编程是否提高效率？')).toBeTruthy();
    expect(screen.getByText('倾向支持')).toBeTruthy();
    expect(screen.getByText('团队两个月实测样板任务耗时减半')).toBeTruthy();

    const form = screen.getByLabelText('规则与发布').closest('form');
    expect(form?.querySelector('input[name="type"]')?.getAttribute('value')).toBe('claim');
    expect(form?.querySelector('input[name="lean"]')?.getAttribute('value')).toBe('pro');
    expect(form?.querySelector('input[name="title"]')?.getAttribute('value')).toBe(
      'AI 编程是否提高效率？',
    );
    expect(form?.querySelector('input[name="stakeEnabled"]')?.getAttribute('value')).toBe('true');
    expect(form?.querySelectorAll('input[name="tag"]')).toHaveLength(1);
    expect(screen.getByRole('button', { name: '发布话题' })).toBeTruthy();
  });

  it('标签最多选三个，超出时提示', () => {
    render(<NewTopicWizard initialType="decision" />);
    fireEvent.click(screen.getByRole('button', { name: /下一步/ }));
    ['职业', '生活方式', '创业'].forEach((tag) => {
      fireEvent.click(screen.getByRole('button', { name: tag }));
    });
    expect(screen.getByRole('button', { name: '职业' }).getAttribute('aria-pressed')).toBe('true');

    fireEvent.click(screen.getByRole('button', { name: '财务' }));
    expect(screen.getByRole('button', { name: '财务' }).getAttribute('aria-pressed')).toBe('false');
    expect(screen.getByRole('alert').textContent).toContain('最多选择 3 个标签');
  });
});
