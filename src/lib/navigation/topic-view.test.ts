import { describe, expect, it } from 'vitest';
import {
  isTopicView,
  resolveTopicView,
  topicViewHref,
  topicViewLabel,
  TOPIC_VIEWS,
} from './topic-view';

describe('议题三视图切换', () => {
  it('三个视图枚举齐全且标签正确', () => {
    expect(TOPIC_VIEWS.map((view) => view.id)).toEqual(['conclusion', 'arena', 'map']);
    expect(topicViewLabel('conclusion')).toBe('结论书');
    expect(topicViewLabel('arena')).toBe('对线');
    expect(topicViewLabel('map')).toBe('论证地图');
  });

  it('只接受已知视图，非法值回退到 fallback', () => {
    expect(isTopicView('arena')).toBe(true);
    expect(isTopicView('random')).toBe(false);
    expect(resolveTopicView({ tab: 'map' })).toBe('map');
    expect(resolveTopicView({})).toBe('arena');
    expect(resolveTopicView({ tab: 'oops' }, 'conclusion')).toBe('conclusion');
    expect(resolveTopicView({ tab: ['conclusion', 'map'] })).toBe('conclusion');
  });

  it('切换链接保留其他 query 并替换 tab', () => {
    const search = new URLSearchParams('a=1&tab=arena');
    expect(topicViewHref('conclusion', '/topics/abc', search)).toBe('/topics/abc?a=1&tab=conclusion');
    expect(topicViewHref('map', '/topics/abc', new URLSearchParams(''))).toBe('/topics/abc?tab=map');
  });
});
