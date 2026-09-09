import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { ProfileTabs } from './profile-tabs';

const panels = [
  { id: 'topics', label: '我的话题', content: <p>话题列表内容</p> },
  { id: 'bets', label: '我的押注', content: <p>押注列表内容</p> },
];

describe('我的战绩 Tab 切换', () => {
  afterEach(cleanup);

  it('默认展示第一个面板，点击可切换到第二个', async () => {
    render(<ProfileTabs panels={panels} />);
    expect(screen.getByText('话题列表内容')).toBeTruthy();
    expect(screen.queryByText('押注列表内容')).toBeNull();

    fireEvent.click(screen.getByRole('tab', { name: '我的押注' }));
    expect(screen.getByText('押注列表内容')).toBeTruthy();
    expect(screen.queryByText('话题列表内容')).toBeNull();
    expect(screen.getByRole('tab', { name: '我的押注' }).getAttribute('aria-selected')).toBe(
      'true',
    );
  });
});
