import { describe, expect, it } from 'vitest';
import { buildReparentPlan, childAncestors } from './tree';

describe('childAncestors', () => {
  it('根节点（理由层）的祖先链为空', () => {
    expect(childAncestors(null)).toEqual([]);
  });

  it('子节点祖先链 = 父祖先链 + 父 id', () => {
    const parent = { id: 'a', parentId: null, ancestors: [] };
    expect(childAncestors(parent)).toEqual(['a']);
    const deep = { id: 'b', parentId: 'a', ancestors: ['a'] };
    expect(childAncestors(deep)).toEqual(['a', 'b']);
  });
});

describe('buildReparentPlan', () => {
  const claims = [
    { id: 'a', parentId: null, ancestors: [] },
    { id: 'b', parentId: 'a', ancestors: ['a'] },
    { id: 'c', parentId: 'b', ancestors: ['a', 'b'] },
    { id: 'd', parentId: null, ancestors: [] },
    { id: 'e', parentId: 'c', ancestors: ['a', 'b', 'c'] },
  ];

  it('把深节点提升到理由层时整棵子树祖先链被清空重写', () => {
    const plan = buildReparentPlan(claims, 'c', null);
    expect(plan.ancestorsById.get('c')).toEqual([]);
    expect(plan.ancestorsById.get('e')).toEqual(['c']);
  });

  it('把节点迁移到同层新父节点下时子树一并重写', () => {
    const plan = buildReparentPlan(claims, 'b', 'd');
    expect(plan.ancestorsById.get('b')).toEqual(['d']);
    expect(plan.ancestorsById.get('c')).toEqual(['d', 'b']);
    expect(plan.ancestorsById.get('e')).toEqual(['d', 'b', 'c']);
  });

  it('拒绝把节点挂到自己的后代下面（成环）', () => {
    expect(() => buildReparentPlan(claims, 'a', 'c')).toThrow(/descendant/);
  });

  it('拒绝跨话题迁移', () => {
    const crossTopic = [
      { id: 'x', parentId: null, ancestors: [], topicId: 't1' },
      { id: 'y', parentId: null, ancestors: [], topicId: 't2' },
    ];
    expect(() => buildReparentPlan(crossTopic, 'x', 'y')).toThrow(/across topics/);
  });

  it('拒绝不存在的节点', () => {
    expect(() => buildReparentPlan(claims, 'missing', null)).toThrow(/Unknown claim/);
  });
});
