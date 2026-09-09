import { beforeEach, describe, expect, it, vi } from 'vitest';

const redirectMock = vi.fn((...args: unknown[]) => {
  void args;
  throw new Error('NEXT_REDIRECT');
});

vi.mock('next/navigation', () => ({
  redirect: (...args: unknown[]) => redirectMock(...args),
}));

vi.mock('@/auth', () => ({
  auth: vi.fn(),
}));

vi.mock('@/db/services/users', () => ({
  getUserById: vi.fn(),
}));

vi.mock('@/db/services/rebuttal', () => ({
  postSupport: vi.fn(),
  postRebutal: vi.fn(),
  respondToChallenge: vi.fn(),
}));

vi.mock('@/db/services/tree', () => ({
  concedeToChallenge: vi.fn(),
  migrateClaim: vi.fn(),
  reviseClaim: vi.fn(),
}));

vi.mock('@/db/services/predictions', () => ({
  placePrediction: vi.fn(),
  respondToFollowup: vi.fn(),
}));

import { auth } from '@/auth';
import { getUserById } from '@/db/services/users';
import { postSupport, postRebutal, respondToChallenge } from '@/db/services/rebuttal';
import {
  concedeToChallenge,
  migrateClaim,
  reviseClaim,
} from '@/db/services/tree';
import {
  concedeChallengeAction,
  placePredictionAction,
  postRebutalAction,
  postSupportAction,
  rescueMigrateAction,
  respondFollowupAction,
  respondChallengeAction,
  reviseClaimAction,
} from './actions';
import { placePrediction, respondToFollowup } from '@/db/services/predictions';

const authMock = vi.mocked(auth);
const getUserByIdMock = vi.mocked(getUserById);
const postSupportMock = vi.mocked(postSupport);
const postRebutalMock = vi.mocked(postRebutal);
const respondMock = vi.mocked(respondToChallenge);
const concedeMock = vi.mocked(concedeToChallenge);
const migrateMock = vi.mocked(migrateClaim);
const reviseMock = vi.mocked(reviseClaim);
const placePredictionMock = vi.mocked(placePrediction);
const respondToFollowupMock = vi.mocked(respondToFollowup);

function completedUser() {
  return {
    id: 'u-1',
    displayName: '小明',
    status: 'active',
    courseCompletedAt: new Date('2026-09-09T08:30:00Z'),
  } as never;
}

function form(entries: Record<string, string>) {
  const data = new FormData();
  for (const [key, value] of Object.entries(entries)) data.set(key, value);
  return data;
}

const baseForm = {
  topicId: 'topic-1',
  targetClaimId: 'claim-root',
  parentId: 'claim-root',
  challengeId: 'challenge-1',
  paraphrase: '对方主张裸辞去大理开民宿是实现自由生活的现实路径',
  title: '民宿牌照拿证周期长，现金流撑不住',
  body: '补充说明',
  claimId: 'claim-old',
  newParentId: 'claim-new',
};

beforeEach(() => {
  redirectMock.mockClear();
  authMock.mockReset();
  getUserByIdMock.mockReset();
  postSupportMock.mockReset();
  postRebutalMock.mockReset();
  respondMock.mockReset();
  concedeMock.mockReset();
  migrateMock.mockReset();
  reviseMock.mockReset();
  placePredictionMock.mockReset();
  respondToFollowupMock.mockReset();
});

