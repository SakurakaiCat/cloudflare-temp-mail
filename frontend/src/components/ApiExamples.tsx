import { Button, LayerCard, Select, Tabs } from "@cloudflare/kumo";
import { CheckIcon, CopyIcon, TerminalWindowIcon } from "@phosphor-icons/react/dist/ssr";
import { useMemo, useState } from "react";
import { toast } from "../lib/toast";
import { copyText, cx } from "../lib/utils";

type Lang = "curl" | "js" | "python";
type Scope = "read" | "create" | "manage";

type Example = {
  id: string;
  title: string;
  desc: string;
  scope: Scope;
  method: "GET" | "POST" | "DELETE";
  path: string;
  curl: string;
  js: string;
  python: string;
};

const BASE = "https://your.domain";
const TOKEN = "fm_xxxxx";

const EXAMPLES: Example[] = [
  {
    id: "generate",
    title: "生成临时邮箱",
    desc: "随机生成一个临时邮箱地址，返回内含 mailbox 信息。需 create 权限。",
    scope: "create",
    method: "POST",
    path: `/api/generate?length=6`,
    curl: `curl -X POST -H "Authorization: Bearer ${TOKEN}" \\
  "${BASE}/api/generate?length=6"`,
    js: `const r = await fetch("${BASE}/api/generate?length=6", {
  method: "POST",
  headers: { Authorization: "Bearer ${TOKEN}" },
});
const data = await r.json();
console.log(data.email, data.mailbox);`,
    python: `import requests
r = requests.post(
  "${BASE}/api/generate",
  params={"length": 6},
  headers={"Authorization": "Bearer ${TOKEN}"},
)
print(r.json()["email"])`,
  },
  {
    id: "create",
    title: "创建自定义邮箱",
    desc: "指定本地名创建邮箱，domainIndex 选择域名。需 create 权限。",
    scope: "create",
    method: "POST",
    path: `/api/create`,
    curl: `curl -X POST -H "Authorization: Bearer ${TOKEN}" \\
  -H "Content-Type: application/json" \\
  -d '{"local":"myname","domainIndex":0}' \\
  "${BASE}/api/create"`,
    js: `const r = await fetch("${BASE}/api/create", {
  method: "POST",
  headers: {
    "Authorization": "Bearer ${TOKEN}",
    "Content-Type": "application/json",
  },
  body: JSON.stringify({ local: "myname", domainIndex: 0 }),
});
const data = await r.json();
console.log(data.email);`,
    python: `import requests
r = requests.post(
  "${BASE}/api/create",
  json={"local": "myname", "domainIndex": 0},
  headers={"Authorization": "Bearer ${TOKEN}"},
)
print(r.json()["email"])`,
  },
  {
    id: "list-emails",
    title: "列出邮件",
    desc: "获取某邮箱最近的邮件，含主题、发件人、预览与验证码。需 read 权限。",
    scope: "read",
    method: "GET",
    path: `/api/emails?mailbox=test@example.com&limit=20`,
    curl: `curl -H "Authorization: Bearer ${TOKEN}" \\
  "${BASE}/api/emails?mailbox=test@example.com&limit=20"`,
    js: `const mailbox = "test@example.com";
const r = await fetch(
  "${BASE}/api/emails?mailbox=" + encodeURIComponent(mailbox) + "&limit=20",
  { headers: { Authorization: "Bearer ${TOKEN}" } },
);
const emails = await r.json();
console.log(emails.length, "封邮件");`,
    python: `import requests
r = requests.get(
  "${BASE}/api/emails",
  params={"mailbox": "test@example.com", "limit": 20},
  headers={"Authorization": "Bearer ${TOKEN}"},
)
emails = r.json()
print(len(emails), "封邮件")`,
  },
  {
    id: "verification-code",
    title: "一键提取验证码",
    desc: "从最新邮件里取 verification_code 字段（自动解析出验证码）。需 read 权限。",
    scope: "read",
    method: "GET",
    path: `/api/emails?mailbox=test@example.com&limit=20`,
    curl: `# 取第一条带验证码的邮件，用 jq 提取
curl -s -H "Authorization: Bearer ${TOKEN}" \\
  "${BASE}/api/emails?mailbox=test@example.com&limit=20" \\
  | jq -r '[.[] | select(.verification_code) | .verification_code] | .[0]'`,
    js: `const mailbox = "test@example.com";
const r = await fetch(
  "${BASE}/api/emails?mailbox=" + encodeURIComponent(mailbox) + "&limit=20",
  { headers: { Authorization: "Bearer ${TOKEN}" } },
);
const emails = await r.json();
const code = emails.find((e) => e.verification_code)?.verification_code;
console.log("验证码：", code);`,
    python: `import requests
r = requests.get(
  "${BASE}/api/emails",
  params={"mailbox": "test@example.com", "limit": 20},
  headers={"Authorization": "Bearer ${TOKEN}"},
)
emails = r.json()
code = next((e["verification_code"] for e in emails if e.get("verification_code")), None)
print("验证码：", code)`,
  },
  {
    id: "email-detail",
    title: "获取邮件详情",
    desc: "按 ID 查看单封邮件，含纯文本 / HTML 正文、附件下载地址。需 read 权限。",
    scope: "read",
    method: "GET",
    path: `/api/email/123`,
    curl: `curl -H "Authorization: Bearer ${TOKEN}" \\
  "${BASE}/api/email/123"`,
    js: `const r = await fetch("${BASE}/api/email/123", {
  headers: { Authorization: "Bearer ${TOKEN}" },
});
const detail = await r.json();
console.log(detail.subject, detail.verification_code);`,
    python: `import requests
r = requests.get(
  "${BASE}/api/email/123",
  headers={"Authorization": "Bearer ${TOKEN}"},
)
d = r.json()
print(d["subject"], d.get("verification_code"))`,
  },
  {
    id: "delete-email",
    title: "删除单封邮件",
    desc: "按 ID 删除一封邮件（同时清理 R2 原始 EML）。需 manage 权限。",
    scope: "manage",
    method: "DELETE",
    path: `/api/email/123`,
    curl: `curl -X DELETE -H "Authorization: Bearer ${TOKEN}" \\
  "${BASE}/api/email/123"`,
    js: `await fetch("${BASE}/api/email/123", {
  method: "DELETE",
  headers: { Authorization: "Bearer ${TOKEN}" },
});`,
    python: `import requests
r = requests.delete(
  "${BASE}/api/email/123",
  headers={"Authorization": "Bearer ${TOKEN}"},
)
print(r.json())`,
  },
  {
    id: "clear-emails",
    title: "清空邮箱所有邮件",
    desc: "清空指定邮箱下的全部邮件。需 manage 权限。",
    scope: "manage",
    method: "DELETE",
    path: `/api/emails?mailbox=test@example.com`,
    curl: `curl -X DELETE -H "Authorization: Bearer ${TOKEN}" \\
  "${BASE}/api/emails?mailbox=test@example.com"`,
    js: `const mailbox = "test@example.com";
await fetch(
  "${BASE}/api/emails?mailbox=" + encodeURIComponent(mailbox),
  {
    method: "DELETE",
    headers: { Authorization: "Bearer ${TOKEN}" },
  },
);`,
    python: `import requests
r = requests.delete(
  "${BASE}/api/emails",
  params={"mailbox": "test@example.com"},
  headers={"Authorization": "Bearer ${TOKEN}"},
)
print(r.json())`,
  },
  {
    id: "pin-mailbox",
    title: "置顶 / 收藏邮箱",
    desc: "切换邮箱置顶状态（重复调用即取消置顶）。需 manage 权限。",
    scope: "manage",
    method: "POST",
    path: `/api/mailboxes/pin?address=test@example.com`,
    curl: `curl -X POST -H "Authorization: Bearer ${TOKEN}" \\
  "${BASE}/api/mailboxes/pin?address=test@example.com"`,
    js: `const mailbox = "test@example.com";
await fetch(
  "${BASE}/api/mailboxes/pin?address=" + encodeURIComponent(mailbox),
  { method: "POST", headers: { Authorization: "Bearer ${TOKEN}" } },
);`,
    python: `import requests
r = requests.post(
  "${BASE}/api/mailboxes/pin",
  params={"address": "test@example.com"},
  headers={"Authorization": "Bearer ${TOKEN}"},
)
print(r.json())`,
  },
];

