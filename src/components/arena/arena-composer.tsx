"use client";

import { useActionState, useState } from 'react';
import Link from 'next/link';
import { AlertCircle, CheckCircle2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import {
  postRebutalAction,
  postSupportAction,
  type TopicActionState,
} from '@/app/topics/[id]/actions';
import {
  runProgramChecks,
  type ProgramCheckReport,
} from '@/lib/domain/rebuttal-checks';

/**
 * 对线输入条（客户端）：支持 / 反驳分段；反驳先复述对方观点，
 * 本地复述检验通过后解锁正文输入，最终提交由服务端再次权威校验并留 ai_flags。
 */

export interface ArenaComposerProps {
  topicId: string;
  focusId: string;
  focusTitle: string;
  focusBody: string | null;
  canPost: boolean;
  focusOwnedByViewer: boolean;
  loginHref: string;
  guideHref: string;
}

type Mode = 'pro' | 'con';
const initialActionState: TopicActionState = { error: null };

const inputClass =
  'mt-1.5 w-full rounded-lg border border-input bg-background px-3 py-2 text-sm text-foreground shadow-xs outline-none transition-colors placeholder:text-muted-foreground/60 focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/40';

function ErrorNote({ message }: { message: string | null }) {
  if (!message) return null;
  return (
    <p role="alert" className="mt-2 flex items-start gap-1.5 text-[12.5px] leading-5 text-con">
      <AlertCircle className="mt-0.5 size-3.5 shrink-0" aria-hidden="true" />
      {message}
    </p>
  );
}

function Segment({
  value,
  active,
  disabled,
  onSelect,
}: {
  value: Mode;
  active: boolean;
  disabled?: boolean;
  onSelect: () => void;
}) {
  return (
    <button
      type="button"
      aria-pressed={active}
      disabled={disabled}
      onClick={onSelect}
      className={cn(
        'rounded-md px-3.5 py-1.5 text-[13px] transition-colors',
        disabled && 'cursor-not-allowed opacity-50',
        active ? 'bg-surface font-medium text-foreground shadow-sm' : 'text-muted-foreground',
      )}
    >
      {value === 'pro' ? '支持这一点' : '反驳这一点'}
    </button>
  );
}

export function ArenaComposer({
  topicId,
  focusId,
  focusTitle,
  focusBody,
  canPost,
  focusOwnedByViewer,
  loginHref,
  guideHref,
}: ArenaComposerProps) {
  const [mode, setMode] = useState<Mode>('pro');
  const [paraphrase, setParaphrase] = useState('');
  const [paraphraseReport, setParaphraseReport] = useState<ProgramCheckReport | null>(null);
  const [paraphrasePassed, setParaphrasePassed] = useState(false);
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');

  const [supportState, supportAction] = useActionState(postSupportAction, initialActionState);
  const [rebuttalState, rebuttalAction] = useActionState(postRebutalAction, initialActionState);

  const rebuttalBlocked = focusOwnedByViewer;

  function switchMode(next: Mode) {
    setMode(next);
    setParaphraseReport(null);
    setParaphrasePassed(false);
  }

  function checkParaphrase() {
    const report = runProgramChecks({
      mode: 'rebuttal',
      targetTitle: focusTitle,
      targetBody: focusBody,
      paraphrase,
      title: '',
      existingTitles: [],
    });
    const paraphraseCheck = report.checks.find((check) => check.kind === 'paraphrase');
    setParaphraseReport(report);
    if (paraphraseCheck?.status === 'approved') {
      setParaphrasePassed(true);
    }
  }

  if (!canPost) {
    return (
      <section
        className="mt-5 rounded-xl border border-border bg-card p-4 sm:p-5"
        aria-label="参与对线"
      >
        <p className="text-[14px] font-medium">想参与对线？</p>
        <div className="mt-2 flex flex-wrap items-center gap-3">
          <Link
            href={loginHref}
            className="rounded-lg bg-primary px-3.5 py-1.5 text-[13px] font-medium text-primary-foreground hover:bg-primary/80"
          >
            登录 / 注册
          </Link>
          <Link
            href={guideHref}
            className="text-[13px] text-muted-foreground underline-offset-4 hover:text-foreground hover:underline"
          >
            先读《理性讨论须知》
          </Link>
        </div>
      </section>
    );
  }

  return (
    <section
      className="mt-5 rounded-xl border border-border bg-card p-4 sm:p-5"
      aria-label="回应输入"
    >
      <div
        className="inline-flex rounded-lg border border-border bg-muted/60 p-0.5"
        role="group"
        aria-label="回应类型"
      >
        <Segment value="pro" active={mode === 'pro'} onSelect={() => switchMode('pro')} />
        <Segment
          value="con"
          active={mode === 'con'}
          disabled={rebuttalBlocked}
          onSelect={() => {
            if (rebuttalBlocked) return;
            switchMode('con');
          }}
        />
      </div>
      {rebuttalBlocked && (
        <p className="mt-2 text-[12.5px] text-con">
          这是你发布的论点，不能反驳自己；要修正立场请使用“修订”。
        </p>
      )}

      {mode === 'pro' && (
        <form action={supportAction} className="mt-3">
          <input type="hidden" name="topicId" value={topicId} />
          <input type="hidden" name="parentId" value={focusId} />
          <label className="block text-[13px] text-muted-foreground">
            一句话说清这条支撑理由
            <input
              className={inputClass}
              name="title"
              value={title}
              onChange={(event) => setTitle(event.target.value)}
              placeholder="例如：先租后买、分批投入，风险可控制在 20 万以内"
              maxLength={200}
            />
          </label>
          <label className="mt-2 block text-[13px] text-muted-foreground">
            补充说明（可选）
            <textarea
              className={cn(inputClass, 'min-h-20 resize-y')}
              name="body"
              value={body}
              onChange={(event) => setBody(event.target.value)}
              placeholder="事实、来源或推理过程；系统会自动检查是否与已有论点重复"
              maxLength={2000}
            />
          </label>
          <div className="mt-3 flex items-center gap-3">
            <Button type="submit" variant="default">
              提交支持
            </Button>
            <span className="text-[12px] text-muted-foreground">
              提交前会自动查重并识别不友善用语
            </span>
          </div>
          <ErrorNote message={supportState.error} />
        </form>
      )}

      {mode === 'con' && !rebuttalBlocked && (
        <div className="mt-3">
          {!paraphrasePassed ? (
            <div>
              <label className="block text-[13px] text-muted-foreground">
                第一步 · 复述对方核心观点（通过复述检验后才会解锁反驳输入框）
                <textarea
                  className={cn(inputClass, 'min-h-20 resize-y')}
                  value={paraphrase}
                  onChange={(event) => {
                    setParaphrase(event.target.value);
                    setParaphraseReport(null);
                    setParaphrasePassed(false);
                  }}
                  placeholder="先写下对方观点的复述……"
                  maxLength={500}
                />
              </label>
              <div className="mt-3 flex items-center gap-3">
                <Button type="button" variant="outline" onClick={checkParaphrase}>
                  检查复述
                </Button>
                <span className="text-[12px] text-muted-foreground">
                  需包含对方主张的核心关键词，且不能整段照抄
                </span>
              </div>
              {paraphraseReport?.passed === false && (
                <p role="alert" className="mt-2 text-[12.5px] leading-5 text-con">
                  {paraphraseReport.checks.find((check) => check.status === 'flagged')?.message}
                </p>
              )}
            </div>
          ) : (
            <form action={rebuttalAction}>
              <input type="hidden" name="topicId" value={topicId} />
              <input type="hidden" name="targetClaimId" value={focusId} />
              <input type="hidden" name="paraphrase" value={paraphrase} />
              <p className="flex items-center gap-1.5 text-[12.5px] text-pro">
                <CheckCircle2 className="size-4" aria-hidden="true" />
                复述检验通过，请写下反驳
              </p>
              <label className="mt-2 block text-[13px] text-muted-foreground">
                一句话说清反驳要点
                <input
                  className={inputClass}
                  name="title"
                  value={title}
                  onChange={(event) => setTitle(event.target.value)}
                  placeholder="直接针对对方主张的前提、事实或推理"
                  maxLength={200}
                />
              </label>
              <label className="mt-2 block text-[13px] text-muted-foreground">
                展开论证（可选）
                <textarea
                  className={cn(inputClass, 'min-h-20 resize-y')}
                  name="body"
                  value={body}
                  onChange={(event) => setBody(event.target.value)}
                  placeholder="事实、来源或反例……"
                  maxLength={2000}
                />
              </label>
              <div className="mt-3 flex items-center gap-3">
                <Button type="submit" variant="default">
                  提交反驳（挂红计时）
                </Button>
                <button
                  type="button"
                  className="text-[12px] text-muted-foreground underline-offset-2 hover:underline"
                  onClick={() => {
                    setParaphrasePassed(false);
                    setParaphraseReport(null);
                  }}
                >
                  重新复述
                </button>
              </div>
              <ErrorNote message={rebuttalState.error} />
            </form>
          )}
        </div>
      )}

      <p className="mt-3 border-t border-dashed border-border pt-2.5 text-[11.5px] text-muted-foreground">
        复述、查重与不友善用语由本地程序检查（可扩展 LLM）把关；最终以服务端校验为准。
      </p>
    </section>
  );
}
