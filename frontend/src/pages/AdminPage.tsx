import { Button, Dialog, Field, Input, LayerCard, Loader, Select, Switch } from "@cloudflare/kumo";
import { ArrowsClockwiseIcon, PencilIcon, PlusIcon, TrashIcon } from "@phosphor-icons/react/dist/ssr";
import { useCallback, useEffect, useState } from "react";
import { Api, ApiError, type Mailbox, type UserRow } from "../lib/api";
import { toast } from "../lib/toast";
import { fmtDate } from "../lib/utils";

export function AdminPage() {
  const [list, setList] = useState<UserRow[]>([]);
  const [stats, setStats] = useState({ total: 0, total_mailboxes: 0, admin_count: 0, active_count: 0 });
  const [loading, setLoading] = useState(false);
  const [createOpen, setCreateOpen] = useState(false);
  const [editUser, setEditUser] = useState<UserRow | null>(null);
  const [assignUser, setAssignUser] = useState<UserRow | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const r = await Api.listUsers(1, 100);
      setList(r.list || []);
      setStats({ total: r.total, total_mailboxes: r.total_mailboxes, admin_count: r.admin_count, active_count: r.active_count });
    } catch (e) {
      toast.error("加载失败", e instanceof ApiError ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  async function remove(u: UserRow) {
    if (!confirm(`删除用户 ${u.username}？其名下邮箱会解除绑定。`)) return;
    try {
      await Api.deleteUser(u.id);
      toast.success("已删除");
      await load();
    } catch (e) {
      toast.error("删除失败", e instanceof ApiError ? e.message : String(e));
    }
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <StatCard label="用户总数" value={stats.total} />
        <StatCard label="管理员" value={stats.admin_count} />
        <StatCard label="可发件用户" value={stats.active_count} />
        <StatCard label="邮箱总数" value={stats.total_mailboxes} />
      </div>

      <LayerCard className="flex flex-col gap-3 p-4">
        <div className="flex items-center gap-2">
          <h1 className="text-base font-semibold text-kumo-strong">用户管理</h1>
          <Button size="sm" variant="ghost" shape="square" aria-label="刷新" onClick={load} loading={loading}>
            {!loading ? <ArrowsClockwiseIcon className="h-4 w-4" /> : null}
          </Button>
          <Button className="ml-auto" size="sm" variant="primary" icon={<PlusIcon className="h-4 w-4" />} onClick={() => setCreateOpen(true)}>
            新建用户
          </Button>
        </div>
        <div className="overflow-auto">
          {loading ? (
            <div className="flex items-center gap-2 p-8 text-kumo-subtle"><Loader /> 加载中…</div>
          ) : (
            <table className="fm-card-table w-full text-sm">
              <thead className="text-kumo-subtle">
                <tr className="border-b border-kumo-line text-left">
                  <th className="px-3 py-2">用户名</th>
                  <th className="px-3 py-2">角色</th>
                  <th className="px-3 py-2">邮箱上限</th>
                  <th className="px-3 py-2">已绑定</th>
                  <th className="px-3 py-2">可发件</th>
                  <th className="px-3 py-2">创建时间</th>
                  <th className="px-3 py-2 text-right">操作</th>
                </tr>
              </thead>
              <tbody>
                {list.map((u) => (
                  <tr key={u.id} className="border-b border-kumo-line/60 hover:bg-kumo-tint/40">
                    <td data-label="用户名" className="px-3 py-2 font-medium text-kumo-default">{u.username}</td>
                    <td data-label="角色" className="px-3 py-2">{u.role}</td>
                    <td data-label="邮箱上限" className="px-3 py-2">{u.mailbox_limit}</td>
                    <td data-label="已绑定" className="px-3 py-2">{u.mailbox_count || 0}</td>
                    <td data-label="可发件" className="px-3 py-2">{u.can_send ? "是" : "否"}</td>
                    <td data-label="创建时间" className="px-3 py-2 text-kumo-subtle">{fmtDate(u.created_at).slice(0, 16)}</td>
                    <td data-label="操作" className="fm-actions px-3 py-2">
                      <div className="inline-flex gap-1">
                        <Button size="sm" variant="ghost" shape="square" aria-label="分配邮箱" title="分配邮箱" onClick={() => setAssignUser(u)}>
                          分配
                        </Button>
                        <Button size="sm" variant="ghost" shape="square" aria-label="编辑" title="编辑" onClick={() => setEditUser(u)}>
                          <PencilIcon className="h-3.5 w-3.5" />
                        </Button>
                        {String(u.username).toLowerCase() !== "admin" ? (
                          <Button size="sm" variant="secondary-destructive" shape="square" aria-label="删除" title="删除" onClick={() => remove(u)}>
                            <TrashIcon className="h-3.5 w-3.5" />
                          </Button>
                        ) : null}
                      </div>
                    </td>
                  </tr>
                ))}
                {list.length === 0 ? (
                  <tr><td colSpan={7} className="px-3 py-8 text-center text-kumo-subtle">暂无用户</td></tr>
                ) : null}
              </tbody>
            </table>
          )}
        </div>
      </LayerCard>

      <CreateUserDialog open={createOpen} onOpenChange={setCreateOpen} onCreated={load} />
      <EditUserDialog user={editUser} onOpenChange={(v) => !v && setEditUser(null)} onUpdated={load} />
      <AssignDialog user={assignUser} onOpenChange={(v) => !v && setAssignUser(null)} onUpdated={load} />
    </div>
  );
}

function StatCard({ label, value }: { label: string; value: number }) {
  return (
    <LayerCard className="flex flex-col gap-1 p-4">
      <span className="text-xs text-kumo-subtle">{label}</span>
      <span className="text-2xl font-semibold text-kumo-strong">{value}</span>
    </LayerCard>
  );
}

function CreateUserDialog({ open, onOpenChange, onCreated }: { open: boolean; onOpenChange: (v: boolean) => void; onCreated: () => void }) {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [role, setRole] = useState("user");
  const [mailboxLimit, setMailboxLimit] = useState(10);
  const [loading, setLoading] = useState(false);

  async function submit() {
    if (!username.trim()) return toast.warning("请填写用户名");
    setLoading(true);
    try {
      await Api.createUser({ username, password: password || undefined, role, mailboxLimit });
      toast.success("用户已创建");
      onOpenChange(false);
      setUsername(""); setPassword(""); setMailboxLimit(10); setRole("user");
      onCreated();
    } catch (e) {
      toast.error("创建失败", e instanceof ApiError ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }

  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog className="p-6">
        <Dialog.Title className="mb-4 text-lg font-semibold text-kumo-strong">新建用户</Dialog.Title>
        <div className="flex flex-col gap-3">
          <Field label="用户名"><Input value={username} onChange={(e) => setUsername((e.target as HTMLInputElement).value)} /></Field>
          <Field label="密码（留空则无密码）">
            <Input type="password" value={password} onChange={(e) => setPassword((e.target as HTMLInputElement).value)} />
          </Field>
          <Field label="角色">
            <Select
              aria-label="角色"
              value={role}
              items={[{ value: "user", label: "普通用户" }, { value: "admin", label: "管理员" }]}
              onValueChange={(v) => setRole(String(v))}
            />
          </Field>
          <Field label={`邮箱上限：${mailboxLimit}`}>
            <Input type="number" min={0} value={mailboxLimit} onChange={(e) => setMailboxLimit(Number((e.target as HTMLInputElement).value) || 0)} />
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

function EditUserDialog({ user, onOpenChange, onUpdated }: { user: UserRow | null; onOpenChange: (v: boolean) => void; onUpdated: () => void }) {
  const [mailboxLimit, setMailboxLimit] = useState(10);
  const [canSend, setCanSend] = useState(false);
  const [role, setRole] = useState("user");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (user) {
      setMailboxLimit(user.mailbox_limit);
      setCanSend(!!user.can_send);
      setRole(user.role);
      setPassword("");
    }
  }, [user]);

  if (!user) return null;

  async function submit() {
    if (!user) return;
    setLoading(true);
    try {
      await Api.updateUser(user.id, {
        mailboxLimit,
        can_send: canSend ? 1 : 0,
        role,
        password: password || undefined,
      });
      toast.success("已更新");
      onOpenChange(false);
      onUpdated();
    } catch (e) {
      toast.error("更新失败", e instanceof ApiError ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }

  return (
    <Dialog.Root open={!!user} onOpenChange={onOpenChange}>
      <Dialog className="p-6">
        <Dialog.Title className="mb-4 text-lg font-semibold text-kumo-strong">编辑 · {user.username}</Dialog.Title>
        <div className="flex flex-col gap-3">
          <Field label="角色">
            <Select aria-label="角色" value={role} items={[{ value: "user", label: "普通用户" }, { value: "admin", label: "管理员" }]} onValueChange={(v) => setRole(String(v))} />
          </Field>
          <Field label={`邮箱上限：${mailboxLimit}`}>
            <Input type="number" min={0} value={mailboxLimit} onChange={(e) => setMailboxLimit(Number((e.target as HTMLInputElement).value) || 0)} />
          </Field>
          <label className="flex items-center gap-2 text-sm text-kumo-default">
            <Switch checked={canSend} onCheckedChange={setCanSend} /> 允许发件
          </label>
          <Field label="重置密码（留空保持不变）">
            <Input type="password" value={password} onChange={(e) => setPassword((e.target as HTMLInputElement).value)} />
          </Field>
        </div>
        <div className="mt-5 flex justify-end gap-2">
          <Dialog.Close render={(p) => <Button variant="ghost" {...p}>取消</Button>} />
          <Button variant="primary" loading={loading} onClick={submit}>保存</Button>
        </div>
      </Dialog>
    </Dialog.Root>
  );
}

function AssignDialog({ user, onOpenChange, onUpdated }: { user: UserRow | null; onOpenChange: (v: boolean) => void; onUpdated: () => void }) {
  const [mailboxes, setMailboxes] = useState<Mailbox[]>([]);
  const [addr, setAddr] = useState("");
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (user) {
      setAddr("");
      Api.userMailboxes(user.id).then(setMailboxes).catch(() => setMailboxes([]));
    }
  }, [user]);

  if (!user) return null;
  const userId = user.id;
  const userName = user.username;

  async function assign() {
    if (!addr.trim()) return;
    setLoading(true);
    try {
      await Api.assignMailbox(userName, addr.trim());
      toast.success("已分配");
      setAddr("");
      const list = await Api.userMailboxes(userId);
      setMailboxes(list);
      onUpdated();
    } catch (e) {
      toast.error("分配失败", e instanceof ApiError ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }

  async function unassign(address: string) {
    try {
      await Api.unassignMailbox(userName, address);
      toast.success("已取消分配");
      const list = await Api.userMailboxes(userId);
      setMailboxes(list);
      onUpdated();
    } catch (e) {
      toast.error("取消失败", e instanceof ApiError ? e.message : String(e));
    }
  }

  return (
    <Dialog.Root open={!!user} onOpenChange={onOpenChange}>
      <Dialog size="lg" className="p-6">
        <Dialog.Title className="mb-4 text-lg font-semibold text-kumo-strong">分配邮箱 · {user.username}</Dialog.Title>
        <div className="flex gap-2">
          <Input value={addr} onChange={(e) => setAddr((e.target as HTMLInputElement).value)} placeholder="要分配的邮箱地址" />
          <Button variant="primary" loading={loading} onClick={assign}>分配</Button>
        </div>
        <div className="mt-4 max-h-72 overflow-auto">
          {mailboxes.length === 0 ? (
            <div className="py-6 text-center text-sm text-kumo-subtle">尚未分配任何邮箱</div>
          ) : (
            <ul className="flex flex-col gap-1">
              {mailboxes.map((m) => (
                <li key={m.address} className="flex items-center gap-2 rounded-md border border-kumo-line/60 px-3 py-2 text-sm">
                  <span className="fm-monospace truncate flex-1">{m.address}</span>
                  <Button size="sm" variant="ghost" onClick={() => unassign(m.address)}>取消分配</Button>
                </li>
              ))}
            </ul>
          )}
        </div>
        <div className="mt-5 flex justify-end">
          <Dialog.Close render={(p) => <Button variant="ghost" {...p}>关闭</Button>} />
        </div>
      </Dialog>
    </Dialog.Root>
  );
}
