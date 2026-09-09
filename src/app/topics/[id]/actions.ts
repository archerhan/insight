"use server";

import { redirect } from 'next/navigation';
import { auth } from '@/auth';
import {
  concedeToChallenge as concedeService,
  migrateClaim as migrateService,
  reviseClaim as reviseService,
} from '@/db/services/tree';
import {
  postRebutal as postRebutalService,
  postSupport as postSupportService,
  respondToChallenge as respondService,
  type NodeWriteOutcome,
} from '@/db/services/rebuttal';
import { getUserById } from '@/db/services/users';
import { loginHref } from '@/lib/auth/url';
import { publishGateError } from '@/lib/domain/course';
import { validateReplyDraft } from '@/lib/domain/rebuttal-checks';

/**
 * M3 对线动作层：登录/须知门槛与作者权限在 Server Action 二次校验，
 * 内容校验与程序检查在服务层事务内执行；成功后 redirect 回对线视图对应焦点。
 */

export interface TopicActionState {
  error: string | null;
}

function firstString(formData: FormData, name: string): string {
  const value = formData.get(name);
  return typeof value === 'string' ? value.trim() : '';
}

function firstErrorMessage(errors: string[]): string | null {
  return errors.length > 0 ? errors[0] : null;
}

function arenaHref(topicId: string, focusClaimId: string | null): string {
  const claim = focusClaimId ? `&claim=${encodeURIComponent(focusClaimId)}` : '';
  return `/topics/${encodeURIComponent(topicId)}?tab=arena${claim}`;
}

async function resolveParticipant(callbackPath: string) {
  const session = await auth();
  if (!session?.user?.id) redirect(loginHref(callbackPath));
  const user = await getUserById(session.user.id);
  if (!user) redirect(loginHref(callbackPath));
  return user;
}

/** 新增论点（支持/反驳/回应都会建 claim）必须完成《理性讨论须知》。 */
function requireCourseCompleted(user: { courseCompletedAt: Date | null }, callbackPath: string) {
  if (publishGateError(user)) {
    redirect(`/guide?next=${encodeURIComponent(callbackPath)}`);
  }
}

function applyProgramOutcome(
  outcome: NodeWriteOutcome,
): { error: string | null; ok: boolean } {
  return outcome.ok ? { error: null, ok: true } : { error: outcome.error, ok: false };
}

function errorMessage(error: unknown): string {
  if (error instanceof Error && error.message) return error.message;
  return '操作失败，请稍后重试';
}

/** 支持这一点：在焦点下新增 pro 子论点（走查重/侮辱检查）。 */
export async function postSupportAction(
  _prev: TopicActionState,
  formData: FormData,
): Promise<TopicActionState> {
  const topicId = firstString(formData, 'topicId');
  const parentId = firstString(formData, 'parentId');
  const title = firstString(formData, 'title');
  const body = firstString(formData, 'body');
  if (!topicId || !parentId) return { error: '缺少话题或父论点信息' };

  const callbackPath = arenaHref(topicId, parentId);
  const user = await resolveParticipant(callbackPath);
  requireCourseCompleted(user, callbackPath);

  const draftError = firstErrorMessage(validateReplyDraft({ mode: 'support', title, body }));
  if (draftError) return { error: draftError };

  let outcome: NodeWriteOutcome;
  try {
    outcome = await postSupportService({
      topicId,
      parentId,
      authorId: user.id,
      title,
      body,
    });
  } catch (error) {
    return { error: errorMessage(error) };
  }
  const applied = applyProgramOutcome(outcome);
  if (!applied.ok) return { error: applied.error };
  redirect(arenaHref(topicId, parentId));
}

/** 反驳这一点：复述 + 查重 + 侮辱通过后建 con 节点并挂红。 */
export async function postRebutalAction(
  _prev: TopicActionState,
  formData: FormData,
): Promise<TopicActionState> {
  const topicId = firstString(formData, 'topicId');
  const targetClaimId = firstString(formData, 'targetClaimId');
  const paraphrase = firstString(formData, 'paraphrase');
  const title = firstString(formData, 'title');
  const body = firstString(formData, 'body');
  if (!topicId || !targetClaimId) return { error: '缺少话题或被反驳论点信息' };

  const callbackPath = arenaHref(topicId, targetClaimId);
  const user = await resolveParticipant(callbackPath);
  requireCourseCompleted(user, callbackPath);

  const draftError = firstErrorMessage(
    validateReplyDraft({ mode: 'rebuttal', paraphrase, title, body }),
  );
  if (draftError) return { error: draftError };

  let outcome: NodeWriteOutcome;
  try {
    outcome = await postRebutalService({
      topicId,
      targetClaimId,
      authorId: user.id,
      paraphrase,
      title,
      body,
    });
  } catch (error) {
    return { error: errorMessage(error) };
  }
  const applied = applyProgramOutcome(outcome);
  if (!applied.ok) return { error: applied.error };
  redirect(arenaHref(topicId, targetClaimId));
}

