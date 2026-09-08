/**
 * 论点树纯函数：层级、祖先链、重挂（提升/抢救迁移）。
 * 不依赖数据库，便于单元测试与后续迁移到图数据库。
 */

export interface ClaimLike {
  id: string;
  parentId: string | null;
  ancestors: string[];
}

type ClaimWithTopic = ClaimLike & { topicId?: string };

export interface ReparentPlan {
  /** 需要重写祖先链的节点 id -> 新 ancestors */
  ancestorsById: Map<string, string[]>;
}

/** 新子节点的祖先链 = 父节点祖先链 + 父节点 id；父为空（理由层）时为空数组。 */
export function childAncestors(parent: ClaimLike | null): string[] {
  return parent ? [...parent.ancestors, parent.id] : [];
}

function indexClaims(claims: ClaimLike[]): Map<string, ClaimLike> {
  const index = new Map<string, ClaimLike>();
  for (const claim of claims) {
    index.set(claim.id, claim);
  }
  return index;
}

function assertAcyclic(
  index: Map<string, ClaimLike>,
  moveId: string,
  newParentId: string | null,
) {
  if (newParentId === null) return;
  let cursor: string | null = newParentId;
  while (cursor !== null) {
    if (cursor === moveId) {
      throw new Error(`Cannot reparent ${moveId} under its own descendant ${newParentId}`);
    }
    const parent = index.get(cursor);
    cursor = parent?.parentId ?? null;
  }
}

function assertSameTopic(
  claims: ClaimWithTopic[],
  moveId: string,
  newParentId: string | null,
) {
  const move = claims.find((claim) => claim.id === moveId);
  if (!move) throw new Error(`Unknown claim ${moveId}`);
  if (newParentId === null) return;
  const newParent = claims.find((claim) => claim.id === newParentId);
  if (!newParent) throw new Error(`Unknown parent ${newParentId}`);
  if (move.topicId !== undefined && newParent.topicId !== undefined && move.topicId !== newParent.topicId) {
    throw new Error('Cannot reparent across topics');
  }
}

/**
 * 生成把 moveId 及其整棵子树重挂到 newParentId 下的祖先链重写计划。
 * 提升到理由层时 newParentId = null。
 */
export function buildReparentPlan(
  claims: ClaimLike[],
  moveId: string,
  newParentId: string | null,
): ReparentPlan {
  const index = indexClaims(claims);
  assertSameTopic(claims as ClaimWithTopic[], moveId, newParentId);
  assertAcyclic(index, moveId, newParentId);

  const childrenByParent = new Map<string | null, ClaimLike[]>();
  for (const claim of claims) {
    const list = childrenByParent.get(claim.parentId) ?? [];
    list.push(claim);
    childrenByParent.set(claim.parentId, list);
  }

  const ancestorsById = new Map<string, string[]>();
  const newParent = newParentId === null ? null : (index.get(newParentId) ?? null);
  const rootAncestors = childAncestors(newParent);

  const queue: Array<{ id: string; ancestors: string[] }> = [{ id: moveId, ancestors: rootAncestors }];
  while (queue.length > 0) {
    const current = queue.shift();
    if (!current) break;
    ancestorsById.set(current.id, current.ancestors);
    for (const child of childrenByParent.get(current.id) ?? []) {
      queue.push({ id: child.id, ancestors: [...current.ancestors, current.id] });
    }
  }

  return { ancestorsById };
}
