/**
 * 议题页"结论书 / 对线 / 论证地图"三视图切换的纯逻辑。
 * 视图用 ?tab=conclusion|arena|map 表达（见《产品总览》第四节 URL 建议），
 * 话题页在 M3 落地时按议题状态决定 fallback（进行中→对线，已收敛→结论书）。
 */

export const TOPIC_VIEWS = [
  { id: 'conclusion', label: '结论书' },
  { id: 'arena', label: '对线' },
  { id: 'map', label: '论证地图' },
] as const;

export type TopicView = (typeof TOPIC_VIEWS)[number]['id'];

export function isTopicView(value: unknown): value is TopicView {
  return TOPIC_VIEWS.some((view) => view.id === value);
}

/** 从 searchParams 解析 tab，非法/缺失时回退到 fallback（由页面按议题状态提供）。 */
export function resolveTopicView(
  searchParams: Record<string, string | string[] | undefined>,
  fallback: TopicView = 'arena',
): TopicView {
  const raw = searchParams.tab;
  const value = Array.isArray(raw) ? raw[0] : raw;
  return isTopicView(value) ? value : fallback;
}

export function topicViewLabel(view: TopicView): string {
  return TOPIC_VIEWS.find((item) => item.id === view)?.label ?? view;
}

/** 生成切换链接：保留其余 query，只替换 tab。 */
export function topicViewHref(
  view: TopicView,
  pathname: string,
  search: URLSearchParams,
): string {
  const next = new URLSearchParams(search);
  next.set('tab', view);
  const query = next.toString();
  return query ? `${pathname}?${query}` : pathname;
}
