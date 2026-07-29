import { Button, Dialog, Field, Input, LayerCard, Loader, Switch } from "@cloudflare/kumo";
import { CopyIcon, KeyIcon, PlusIcon, TrashIcon } from "@phosphor-icons/react/dist/ssr";
import { useCallback, useEffect, useState } from "react";
import { Api, ApiError, type ApiKeyCreated, type ApiKeyListItem } from "../lib/api";
import { toast } from "../lib/toast";
import { copyText, fmtDate, cx } from "../lib/utils";
import { ApiExamples } from "../components/ApiExamples";

const ALL_SCOPES = [
  { key: "read", desc: "读取邮件（列表 / 详情 / 验证码）" },
  { key: "create", desc: "创建临时邮箱" },
  { key: "manage", desc: "管理邮箱（删除 / 置顶 / 转发 / 改密等）" },
] as const;

export function ApiKeysPage() {
  const [keys, setKeys] = useState<ApiKeyListItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [createOpen, setCreateOpen] = useState(false);
  const [created, setCreated] = useState<ApiKeyCreated | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setKeys(await Api.listApiKeys());
    } catch (e) {
      toast.error("加载失败", e instanceof ApiError ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  async function revoke(id: number, name: string) {
    if (!confirm(`吊销并删除 Key「${name}」？此操作不可撤销。`)) return;
    try {
      await Api.deleteApiKey(id);
      toast.success("已吊销");
      await load();
    } catch (e) {
      toast.error("吊销失败", e instanceof ApiError ? e.message : String(e));
    }
  }

  async function copyCreated() {
    if (!created?.key) return;
    const ok = await copyText(created.key);
    ok ? toast.success("API Key 已复制") : toast.error("复制失败");
  }

  return (
    <div className="flex flex-col gap-4">
      <LayerCard className="flex flex-col gap-3 p-5">
        <div className="flex items-center gap-2">
          <KeyIcon className="h-5 w-5 text-kumo-brand" />
          <h1 className="text-base font-semibold text-kumo-strong">API 管理</h1>
          <Button className="ml-auto" size="sm" variant="primary" icon={<PlusIcon className="h-4 w-4" />} onClick={() => setCreateOpen(true)}>
            新建 Key
          </Button>
        </div>
        <p className="text-sm text-kumo-subtle">
          签发 API Key 供 agent 或外部工具调用本系统的收信 / 邮箱管理接口。请求时以
          <code className="fm-monospace mx-1 rounded bg-kumo-tint px-1.5 py-0.5 text-xs">Authorization: Bearer fm_xxx</code>
          鉴权，按所选 scope 限制可访问的操作。
        </p>
      </LayerCard>

      <LayerCard className="flex flex-col p-0">
        <div className="overflow-auto">
          {loading ? (
            <div className="flex items-center gap-2 p-8 text-kumo-subtle"><Loader /> 加载中…</div>
          ) : keys.length === 0 ? (
            <div className="p-10 text-center text-sm text-kumo-subtle">尚未创建任何 API Key</div>
          ) : (
            <table className="fm-card-table w-full text-sm">
              <thead className="text-kumo-subtle">
                <tr className="border-b border-kumo-line text-left">
                  <th className="px-3 py-2">名称</th>
                  <th className="px-3 py-2">前缀</th>
                  <th className="px-3 py-2">权限</th>
                  <th className="px-3 py-2">创建时间</th>
                  <th className="px-3 py-2">最近使用</th>
                  <th className="px-3 py-2 text-right">操作</th>
                </tr>
              </thead>
              <tbody>
                {keys.map((k) => (
                  <tr key={k.id} className="border-b border-kumo-line/60 hover:bg-kumo-tint/40">
                    <td data-label="名称" className="px-3 py-2 font-medium text-kumo-default">{k.name}</td>
                    <td data-label="前缀" className="fm-monospace px-3 py-2 text-kumo-subtle">{k.prefix}…</td>
                    <td data-label="权限" className="px-3 py-2">
                      <div className="flex flex-wrap gap-1">
                        {(k.scopes || "").split(",").filter(Boolean).map((s) => (
                          <span key={s} className="rounded bg-kumo-tint px-1.5 py-0.5 text-xs text-kumo-brand">{s}</span>
                        ))}
                      </div>
                    </td>
                    <td data-label="创建时间" className="px-3 py-2 text-kumo-subtle">{fmtDate(k.created_at).slice(0, 16)}</td>
                    <td data-label="最近使用" className="px-3 py-2 text-kumo-subtle">{k.last_used_at ? fmtDate(k.last_used_at).slice(5, 16) : "—"}</td>
                    <td data-label="操作" className="fm-actions px-3 py-2">
                      <Button size="sm" variant="secondary-destructive" shape="square" aria-label="吊销" title="吊销并删除" onClick={() => revoke(k.id, k.name)}>
                        <TrashIcon className="h-3.5 w-3.5" />
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </LayerCard>

      <ApiExamples />

      <CreateKeyDialog
        open={createOpen}
        onOpenChange={(v) => {
          if (v) setCreated(null);
          setCreateOpen(v);
        }}
        onCreated={(k) => {
          setCreated(k);
          load();
        }}
      />

      {/* 创建成功后展示明文 Key（仅一次） */}
      <Dialog.Root open={!!created} onOpenChange={(v) => { if (!v) setCreated(null); }}>
        <Dialog className="p-6">
          <Dialog.Title className="mb-2 text-lg font-semibold text-kumo-strong">API Key 已创建</Dialog.Title>
          <Dialog.Description className="mb-4 text-sm text-kumo-danger">
            请立即复制并妥善保存，该 Key 的明文仅显示这一次。
          </Dialog.Description>
          {created ? (
            <div className="flex items-center gap-2">
              <code className="fm-monospace flex-1 break-all rounded-lg border border-kumo-line bg-kumo-recessed/40 p-3 text-xs text-kumo-strong">
                {created.key}
              </code>
              <Button shape="square" variant="secondary" aria-label="复制" title="复制" onClick={copyCreated}>
                <CopyIcon className="h-4 w-4" />
              </Button>
            </div>
          ) : null}
          <div className="mt-5 flex justify-end">
            <Button variant="primary" onClick={() => setCreated(null)}>我已保存</Button>
          </div>
        </Dialog>
      </Dialog.Root>
    </div>
  );
}

function CreateKeyDialog({
  open,
  onOpenChange,
  onCreated,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  onCreated: (k: ApiKeyCreated) => void;
}) {
  const [name, setName] = useState("");
  const [scopes, setScopes] = useState<Set<string>>(new Set(["read"]));
  const [days, setDays] = useState(0);
  const [loading, setLoading] = useState(false);

  function toggleScope(s: string) {
    setScopes((prev) => {
      const next = new Set(prev);
      if (next.has(s)) next.delete(s); else next.add(s);
      return next;
    });
  }

  async function submit() {
    if (!name.trim()) return toast.warning("请填写名称");
    if (scopes.size === 0) return toast.warning("至少选择一项权限");
    setLoading(true);
    let expires_at: string | null = null;
    if (days > 0) {
      expires_at = new Date(Date.now() + days * 86400_000).toISOString();
    }
    try {
      const k = await Api.createApiKey({ name: name.trim(), scopes: [...scopes], expires_at });
      toast.success("已创建");
      onCreated(k);
      onOpenChange(false);
      setName("");
      setScopes(new Set(["read"]));
      setDays(0);
    } catch (e) {
      toast.error("创建失败", e instanceof ApiError ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }

  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog className="p-6">
        <Dialog.Title className="mb-4 text-lg font-semibold text-kumo-strong">新建 API Key</Dialog.Title>
        <div className="flex flex-col gap-3">
          <Field label="名称">
            <Input value={name} onChange={(e) => setName((e.target as HTMLInputElement).value)} placeholder="例如：验证码机器人" />
          </Field>
          <div className="flex flex-col gap-2">
            <span className="text-sm font-medium text-kumo-default">权限范围</span>
            {ALL_SCOPES.map((s) => (
              <label key={s.key} className="flex items-start gap-2 text-sm text-kumo-default">
                <span className="mt-0.5">
                  <Switch checked={scopes.has(s.key)} onCheckedChange={() => toggleScope(s.key)} />
                </span>
                <span>
                  <span className="font-mono text-kumo-brand">{s.key}</span>
                  <span className="ml-2 text-kumo-subtle">{s.desc}</span>
                </span>
              </label>
            ))}
          </div>
          <Field label="有效期（天，0 表示永久）">
            <Input type="number" min={0} value={days} onChange={(e) => setDays(Math.max(0, Number((e.target as HTMLInputElement).value) || 0))} />
          </Field>
        </div>
        <div className="mt-5 flex justify-end gap-2">
          <Dialog.Close render={(p) => <Button variant="ghost" {...p}>取消</Button>} />
          <Button variant="primary" loading={loading} onClick={submit}>创建</Button>
        </div>
      </Dialog>
    </Dialog.Root>
  );
}
