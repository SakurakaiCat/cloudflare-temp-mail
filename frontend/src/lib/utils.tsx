import type { ReactNode } from "react";

/** 格式化日期为本地简短形式 */
export function fmtDate(input?: string | null): string {
  if (!input) return "";
  const d = new Date(input);
  if (Number.isNaN(d.getTime())) return String(input);
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function pad(n: number) {
  return String(n).padStart(2, "0");
}

/** 复制到剪贴板，返回是否成功 */
export async function copyText(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch (_) {
    try {
      const ta = document.createElement("textarea");
      ta.value = text;
      ta.style.position = "fixed";
      ta.style.opacity = "0";
      document.body.appendChild(ta);
      ta.select();
      const ok = document.execCommand("copy");
      document.body.removeChild(ta);
      return ok;
    } catch (_) {
      return false;
    }
  }
}

/** 拼接 className */
export function cx(...parts: Array<string | false | null | undefined>): string {
  return parts.filter(Boolean).join(" ");
}

/** 把 HTML/RFC822 文本中的轻量样式隔离渲染 */
export function safeHtmlFrame(html: string): { __html: string } {
  // 移除 script/iframe/on*，并强制链接在新标签打开
  const cleaned = (html || "")
    .replace(/<script[\s\S]*?<\/script>/gi, "")
    .replace(/<iframe[\s\S]*?<\/iframe>/gi, "")
    .replace(/<object[\s\S]*?<\/object>/gi, "")
    .replace(/<embed[\s\S]*?(?:\/>|>(?:[\s\S]*?)<\/embed>)/gi, "")
    .replace(/\son[a-z]+="[^"]*"/gi, "")
    .replace(/\son[a-z]+='[^']*'/gi, "")
    .replace(/(<a\s)/gi, '$1target="_blank" rel="noopener noreferrer" ');
  return { __html: cleaned };
}

/** 渲染未读圆点 */
export function unreadDot(isRead?: number | boolean): ReactNode {
  if (!isRead || isRead === 0) {
    return <span className="inline-block size-2 rounded-full bg-kumo-brand" aria-hidden />;
  }
  return null;
}

/** 转义正则 */
export function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
