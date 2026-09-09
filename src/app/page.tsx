import { Button } from "@/components/ui/button";

export default function Home() {
  return (
    <main className="flex min-h-[70vh] flex-col items-center justify-center gap-3 px-6 text-center">
      <h1 className="text-3xl font-semibold tracking-tight">灼见</h1>
      <p className="max-w-md text-zinc-600 dark:text-zinc-400">
        让观点接受检验，让讨论沉淀结论。
      </p>
      <Button variant="outline" disabled className="mt-2">
        认证与全局壳 · 下一里程碑
      </Button>
    </main>
  );
}
