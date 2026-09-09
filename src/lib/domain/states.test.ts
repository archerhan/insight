import { describe, expect, it } from 'vitest';
import { canTransition, validateClaimShape } from './states';

describe('claim state machine', () => {
  it('允许从 pending 进入 active', () => {
    expect(canTransition('pending', 'active')).toBe(true);
  });

  it('active 可以被反驳挂红或直接击穿', () => {
    expect(canTransition('active', 'challenged')).toBe(true);
    expect(canTransition('active', 'refuted')).toBe(true);
  });

  it('击穿后只能修订或归档，不能回到 active', () => {
    expect(canTransition('refuted', 'superseded')).toBe(true);
    expect(canTransition('refuted', 'collapsed')).toBe(true);
    expect(canTransition('refuted', 'active')).toBe(false);
  });

  it('被挂红或已回应后仍可修订观点（旧版 superseded）', () => {
    expect(canTransition('challenged', 'superseded')).toBe(true);
    expect(canTransition('responded', 'superseded')).toBe(true);
  });

  it('悬空节点可被抢救回 active，也可继续悬空归档', () => {
    expect(canTransition('orphaned', 'active')).toBe(true);
    expect(canTransition('orphaned', 'collapsed')).toBe(true);
  });

  it('moot 只能归档，不能再参与', () => {
    expect(canTransition('moot', 'collapsed')).toBe(true);
    expect(canTransition('moot', 'active')).toBe(false);
  });
});

describe('claim relation shape', () => {
  it('理由层（parent 为空）必须使用 root relation', () => {
    expect(validateClaimShape({ parentId: null, relation: 'pro' })).toMatch(/root/);
    expect(validateClaimShape({ parentId: null, relation: 'root' })).toBeNull();
  });

  it('非理由层禁止使用 root relation', () => {
    expect(validateClaimShape({ parentId: 'a', relation: 'root' })).toMatch(/只能用于理由层/);
    expect(validateClaimShape({ parentId: 'a', relation: 'con' })).toBeNull();
  });
});
