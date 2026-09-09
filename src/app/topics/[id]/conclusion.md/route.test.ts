import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/db/services/conclusion', () => ({
  buildConclusionMarkdownForTopic: vi.fn(),
}));

import { buildConclusionMarkdownForTopic } from '@/db/services/conclusion';
import { GET } from './route';

const markdownMock = vi.mocked(buildConclusionMarkdownForTopic);

beforeEach(() => {
  markdownMock.mockReset();
});

describe('结论书 Markdown 导出路由', () => {
  it('有已发布结论书时返回可下载的 markdown', async () => {
    markdownMock.mockResolvedValueOnce('# 话题\n\n结论正文');
    const response = await GET(new Request('http://localhost/topics/t-1/conclusion.md'), {
      params: Promise.resolve({ id: 't-1' }),
    });
    expect(response.status).toBe(200);
    expect(response.headers.get('Content-Type')).toContain('text/markdown');
    expect(response.headers.get('Content-Disposition')).toContain('attachment');
    expect(await response.text()).toBe('# 话题\n\n结论正文');
  });

  it('没有结论书时返回 404', async () => {
    markdownMock.mockResolvedValueOnce(null);
    const response = await GET(new Request('http://localhost/topics/t-1/conclusion.md'), {
      params: Promise.resolve({ id: 't-1' }),
    });
    expect(response.status).toBe(404);
  });
});
