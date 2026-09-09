import type { ChipTone } from '@/lib/domain/predictions';
import { cn } from '@/lib/utils';

/** 战绩/押注状态 chip 的语义色映射（与全局 design token 一致）。 */
export function chipToneClass(tone: ChipTone | string): string {
  switch (tone) {
    case 'pro':
      return 'bg-pro-bg text-pro';
    case 'con':
      return 'bg-con-bg text-con';
    case 'violet':
      return 'bg-violet-bg text-violet';
    case 'amber':
      return 'bg-amber-bg text-amber';
    default:
      return 'bg-surface-2 text-muted-foreground';
  }
}

export function StatusChip({
  label,
  tone,
  className,
}: {
  label: string;
  tone: ChipTone | string;
  className?: string;
}) {
  return (
    <span
      className={cn(
        'inline-flex shrink-0 items-center gap-1 rounded-full px-2.5 py-1 text-xs font-medium',
        chipToneClass(tone),
        className,
      )}
    >
      {label}
    </span>
  );
}