describe('对线动作层', () => {
  it('postSupportAction：未登录跳登录页并保留回跳地址', async () => {
    authMock.mockResolvedValueOnce(null as never);
    await expect(
      postSupportAction({ error: null }, form({ ...baseForm, body: '' })),
    ).rejects.toThrow('NEXT_REDIRECT');
    expect(redirectMock).toHaveBeenCalledWith(
      '/login?callbackUrl=%2Ftopics%2Ftopic-1%3Ftab%3Darena%26claim%3Dclaim-root',
    );
    expect(postSupportMock).not.toHaveBeenCalled();
  });

  it('postSupportAction：未完成须知跳转须知页', async () => {
    authMock.mockResolvedValueOnce({ user: { id: 'u-1' } } as never);
    getUserByIdMock.mockResolvedValueOnce({
      id: 'u-1',
      courseCompletedAt: null,
    } as never);
    await expect(
      postSupportAction({ error: null }, form({ ...baseForm, body: '' })),
    ).rejects.toThrow('NEXT_REDIRECT');
    expect(redirectMock).toHaveBeenCalledWith(
      '/guide?next=%2Ftopics%2Ftopic-1%3Ftab%3Darena%26claim%3Dclaim-root',
    );
  });

  it('postSupportAction：程序检查失败时把提示带回表单', async () => {
    authMock.mockResolvedValueOnce({ user: { id: 'u-1' } } as never);
    getUserByIdMock.mockResolvedValueOnce(completedUser());
    postSupportMock.mockResolvedValueOnce({
      ok: false,
      error: '该论点与同层已有内容高度重复',
      entries: [],
    });

    const state = await postSupportAction({ error: null }, form({ ...baseForm, body: '' }));
    expect(state.error).toMatch(/重复/);
    expect(redirectMock).not.toHaveBeenCalled();
  });

  it('postSupportAction：通过后跳转回焦点', async () => {
    authMock.mockResolvedValueOnce({ user: { id: 'u-1' } } as never);
    getUserByIdMock.mockResolvedValueOnce(completedUser());
    postSupportMock.mockResolvedValueOnce({
      ok: true,
      claim: { id: 'claim-pro' },
      entries: [],
    } as never);
    await expect(
      postSupportAction({ error: null }, form({ ...baseForm, body: '' })),
    ).rejects.toThrow('NEXT_REDIRECT');
    expect(redirectMock).toHaveBeenCalledWith(
      '/topics/topic-1?tab=arena&claim=claim-root',
    );
  });

  it('postRebutalAction：复述缺失时在动作层返回表单错误', async () => {
    authMock.mockResolvedValueOnce({ user: { id: 'u-1' } } as never);
    getUserByIdMock.mockResolvedValueOnce(completedUser());
    const state = await postRebutalAction(
      { error: null },
      form({ ...baseForm, paraphrase: '' }),
    );
    expect(state.error).toMatch(/复述/);
    expect(postRebutalMock).not.toHaveBeenCalled();
  });

  it('postRebutalAction：服务层异常被转为表单错误', async () => {
    authMock.mockResolvedValueOnce({ user: { id: 'u-1' } } as never);
    getUserByIdMock.mockResolvedValueOnce(completedUser());
    postRebutalMock.mockRejectedValueOnce(new Error('不能反驳自己发布的论点'));
    const state = await postRebutalAction({ error: null }, form(baseForm));
    expect(state.error).toMatch(/不能反驳自己/);
  });

  it('postRebutalAction：通过后挂红并留在被反驳焦点', async () => {
    authMock.mockResolvedValueOnce({ user: { id: 'u-1' } } as never);
    getUserByIdMock.mockResolvedValueOnce(completedUser());
    postRebutalMock.mockResolvedValueOnce({
      ok: true,
      claim: { id: 'claim-con' },
      challenge: { id: 'challenge-new' },
      entries: [],
    } as never);
    await expect(
      postRebutalAction({ error: null }, form(baseForm)),
    ).rejects.toThrow('NEXT_REDIRECT');
    expect(postRebutalMock).toHaveBeenCalledWith({
      topicId: 'topic-1',
      targetClaimId: 'claim-root',
      authorId: 'u-1',
      paraphrase: baseForm.paraphrase,
      title: baseForm.title,
      body: baseForm.body,
    });
    expect(redirectMock).toHaveBeenCalledWith(
      '/topics/topic-1?tab=arena&claim=claim-root',
    );
  });

  it('respondChallengeAction：成功回应后回到目标论点', async () => {
    authMock.mockResolvedValueOnce({ user: { id: 'u-1' } } as never);
    getUserByIdMock.mockResolvedValueOnce(completedUser());
    respondMock.mockResolvedValueOnce({
      ok: true,
      claim: { id: 'claim-response' },
      entries: [],
    } as never);
    await expect(
      respondChallengeAction({ error: null }, form(baseForm)),
    ).rejects.toThrow('NEXT_REDIRECT');
    expect(respondMock).toHaveBeenCalledWith({
      challengeId: 'challenge-1',
      authorId: 'u-1',
      title: baseForm.title,
      body: baseForm.body,
    });
    expect(redirectMock).toHaveBeenCalledWith(
      '/topics/topic-1?tab=arena&claim=claim-root',
    );
  });

  it('concedeChallengeAction：非作者调用时服务层报错并返回表单错误', async () => {
    authMock.mockResolvedValueOnce({ user: { id: 'u-1' } } as never);
    getUserByIdMock.mockResolvedValueOnce(completedUser());
    concedeMock.mockRejectedValueOnce(new Error('Only the target claim author can concede'));
    const state = await concedeChallengeAction({ error: null }, form(baseForm));
    expect(state.error).toMatch(/target claim author/);
    expect(redirectMock).not.toHaveBeenCalled();
  });

  it('reviseClaimAction：成功后跳到新版论点', async () => {
    authMock.mockResolvedValueOnce({ user: { id: 'u-1' } } as never);
    getUserByIdMock.mockResolvedValueOnce(completedUser());
    reviseMock.mockResolvedValueOnce({
      id: 'claim-new',
      supersedesClaimId: 'claim-old',
    } as never);
    await expect(
      reviseClaimAction(
        { error: null },
        form({
          topicId: 'topic-1',
          claimId: 'claim-old',
          title: '先驻留大理三个月调研再决定是否裸辞',
        }),
      ),
    ).rejects.toThrow('NEXT_REDIRECT');
    expect(redirectMock).toHaveBeenCalledWith(
      '/topics/topic-1?tab=arena&claim=claim-new',
    );
  });

  it('rescueMigrateAction：成功后回到新版焦点', async () => {
    authMock.mockResolvedValueOnce({ user: { id: 'u-1' } } as never);
    getUserByIdMock.mockResolvedValueOnce(completedUser());
    migrateMock.mockResolvedValueOnce(undefined);
    await expect(
      rescueMigrateAction(
        { error: null },
        form({
          topicId: 'topic-1',
          claimId: 'claim-orphan',
          newParentId: 'claim-new',
        }),
      ),
    ).rejects.toThrow('NEXT_REDIRECT');
    expect(migrateMock).toHaveBeenCalledWith({
      claimId: 'claim-orphan',
      actorId: 'u-1',
      newParentId: 'claim-new',
      reason: 'rescue_migration',
    });
  });

  it('placePredictionAction：未登录跳登录页', async () => {
    authMock.mockResolvedValueOnce(null as never);
    await expect(
      placePredictionAction(
        { error: null },
        form({ topicId: 'topic-1', statement: '我押你会后悔', predictedOutcome: 'regret' }),
      ),
    ).rejects.toThrow('NEXT_REDIRECT');
    expect(redirectMock).toHaveBeenCalledWith('/login?callbackUrl=%2Ftopics%2Ftopic-1');
    expect(placePredictionMock).not.toHaveBeenCalled();
  });

  it('placePredictionAction：成功登记后回到话题页', async () => {
    authMock.mockResolvedValueOnce({ user: { id: 'u-1' } } as never);
    getUserByIdMock.mockResolvedValueOnce(completedUser());
    placePredictionMock.mockResolvedValueOnce({ id: 'pred-1' } as never);
    await expect(
      placePredictionAction(
        { error: null },
        form({ topicId: 'topic-1', statement: '我押你三个月内会后悔', predictedOutcome: 'regret' }),
      ),
    ).rejects.toThrow('NEXT_REDIRECT');
    expect(placePredictionMock).toHaveBeenCalledWith({
      topicId: 'topic-1',
      bettorId: 'u-1',
      statement: '我押你三个月内会后悔',
      predictedOutcome: 'regret',
    });
    expect(redirectMock).toHaveBeenCalledWith('/topics/topic-1');
  });

  it('respondFollowupAction：楼主回访成功并跳回结论书视图', async () => {
    authMock.mockResolvedValueOnce({ user: { id: 'u-1' } } as never);
    getUserByIdMock.mockResolvedValueOnce(completedUser());
    respondToFollowupMock.mockResolvedValueOnce({
      realityCheckId: 'rc-1',
      followupId: 'f-1',
      result: 'no_regret',
      hit: 1,
      miss: 1,
      voided: 0,
    } as never);
    await expect(
      respondFollowupAction(
        { error: null },
        form({ topicId: 'topic-1', wave: '30', regretLevel: 'no_regret' }),
      ),
    ).rejects.toThrow('NEXT_REDIRECT');
    expect(respondToFollowupMock).toHaveBeenCalledWith({
      topicId: 'topic-1',
      userId: 'u-1',
      wave: 30,
      regretLevel: 'no_regret',
    });
    expect(redirectMock).toHaveBeenCalledWith(
      '/topics/topic-1?tab=conclusion',
    );
  });
});
