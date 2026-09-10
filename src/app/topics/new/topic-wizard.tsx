"use client";

import { useActionState, useRef, useState } from 'react';
import { ArrowLeft, ArrowRight, Check, Compass, FileText, Plus, Scale } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import {
  defaultRevealDate,
  OWNER_LEAN_LABELS,
  OWNER_LEANS,
  PUBLISH_LIMITS,
  SUGGESTED_TAGS,
  TOPIC_TYPE_LABELS,
  validatePublishDraft,
  type OwnerLean,
  type TopicType,
} from '@/lib/domain/publish';
import { publishTopicAction } from './actions';

const initialPublishState = { error: null };

const STEPS = [
  { label: '类型' },
  { label: '主张与论据' },
  { label: '规则与发布' },
] as const;

function localDateInput(date: Date): string {
  const year = date.getFullYear();
  const month = `${date.getMonth() + 1}`.padStart(2, '0');
  const day = `${date.getDate()}`.padStart(2, '0');
  return `${year}-${month}-${day}`;
}

const inputClass =
  'mt-2 w-full rounded-lg border border-input bg-background px-3 py-2 text-sm text-foreground shadow-xs outline-none transition-colors placeholder:text-muted-foreground/60 focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/40';

const labelClass = 'text-[13.5px] font-medium text-foreground';
const descClass = 'mt-1 block text-[12.5px] leading-5 text-muted-foreground';

function Switch({
  checked,
  onToggle,
  label,
  description,
}: {
  checked: boolean;
  onToggle: () => void;
  label: string;
  description: string;
}) {
  return (
    <div className="flex items-center gap-4 py-3.5 first:pt-1">
      <div className="min-w-0 flex-1">
        <p className="text-[14px] font-medium">{label}</p>
        <p className="mt-0.5 text-[12.5px] leading-5 text-muted-foreground">{description}</p>
      </div>
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        aria-label={label}
        onClick={onToggle}
        className={cn(
          'relative h-6 w-11 shrink-0 rounded-full border transition-colors',
          checked ? 'border-transparent bg-primary' : 'border-input bg-surface-2',
        )}
      >
        <span
          aria-hidden="true"
          className={cn(
            'absolute top-0.5 size-5 rounded-full bg-white shadow-sm transition-transform',
            checked ? 'translate-x-5' : 'translate-x-0.5',
          )}
        />
      </button>
    </div>
  );
}

function StepProgress({ current }: { current: number }) {
  return (
    <ol className="flex items-center gap-2.5" aria-label="向导步骤">
      {STEPS.map((step, index) => {
        const number = index + 1;
        const done = number < current;
        const active = number === current;
        return (
          <li key={step.label} className="flex min-w-0 flex-1 items-center gap-2.5 last:flex-none">
            <span className="flex items-center gap-2 text-[13px]">
              <span
                aria-hidden="true"
                className={cn(
                  'grid size-6 shrink-0 place-items-center rounded-full border text-[12px]',
                  active && 'border-transparent bg-primary text-primary-foreground',
                  done && 'border-transparent bg-pro-bg text-pro',
                  !active && !done && 'border-input text-muted-foreground',
                )}
              >
                {done ? <Check className="size-3.5" /> : number}
              </span>
              <span
                className={cn(
                  'hidden sm:inline',
                  active ? 'font-medium text-foreground' : 'text-muted-foreground',
                )}
              >
                {step.label}
              </span>
            </span>
            {index < STEPS.length - 1 && (
              <span className="h-px min-w-4 flex-1 bg-border" aria-hidden="true" />
            )}
          </li>
        );
      })}
    </ol>
  );
}