const LANG_TABS = [
  { value: "curl", label: "cURL" },
  { value: "js", label: "JavaScript" },
  { value: "python", label: "Python" },
];

const METHOD_BADGE: Record<Example["method"], string> = {
  GET: "bg-kumo-success-tint text-kumo-success",
  POST: "bg-kumo-tint text-kumo-brand",
  DELETE: "bg-kumo-danger-tint text-kumo-danger",
};

const SCOPE_BADGE: Record<Scope, string> = {
  read: "text-kumo-info",
  create: "text-kumo-brand",
  manage: "text-kumo-warning",
};

export function ApiExamples() {
  const [activeId, setActiveId] = useState<string>(EXAMPLES[0].id);
  const [lang, setLang] = useState<Lang>("curl");
  const [copied, setCopied] = useState(false);

  const active = useMemo(
    () => EXAMPLES.find((e) => e.id === activeId) ?? EXAMPLES[0],
    [activeId],
  );
  const code = active[lang];

  async function copy() {
    const ok = await copyText(code);
    if (ok) {
      setCopied(true);
      toast.success("已复制到剪贴板");
      window.setTimeout(() => setCopied(false), 1500);
    } else {
      toast.error("复制失败");
    }
  }

  return (
    <LayerCard className="flex flex-col gap-4 p-5">
      <div className="flex items-center gap-2">
        <TerminalWindowIcon className="h-5 w-5 text-kumo-brand" />
        <h2 className="text-base font-semibold text-kumo-strong">调用示例</h2>
      </div>
      <p className="text-sm text-kumo-subtle">
        以下示例使用 <code className="fm-monospace rounded bg-kumo-tint px-1.5 py-0.5 text-xs text-kumo-brand">Authorization: Bearer {TOKEN}</code> 鉴权，
        将 <code className="fm-monospace text-xs">{BASE}</code> 与 <code className="fm-monospace text-xs">{TOKEN}</code> 替换为你的部署域名与 API Key。完整接口见文档。
      </p>

      {/* 移动端：下拉选择示例 */}
      <div className="sm:hidden">
        <Select
          aria-label="选择示例"
          value={activeId}
          items={EXAMPLES.map((e) => ({ value: e.id, label: `${e.title} · ${e.method}` }))}
          onValueChange={(v) => setActiveId(String(v))}
        />
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        {/* 桌面端：示例列表 */}
        <div className="hidden flex-col gap-1 sm:flex">
          {EXAMPLES.map((e) => (
            <button
              key={e.id}
              type="button"
              onClick={() => setActiveId(e.id)}
              className={cx(
                "flex items-center gap-2 rounded-lg border px-3 py-2 text-left text-sm transition-colors",
                e.id === activeId
                  ? "border-kumo-line bg-kumo-tint text-kumo-strong"
                  : "border-transparent text-kumo-default hover:bg-kumo-tint/50",
              )}
            >
              <span className={cx("fm-method-badge shrink-0", METHOD_BADGE[e.method])}>{e.method}</span>
              <span className="min-w-0 flex-1 truncate">{e.title}</span>
              <span className={cx("fm-monospace text-xs", SCOPE_BADGE[e.scope])}>{e.scope}</span>
            </button>
          ))}
        </div>

        {/* 代码区 */}
        <div className="flex min-w-0 flex-col gap-2">
          <div className="flex flex-wrap items-center gap-2">
            <span className={cx("fm-method-badge", METHOD_BADGE[active.method])}>{active.method}</span>
            <code className="fm-monospace min-w-0 flex-1 truncate text-xs text-kumo-strong">{active.path}</code>
            <span className={cx("fm-monospace text-xs", SCOPE_BADGE[active.scope])}>需 {active.scope}</span>
          </div>
          <p className="text-xs text-kumo-subtle">{active.desc}</p>

          <Tabs value={lang} onValueChange={(v) => setLang(v as Lang)} tabs={LANG_TABS} />

          <div className="relative">
            <Button
              variant="secondary"
              size="sm"
              shape="square"
              aria-label="复制代码"
              title="复制"
              className="absolute right-2 top-2"
              onClick={copy}
            >
              {copied ? <CheckIcon className="h-4 w-4 text-kumo-success" weight="bold" /> : <CopyIcon className="h-4 w-4" />}
            </Button>
            <div className="overflow-auto rounded-lg border border-kumo-line bg-kumo-recessed/40 p-3">
              <pre className="fm-monospace whitespace-pre-wrap break-words text-xs text-kumo-default">{code}</pre>
            </div>
          </div>
        </div>
      </div>
    </LayerCard>
  );
}
