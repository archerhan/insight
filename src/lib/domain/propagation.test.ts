import { describe, expect, it } from 'vitest';
import { planRefutationCascade, type CascadeNode } from './propagation';

const nodes: CascadeNode[] = [
  { id: 'a', parentId: null, ancestors: [], relation: 'root' },
  { id: 'p1', parentId: 'a', ancestors: ['a'], relation: 'pro' },
  { id: 'p2', parentId: 'p1', ancestors: ['a', 'p1'], relation: 'pro' },
  { id: 'x1', parentId: 'p1', ancestors: ['a', 'p1'], relation: 'con' },
  { id: 'c1', parentId: 'a', ancestors: ['a'], relation: 'con' },
  { id: 'k1', parentId: 'c1', ancestors: ['a', 'c1'], relation: 'con' },
  { id: 'c2', parentId: 'a', ancestors: ['a'], relation: 'con' },
];

describe('planRefutationCascade', () => {
  it('指定击杀链时：支撑子孙悬空、其余反驳 moot、击杀链提升为理由层', () => {
    const plan = planRefutationCascade(nodes, 'a', 'c1');

    const byId = (id: string) => plan.updates.find((u) => u.claimId === id);
    expect(byId('a')?.status).toBe('refuted');
    expect(byId('p1')?.status).toBe('orphaned');
    expect(byId('p2')?.status).toBe('orphaned');
    expect(byId('x1')?.status).toBe('moot');
    expect(byId('c2')?.status).toBe('moot');

    expect(byId('c1')).toMatchObject({
      status: 'active',
      parentId: null,
      ancestors: [],
      relation: 'root',
    });
    expect(byId('k1')).toMatchObject({ status: 'active', parentId: 'c1', ancestors: ['c1'] });

    expect(plan.events.find((e) => e.claimId === 'c1')?.type).toBe('promoted');
    expect(plan.events.find((e) => e.claimId === 'p1')?.type).toBe('orphaned');
  });

  it('不指定击杀链时全部反驳后代 moot', () => {
    const plan = planRefutationCascade(nodes, 'a');
    const byId = (id: string) => plan.updates.find((u) => u.claimId === id);
    expect(byId('c1')?.status).toBe('moot');
    expect(byId('k1')?.status).toBe('moot');
  });

  it('killer 必须是 refuted 的直接 con 子节点', () => {
    expect(() => planRefutationCascade(nodes, 'a', 'p1')).toThrow(/直接 con 子节点/);
    expect(() => planRefutationCascade(nodes, 'p1', 'a')).toThrow(/直接 con 子节点/);
  });

  it('未知节点抛出错误', () => {
    expect(() => planRefutationCascade(nodes, 'missing')).toThrow(/Unknown claim/);
  });
});
