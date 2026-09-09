/**
 * 击穿传播纯函数：父论点被击穿后，
 * 支撑型子孙 → orphaned（悬空），反驳型后代 → moot，
 * 击杀链顶端（若指定）自动提升为理由层并重写其子树祖先链。
 */

import type { ClaimLike } from './tree';

export interface CascadeNode extends ClaimLike {
  relation: 'root' | 'pro' | 'con' | 'addon' | 'question';
}

export type CascadeStatus = 'orphaned' | 'moot' | 'active' | 'refuted';

type InvalidationStatus = 'orphaned' | 'moot';

export interface CascadeUpdate {
  claimId: string;
  status: CascadeStatus;
  parentId?: string | null;
  ancestors?: string[];
  /** 理由层节点（parent 置 NULL）必须携带 root relation。 */
  relation?: CascadeNode['relation'];
}

export interface CascadeEvent {
  claimId: string;
  type: 'refuted' | 'orphaned' | 'moot' | 'promoted';
}

export interface CascadePlan {
  updates: CascadeUpdate[];
  events: CascadeEvent[];
}

function childrenOf(nodes: CascadeNode[], parentId: string | null): CascadeNode[] {
  return nodes.filter((node) => node.parentId === parentId);
}

function statusForInvalidatedParent(relation: CascadeNode['relation']): InvalidationStatus {
  return relation === 'pro' ? 'orphaned' : 'moot';
}

/** 把击杀链子树整体重挂到理由层（parent 置 NULL、祖先链清空）。 */
function rebaseSubtree(
  nodes: CascadeNode[],
  rootId: string,
): { claimId: string; parentId: string | null; ancestors: string[] }[] {
  const childrenByParent = new Map<string | null, CascadeNode[]>();
  for (const node of nodes) {
    const list = childrenByParent.get(node.parentId) ?? [];
    list.push(node);
    childrenByParent.set(node.parentId, list);
  }
  const rebased: { claimId: string; parentId: string | null; ancestors: string[] }[] = [];
  const queue: Array<{ id: string; parentId: string | null; ancestors: string[] }> = [
    { id: rootId, parentId: null, ancestors: [] },
  ];
  while (queue.length > 0) {
    const current = queue.shift();
    if (!current) break;
    rebased.push({ claimId: current.id, parentId: current.parentId, ancestors: current.ancestors });
    for (const child of childrenByParent.get(current.id) ?? []) {
      queue.push({ id: child.id, parentId: current.id, ancestors: [...current.ancestors, current.id] });
    }
  }
  return rebased;
}

/**
 * 生成击穿传播计划。
 * @param nodes 话题内全部论点
 * @param refutedId 被击穿论点
 * @param killerId 击杀链顶端（可选，必须是 refuted 的直接 con 子节点）；存在时自动提升为理由层
 */
export function planRefutationCascade(
  nodes: CascadeNode[],
  refutedId: string,
  killerId?: string | null,
): CascadePlan {
  const target = nodes.find((node) => node.id === refutedId);
  if (!target) throw new Error(`Unknown claim ${refutedId}`);
  let killerNode: CascadeNode | undefined;
  if (killerId) {
    killerNode = nodes.find((node) => node.id === killerId);
    if (!killerNode || killerNode.parentId !== refutedId || killerNode.relation !== 'con') {
      throw new Error('killerId 必须是 refuted 的直接 con 子节点');
    }
  }

  const updates: CascadeUpdate[] = [];
  const events: CascadeEvent[] = [];
  updates.push({ claimId: refutedId, status: 'refuted' });
  events.push({ claimId: refutedId, type: 'refuted' });

  const visited = new Set<string>([refutedId]);
  const queue: string[] = [refutedId];

  while (queue.length > 0) {
    const currentId = queue.shift();
    if (!currentId) break;
    for (const child of childrenOf(nodes, currentId)) {
      if (visited.has(child.id)) continue;
      visited.add(child.id);
      if (child.id === killerId) continue; // 击杀链单独处理
      const status = statusForInvalidatedParent(child.relation);
      updates.push({ claimId: child.id, status });
      events.push({ claimId: child.id, type: status });
      queue.push(child.id);
    }
  }

  if (killerNode) {
    updates.push({
      claimId: killerNode.id,
      status: 'active',
      parentId: null,
      ancestors: [],
      relation: 'root',
    });
    events.push({ claimId: killerNode.id, type: 'promoted' });
    // killer 原父已失效，killer 子树整体重挂到理由层
    for (const rebase of rebaseSubtree(nodes, killerNode.id)) {
      if (rebase.claimId === killerNode.id) continue;
      // killer 子树与被击穿节点的其他后代互斥（树形数据保证），不会重复入列
      updates.push({
        claimId: rebase.claimId,
        status: 'active',
        parentId: rebase.parentId,
        ancestors: rebase.ancestors,
      });
    }
  }

  return { updates, events };
}
