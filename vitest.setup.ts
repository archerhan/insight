import { cleanup } from '@testing-library/react';
import { afterEach } from 'vitest';

/**
 * 没有开启 vitest globals 时，React Testing Library 无法自动注册 cleanup，
 * 组件不会被卸载；React 调度器残留的待执行任务会活到 jsdom 环境销毁之后，
 * 在 CI 上报 "ReferenceError: window is not defined"（测试全绿但进程退出码非零）。
 */
afterEach(() => {
  cleanup();
});
