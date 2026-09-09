"use server";

import { redirect } from 'next/navigation';
import { auth } from '@/auth';
import { getUserById } from '@/db/services/users';
import { publishTopic } from '@/db/services/publish';
import { loginHref } from '@/lib/auth/url';
import { publishGateError } from '@/lib/domain/course';
import {
  parsePublishForm,
  parseRevealDate,
  validatePublishDraft,
} from '@/lib/domain/publish';

export interface PublishTopicState {
  error: string | null;
}

/**
 * 发布话题（M2 验收点）：服务端二次校验登录、须知门槛与草稿，
 * 随后以单事务落库并跳转到新话题页。
 */
export async function publishTopicAction(
  _prev: PublishTopicState,
  formData: FormData,
): Promise<PublishTopicState> {
  const session = await auth();
  if (!session?.user?.id) {
    redirect(loginHref('/topics/new'));
  }

  const user = await getUserById(session.user.id);
  if (!user) {
    redirect(loginHref('/topics/new'));
  }

  const gateError = publishGateError(user);
  if (gateError) {
    redirect('/guide?next=%2Ftopics%2Fnew');
  }

  const draft = parsePublishForm(formData);
  const errors = validatePublishDraft(draft);
  if (errors.length > 0) {
    return { error: errors[0] };
  }

  const result = await publishTopic({
    ownerId: user.id,
    type: draft.type,
    title: draft.title,
    body: draft.body,
    stance: draft.stance,
    lean: draft.lean,
    tagNames: draft.tags,
    evidenceSummary: draft.evidenceSummary,
    stakeEnabled: draft.stakeEnabled,
    revealAt: draft.stakeEnabled ? parseRevealDate(draft.revealDate) : null,
    bountyEnabled: draft.bountyEnabled,
    allowPublicRebuttal: draft.allowPublicRebuttal,
  });

  redirect(`/topics/${result.topic.id}`);
}
