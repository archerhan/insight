import Link from "next/link";
import { ArrowRight, BookOpen, Compass } from "lucide-react";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export default function Home() {
  return (
    <main className="mx-auto flex min-h-[calc(100dvh-3.5rem)] w-full max-w-[1120px] flex-col items-center justify-center gap-4 px-6 py-16 text-center">
      <p className="text-sm font-medium text-primary">灼见 · 让讨论沉淀结论</p>
      <h1 className="max-w-2xl text-balance text-3xl font-medium tracking-tight sm:text-4xl">
        让观点接受检验，让讨论沉淀结论，让“被说服”被记录。
      </h1>
      <p className="max-w-xl text-pretty text-[15px] leading-7 text-muted-foreground">
        这里是“广场”——正在对线的话题、最新结论书与即将揭晓的立帖为证都会出现在这里。
        M1 已上线登录与《理性讨论须知》，广场与对线视图将在 M2–M3 陆续开放。
      </p>
      <div className="mt-3 flex flex-wrap items-center justify-center gap-3">
        <Link href="/topics/new" className={cn(buttonVariants({ variant: "default" }), "h-9 px-4")}>
          <Compass aria-hidden="true" />
          发起话题
          <ArrowRight aria-hidden="true" data-icon="inline-end" />
        </Link>
        <Link
          href="/guide"
          className={cn(buttonVariants({ variant: "outline" }), "h-9 px-4")}
        >
          <BookOpen aria-hidden="true" />
          先读《理性讨论须知》
        </Link>
      </div>
    </main>
  );
}
