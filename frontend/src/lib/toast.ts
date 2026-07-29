import { createKumoToastManager } from "@cloudflare/kumo";

/**
 * 模块级 Toast 管理器：在 React 树外（如 ApiError 处理、定时器回调）
 * 也可以直接调用 `toast.success(...)`。
 */
export const toastManager = createKumoToastManager();

export const toast = {
  success: (title: string, description?: string) =>
    toastManager.add({ title, description, variant: "success", timeout: 3500 }),
  error: (title: string, description?: string) =>
    toastManager.add({ title, description, variant: "error", timeout: 5000 }),
  info: (title: string, description?: string) =>
    toastManager.add({ title, description, variant: "info", timeout: 3500 }),
  warning: (title: string, description?: string) =>
    toastManager.add({ title, description, variant: "warning", timeout: 4500 }),
};

export const toastPromise = toastManager.promise.bind(toastManager);