function TypeCard({
  value,
  current,
  onSelect,
  title,
  description,
  icon: Icon,
}: {
  value: TopicType;
  current: TopicType;
  onSelect: (value: TopicType) => void;
  title: string;
  description: string;
  icon: typeof Compass;
}) {
  const selected = current === value;
  return (
    <button
      type="button"
      aria-pressed={selected}
      onClick={() => onSelect(value)}
      className={cn(
        'rounded-xl border p-4 text-left transition-colors',
        selected
          ? 'border-violet bg-violet-bg'
          : 'border-border bg-card hover:border-input hover:bg-surface-2/50',
      )}
    >
      <span className="flex items-center gap-2 text-[15px] font-medium">
        <Icon className="size-4 text-violet" aria-hidden="true" />
        {title}
      </span>
      <span className="mt-1.5 block text-[12.5px] leading-5 text-muted-foreground">
        {description}
      </span>
    </button>
  );
}

export function NewTopicWizard({ initialType }: { initialType?: TopicType }) {
  const [step, setStep] = useState(1);
  const [type, setType] = useState<TopicType>(initialType === 'claim' ? 'claim' : 'decision');
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [stance, setStance] = useState('');
  const [lean, setLean] = useState<OwnerLean>('neutral');
  const [tags, setTags] = useState<string[]>([]);
  const [showEvidence, setShowEvidence] = useState(false);
  const [evidenceSummary, setEvidenceSummary] = useState('');
  const [stakeEnabled, setStakeEnabled] = useState(true);
  const [revealDate, setRevealDate] = useState(() => defaultRevealDate());
  const [bountyEnabled, setBountyEnabled] = useState(false);
  const [allowPublicRebuttal, setAllowPublicRebuttal] = useState(true);
  const [localError, setLocalError] = useState<string | null>(null);
  /**
   * 只有用户真实点击“发布话题”才允许提交。
   * 浏览器在步骤切换后可能产生一个没有点击事件的 submit（submitter 指向新挂载的发布按钮），
   * 该隐式提交必须在表单层被拦截。
   */
  const publishIntentRef = useRef(false);
  const [publishState, publishAction, isPending] = useActionState(
    publishTopicAction,
    initialPublishState,
  );

  const today = localDateInput(new Date());

  function draft() {
    return {
      type,
      title,
      body,
      stance,
      lean,
      tags,
      evidenceSummary,
      stakeEnabled,
      revealDate: stakeEnabled ? revealDate : '',
      bountyEnabled,
      allowPublicRebuttal,
    };
  }

  function goNext() {
    if (step === 1) {
      setStep(2);
      return;
    }
    const errors = validatePublishDraft(draft());
    if (errors.length > 0) {
      setLocalError(errors[0]);
      return;
    }
    setLocalError(null);
    publishIntentRef.current = false;
    setStep((value) => Math.min(value + 1, 3));
  }

  function goBack() {
    setLocalError(null);
    publishIntentRef.current = false;
    setStep((value) => Math.max(value - 1, 1));
  }

  function toggleTag(tag: string) {
    if (tags.includes(tag)) {
      setTags(tags.filter((item) => item !== tag));
      return;
    }
    if (tags.length >= PUBLISH_LIMITS.maxTags) {
      setLocalError(`最多选择 ${PUBLISH_LIMITS.maxTags} 个标签`);
      return;
    }
    setLocalError(null);
    setTags([...tags, tag]);
  }

  function chooseType(value: TopicType) {
    setType(value);
    setLocalError(null);
  }

  const typeNote =
    type === 'decision'
      ? '常见场景：要不要裸辞、要不要回老家、该不该分手、房子现在买还是再等等。发布后陌生人会围绕你的立场帮你权衡利弊。'
      : '常见场景：AI 编程是否提高效率、某政策是否利大于弊。请把主张写成一句可被检验的话，让反方有机会反驳它。';

  return (
    <>
      <form
        id="topic-wizard"
        action={publishAction}
        onSubmit={(event) => {
          if (step !== 3 || !publishIntentRef.current) event.preventDefault();
        }}
      >
      <input type="hidden" name="type" value={type} />
      <input type="hidden" name="title" value={title} />
      <input type="hidden" name="body" value={body} />
      <input type="hidden" name="stance" value={stance} />
      <input type="hidden" name="lean" value={lean} />
      {tags.map((tag) => (
        <input key={tag} type="hidden" name="tag" value={tag} />
      ))}
      <input type="hidden" name="evidenceSummary" value={evidenceSummary} />
      <input type="hidden" name="stakeEnabled" value={String(stakeEnabled)} />
      <input type="hidden" name="revealDate" value={revealDate} />
      <input type="hidden" name="bountyEnabled" value={String(bountyEnabled)} />
      <input type="hidden" name="allowPublicRebuttal" value={String(allowPublicRebuttal)} />

      <StepProgress current={step} />

      {step === 1 && (
        <section className="mt-6 rounded-xl border border-border bg-card p-5 sm:p-6" aria-label="选择话题类型">
          <div className="grid gap-3 sm:grid-cols-2">
            <TypeCard
              value="decision"
              current={type}
              onSelect={chooseType}
              icon={Compass}
              title="我在做选择"
              description="买房、跳槽、分手、辞职……一个真实纠结，请陌生人帮你权衡利弊、补充盲区。"
            />
            <TypeCard
              value="claim"
              current={type}
              onSelect={chooseType}
              icon={Scale}
              title="我要验证一个观点"
              description="“X 是否成立”——双方摆论据、讲逻辑，让观点接受反驳与检验。"
            />
          </div>
          <p className="mt-4 rounded-lg bg-surface-2 px-3.5 py-2.5 text-[12.5px] leading-5 text-muted-foreground">
            {typeNote}
          </p>
        </section>
      )}

      {step === 2 && (
        <section className="mt-6 rounded-xl border border-border bg-card p-5 sm:p-6" aria-label="主张与论据">
          <div className="space-y-5">
            <div>
              <label htmlFor="topic-title" className={labelClass}>
                标题（一句话说清你在纠结什么 / 想验证什么）
              </label>
              <input
                id="topic-title"
                type="text"
                value={title}
                onChange={(event) => setTitle(event.target.value)}
                maxLength={PUBLISH_LIMITS.title.max}
                placeholder="例：要不要裸辞去大理开民宿？"
                className={inputClass}
              />
            </div>

            <div>
              <label htmlFor="topic-body" className={labelClass}>
                背景与约束
              </label>
              <textarea
                id="topic-body"
                value={body}
                onChange={(event) => setBody(event.target.value)}
                maxLength={PUBLISH_LIMITS.body.max}
                rows={4}
                placeholder="例：30 岁，存款约 40 万，大理有朋友愿意合租改造旧院；担心社保断缴与经营亏损。"
                className={cn(inputClass, 'min-h-24 resize-y leading-6')}
              />
              <span className={descClass}>越具体的约束，越容易得到可执行的建议。</span>
            </div>

            <div>
              <label htmlFor="topic-stance" className={labelClass}>
                我的立场主张（一句话，作为讨论树的根）
              </label>
              <input
                id="topic-stance"
                type="text"
                value={stance}
                onChange={(event) => setStance(event.target.value)}
                maxLength={PUBLISH_LIMITS.stance.max}
                placeholder={
                  type === 'claim'
                    ? '例：在熟悉代码库的前提下，AI 编程能显著提高开发效率'
                    : '例：裸辞去大理开民宿，是实现自由生活的现实路径'
                }
                className={inputClass}
              />
              <span className={descClass}>
                这条立场会被放在理由层，所有人都可以围绕它支持或反驳。
              </span>
            </div>

            <fieldset>
              <legend className={labelClass}>我目前的倾向</legend>
              <div className="mt-2 flex flex-wrap gap-2">
                {OWNER_LEANS.map((option) => (
                  <button
                    key={option}
                    type="button"
                    aria-pressed={lean === option}
                    onClick={() => setLean(option)}
                    className={cn(
                      'rounded-full border px-3.5 py-1.5 text-[12.5px] transition-colors',
                      lean === option
                        ? 'border-transparent bg-violet-bg font-medium text-violet'
                        : 'border-border bg-background text-muted-foreground hover:bg-surface-2',
                    )}
                  >
                    {OWNER_LEAN_LABELS[option]}
                  </button>
                ))}
              </div>
              <span className={descClass}>发布时记录在你的创建事件里，结论书会引用它作为初始倾向。</span>
            </fieldset>

            <div>
              <span className={labelClass}>标签（最多 {PUBLISH_LIMITS.maxTags} 个）</span>
              <div className="mt-2 flex flex-wrap gap-2" role="group" aria-label="标签">
                {SUGGESTED_TAGS.map((tag) => {
                  const selected = tags.includes(tag);
                  return (
                    <button
                      key={tag}
                      type="button"
                      aria-pressed={selected}
                      onClick={() => toggleTag(tag)}
                      className={cn(
                        'rounded-full border px-3 py-1 text-[12.5px] transition-colors',
                        selected
                          ? 'border-transparent bg-violet-bg font-medium text-violet'
                          : 'border-border bg-background text-muted-foreground hover:bg-surface-2',
                      )}
                    >
                      {tag}
                    </button>
                  );
                })}
              </div>
            </div>

            {!showEvidence ? (
              <button
                type="button"
                onClick={() => setShowEvidence(true)}
                className="inline-flex items-center gap-1.5 text-[13px] font-medium text-primary hover:underline"
              >
                <Plus className="size-4" aria-hidden="true" />
                添加第一条论据（可选）
              </button>
            ) : (
              <div>
                <label htmlFor="first-evidence" className={labelClass}>
                  你最希望被检验的一条依据或担忧
                </label>
                <textarea
                  id="first-evidence"
                  value={evidenceSummary}
                  onChange={(event) => setEvidenceSummary(event.target.value)}
                  maxLength={PUBLISH_LIMITS.evidence.max}
                  rows={3}
                  placeholder="例：朋友的大理旧院已经营两年，转让价 20 万，我可以先入股试水半年"
                  className={cn(inputClass, 'min-h-20 resize-y leading-6')}
                />
                <button
                  type="button"
                  onClick={() => {
                    setEvidenceSummary('');
                    setShowEvidence(false);
                  }}
                  className="mt-2 text-[12.5px] text-muted-foreground underline-offset-2 hover:text-foreground hover:underline"
                >
                  移除首条论据
                </button>
              </div>
            )}
          </div>
        </section>
      )}

      {step === 3 && (
        <section className="mt-6 rounded-xl border border-border bg-card p-5 sm:p-6" aria-label="规则与发布">
          <div className="divide-y divide-dashed divide-border">
            <Switch
              checked={stakeEnabled}
              onToggle={() => setStakeEnabled((value) => !value)}
              label="立帖为证"
              description="围观者可押注你的决定/观点走向，到期由现实自动揭晓。"
            />
            {stakeEnabled && (
              <div className="flex flex-wrap items-center justify-between gap-3 py-3.5">
                <div>
                  <p className="text-[14px] font-medium">揭晓日期</p>
                  <p className="mt-0.5 text-[12.5px] text-muted-foreground">
                    建议 1–3 个月，让结果有足够时间发生。
                  </p>
                </div>
                <input
                  type="date"
                  value={revealDate}
                  min={today}
                  onChange={(event) => setRevealDate(event.target.value)}
                  className="rounded-lg border border-input bg-background px-3 py-1.5 text-sm outline-none focus-visible:ring-3 focus-visible:ring-ring/40"
                  aria-label="揭晓日期"
                />
              </div>
            )}
            <Switch
              checked={bountyEnabled}
              onToggle={() => setBountyEnabled((value) => !value)}
              label="悬赏最佳反驳"
              description="用逻辑币奖励“真正改变你想法”的那条论据（一期先记录开关）。"
            />
            <Switch
              checked={allowPublicRebuttal}
              onToggle={() => setAllowPublicRebuttal((value) => !value)}
              label="允许陌生人反驳与补充盲区"
              description="关闭后只有你邀请的人可以参与（默认开启，一期先落开关与数据）。"
            />
            <div className="flex flex-wrap items-center justify-between gap-3 py-3.5">
              <div>
                <p className="text-[14px] font-medium">
                  结束方式：{type === 'decision' ? '由你采纳并出结论书' : '社区收敛后由陪审确认'}
                </p>
                <p className="mt-0.5 text-[12.5px] leading-5 text-muted-foreground">
                  {type === 'decision'
                    ? '带未决风险关闭时需逐条公开声明，留待现实审计。'
                    : '收敛公示后由陪审批量采纳有效分支（陪审完整机制在二期开放）。'}
                </p>
              </div>
              <span className="rounded-full bg-violet-bg px-2.5 py-1 text-[11.5px] font-medium text-violet">
                {TOPIC_TYPE_LABELS[type]} · 公开围观
              </span>
            </div>
          </div>

          <div className="mt-5 rounded-xl bg-surface-2 px-4 py-3.5" aria-label="发布预览">
            <div className="grid gap-1.5 text-[13px] sm:grid-cols-[92px_1fr]">
              <span className="text-muted-foreground">类型</span>
              <span>
                {TOPIC_TYPE_LABELS[type]} · 公开围观
              </span>
              <span className="text-muted-foreground">标题</span>
              <span className="font-medium">{title || '（未填写标题）'}</span>
              <span className="text-muted-foreground">倾向</span>
              <span>{OWNER_LEAN_LABELS[lean]}</span>
              <span className="text-muted-foreground">根立场</span>
              <span>{stance || '（未填写立场主张）'}</span>
              {tags.length > 0 && (
                <>
                  <span className="text-muted-foreground">标签</span>
                  <span>{tags.join(' · ')}</span>
                </>
              )}
              {evidenceSummary.trim() && (
                <>
                  <span className="text-muted-foreground">首条论据</span>
                  <span>{evidenceSummary}</span>
                </>
              )}
              <span className="text-muted-foreground">规则</span>
              <span>
                {stakeEnabled ? `立帖为证 · ${revealDate} 揭晓` : '无立帖为证'}
                {bountyEnabled ? ' · 悬赏最佳反驳' : ''}
                {allowPublicRebuttal ? '' : ' · 仅受邀可反驳'}
              </span>
            </div>
          </div>

          <p className="mt-4 text-[12.5px] leading-5 text-muted-foreground">
            发布后即公开，发帖人与楼主不可自行删除，只可修订留痕；发布动作会再次校验《理性讨论须知》。
          </p>
          {publishState.error && (
            <p role="alert" className="mt-3 rounded-lg bg-con-bg px-3 py-2 text-[13px] text-con">
              {publishState.error}
            </p>
          )}
        </section>
      )}

      {(localError || publishState.error) && (
        <p role="alert" className="mt-4 rounded-lg bg-amber-bg px-3 py-2 text-[13px] text-amber">
          {localError ?? publishState.error}
        </p>
      )}
      </form>

      <div className="mt-6 flex items-center gap-3">
        {step > 1 && (
          <Button type="button" variant="outline" onClick={goBack}>
            <ArrowLeft aria-hidden="true" />
            上一步
          </Button>
        )}
        <span className="flex-1" />
        {step < 3 ? (
          <Button type="button" onClick={goNext}>
            下一步
            <ArrowRight data-icon="inline-end" aria-hidden="true" />
          </Button>
        ) : (
          <Button
            type="submit"
            form="topic-wizard"
            disabled={isPending}
            onClick={() => {
              publishIntentRef.current = true;
            }}
          >
            {isPending ? '发布中…' : '发布话题'}
            {!isPending && <FileText data-icon="inline-end" aria-hidden="true" />}
          </Button>
        )}
      </div>
    </>
  );
}