/** 回应未决反驳：被反驳论点的作者给出回应（建 con 节点并解除该条挂红）。 */
export async function respondChallengeAction(
  _prev: TopicActionState,
  formData: FormData,
): Promise<TopicActionState> {
  const topicId = firstString(formData, 'topicId');
  const targetClaimId = firstString(formData, 'targetClaimId');
  const challengeId = firstString(formData, 'challengeId');
  const title = firstString(formData, 'title');
  const body = firstString(formData, 'body');
  if (!topicId || !targetClaimId || !challengeId) {
    return { error: '缺少反驳信息' };
  }

  const callbackPath = arenaHref(topicId, targetClaimId);
  const user = await resolveParticipant(callbackPath);
  requireCourseCompleted(user, callbackPath);

  const draftError = firstErrorMessage(validateReplyDraft({ mode: 'support', title, body }));
  if (draftError) return { error: draftError };

  let outcome: NodeWriteOutcome;
  try {
    outcome = await respondService({ challengeId, authorId: user.id, title, body });
  } catch (error) {
    return { error: errorMessage(error) };
  }
  const applied = applyProgramOutcome(outcome);
  if (!applied.ok) return { error: applied.error };
  redirect(arenaHref(topicId, targetClaimId));
}

/** 承认击穿：作者承认反驳成立，触发送击穿传播 + 击杀链提升。 */
export async function concedeChallengeAction(
  _prev: TopicActionState,
  formData: FormData,
): Promise<TopicActionState> {
  const topicId = firstString(formData, 'topicId');
  const targetClaimId = firstString(formData, 'targetClaimId');
  const challengeId = firstString(formData, 'challengeId');
  if (!topicId || !challengeId || !targetClaimId) return { error: '缺少反驳信息' };

  const callbackPath = arenaHref(topicId, targetClaimId);
  const user = await resolveParticipant(callbackPath);

  try {
    await concedeService({ challengeId, actorId: user.id });
  } catch (error) {
    return { error: errorMessage(error) };
  }
  redirect(arenaHref(topicId, targetClaimId));
}

/** 修订观点：作者生成 supersedes 新版，旧版归档。 */
export async function reviseClaimAction(
  _prev: TopicActionState,
  formData: FormData,
): Promise<TopicActionState> {
  const topicId = firstString(formData, 'topicId');
  const claimId = firstString(formData, 'claimId');
  const title = firstString(formData, 'title');
  const body = firstString(formData, 'body');
  if (!topicId || !claimId) return { error: '缺少论点信息' };

  const callbackPath = arenaHref(topicId, claimId);
  const user = await resolveParticipant(callbackPath);

  const draftError = firstErrorMessage(validateReplyDraft({ mode: 'support', title, body }));
  if (draftError) return { error: draftError };

  let revisionId: string;
  try {
    const revision = await reviseService({
      claimId,
      authorId: user.id,
      contentTitle: title,
      contentBody: body,
    });
    revisionId = revision.id;
  } catch (error) {
    return { error: errorMessage(error) };
  }
  redirect(arenaHref(topicId, revisionId));
}

/** 抢救迁移：把旧版名下的悬空子论点迁移到新版焦点下（仅论点作者本人）。 */
export async function rescueMigrateAction(
  _prev: TopicActionState,
  formData: FormData,
): Promise<TopicActionState> {
  const topicId = firstString(formData, 'topicId');
  const claimId = firstString(formData, 'claimId');
  const newParentId = firstString(formData, 'newParentId');
  if (!topicId || !claimId || !newParentId) return { error: '缺少迁移信息' };

  const callbackPath = arenaHref(topicId, newParentId);
  const user = await resolveParticipant(callbackPath);

  try {
    await migrateService({
      claimId,
      actorId: user.id,
      newParentId,
      reason: 'rescue_migration',
    });
  } catch (error) {
    return { error: errorMessage(error) };
  }
  redirect(arenaHref(topicId, newParentId));
}
