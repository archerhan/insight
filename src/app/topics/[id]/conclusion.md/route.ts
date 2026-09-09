import { buildConclusionMarkdownForTopic } from '@/db/services/conclusion';

/**
 * 简要版结论书 Markdown 导出（公开读）：/topics/[id]/conclusion.md
 * 内容来自当前 published 版本快照 + 采纳条目 + 实时未决风险。
 */
export const dynamic = 'force-dynamic';

export async function GET(
  _request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const { id } = await context.params;
  const markdown = await buildConclusionMarkdownForTopic(id);
  if (markdown === null) {
    return new Response('结论书不存在或尚未发布', { status: 404 });
  }

  const filename = `conclusion-${id.slice(0, 8)}.md`;
  return new Response(markdown, {
    status: 200,
    headers: {
      'Content-Type': 'text/markdown; charset=utf-8',
      'Content-Disposition': `attachment; filename="${filename}"`,
    },
  });
}
