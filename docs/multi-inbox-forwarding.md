# 多合一转发方案研究

> 状态：**研究文档（仅设计，不含实现）**。
> 目标：梳理在 Freemail（Cloudflare Workers + D1 + R2 临时邮箱）上实现「多合一转发」的可行方案、能力边界与集成点，为后续落地提供依据。

## 1. 名词约定

「多合一」在不同语境下含义不同，本文拆成三种正交模式：

| 模式 | 含义 | 典型诉求 |
| --- | --- | --- |
| **A. 聚合（many → one）** | 多个临时邮箱把来信转发到**同一个**真实收件箱 | 用户在 Freemail 生成了 10 个临时地址（如 `a1@x` … `a10@x`），希望所有验证码都汇入 `me@gmail.com` |
| **B. 扇出（one → many）** | 一个临时邮箱把同一封邮件转发给**多个**真实收件人 | 一个共享地址 `team@x` 同时分发给 `boss@x`、`dev@x`、`sec@x` |
| **C. 规则聚合（prefix/catch-all → one/many）** | 按本地名前缀或通配把一类地址集体转发 | 所有 `vip*` 转给 `vip-owner@x`，其余兜底转 `common@x` |

> 现实里用户口中的「多合一」多半指 **A（聚合）**，必要时叠加 **C（按规则批量）**。本仓库现有逻辑已经覆盖 A/C 的雏形（见 §3），**B 是真正缺失的能力**。

## 2. Cloudflare Email Service 能力边界

以下结论基于 CF Email Service 官方文档（email-routing / email-handler），是本方案的硬约束：

1. `EmailMessage.forward(rcptTo)` 只能把邮件转发给**已验证的 Destination Address**（在 CF 后台 Compute → Email Service → Email Routing → Destination Addresses 中验证过）。未验证地址一律失败。
2. **扇出是原生支持的**：在 `email()` handler 内对同一 `message` 并发多次调用 `forward()` 即可。官方示例即有：
   ```ts
   await Promise.all([
     message.forward("security@example.com"),
     message.forward("admin@example.com"),
     message.forward("ciso@example.com"),
   ]);
   ```
   → 一次来信可投递给 N 个验证地址。
3. **向「未验证 / 任意」地址投递**不能用 `forward()`；只能走 **Email Sending（出站）**：`env.EMAIL.send(...)`、REST API 或 `smtps://smtp.mx.cloudflare.net:465`。出站可发任意地址，但：
   - 需 Workers **Paid plan**；
   - 计入月度/日度配额；
   - **例外**：发送到「已验证 destination address」**全计划免费、不计配额**——这恰好和 `forward()` 的可达集合重合。
4. **Catch-all 规则**：CF 后台可把「未匹配的本地名」统一转发到一个 destination 或 Worker。Freemail 走的是 *Send to a Worker* 路线，catch-all 把所有信都送进 `email()` handler，由 Worker 自行决定转发。
5. **Subaddressing**（RFC 5233，`user+detail@domain`）：CF 原生支持，`+detail` 不影响路由匹配但保留在 `message.to`，可被 Worker 读取。可自然实现「一个基础地址 + 任意标签」的「多合一」。
6. 入站邮件体上限 **25 MiB**；`forward()` 仅允许追加 `X-` 前缀自定义头，其余自定义头会被剥离。
7. `message.reply()` 受 DMARC / 单次 / 域匹配 / `References` 长度等限制，不适合做转发通道。

## 3. Freemail 现状

代码中已存在的转发能力：

| 能力 | 位置 | 形态 | 覆盖模式 |
| --- | --- | --- | --- |
| 单邮箱转发目标 | `mailboxes.forward_to`（D1 字段） | 单个字符串地址；`message.forward(forward_to)` | A（1:1） |
| 批量设置转发 | `POST /api/mailboxes/batch-forward`、`/api/mailboxes/batch-forward-by-address` | 给多个邮箱一次性写入同一 `forward_to` | A（批量赋能） |
| 全局前缀/通配转发 | `env.FORWARD_RULES`（JSON 或 `prefix=email` kv） | 在 `email()` handler 内按 local-part 前缀匹配，命中即 `message.forward` | C |
| 邮箱优先级 | `src/email/handler.js` | 先查 `forward_to`，再退回 `FORWARD_RULES` | — |

关键文件：
- `src/email/handler.js:42-51` — `getForwardTarget` → `forwardByMailboxConfig` / `forwardByLocalPart` 二选一。
- `src/email/forwarder.js:14-25,101-114` — 每次只 `ctx.waitUntil(message.forward(单目标))`。
- `src/email/forwarder.js:84-92` `resolveTargetEmail` — 前缀匹配 + `*` 通配兜底。
- `src/api/mailboxSettings.js:39-350` — 转发目标 CRUD（单/批/按地址）。
- `d1-init.sql` / `src/db/init.js` — `forward_to TEXT DEFAULT NULL`（单值）。

**缺口**：
1. forward_to 只支持**单值字符串**，无法表达「扇出列表」。
2. 没有「聚合组」概念——A 模式靠重复设置每个邮箱的 forward_to，膨胀且易漏配。
3. 没有把 CF Email Sending（出站到任意地址）作为「无法验证 destination 时的兜底通道」。
4. 没有审计/失败重试：`forward()` 抛错时调用 `message.setReject('Forward failed')`，但没有入库记录转发成败。

## 4. 方案候选

### 方案 S1：扩展 forward_to 为多值（最小改动）

`forward_to` 容纳逗号分隔列表或 JSON 数组；`forwardByMailboxConfig` 改为并发扇出：
```js
const targets = parseTargets(forwardTo);          // ["a@x","b@x"]
await Promise.all(targets.map(t => message.forward(t)));
```
- ✅ 直接解锁 **B（扇出）**；A 仍靠批量设置。
- ❌ 多值混在一个字段，不便管理、无法给每个目标配独立开关/标签。
- ❌ 全部目标必须为已验证 destination。

### 方案 S2：新增 `forwarding_targets` 子表（推荐）

按「邮箱 → 多转发目标」建模：

```sql
CREATE TABLE forwarding_targets (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  mailbox_id   INTEGER NOT NULL,
  target_email TEXT NOT NULL,
  enabled      INTEGER DEFAULT 1,
  label        TEXT,                 -- 可选备注
  created_at   TEXT DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (mailbox_id) REFERENCES mailboxes(id) ON DELETE CASCADE,
  UNIQUE (mailbox_id, target_email)
);
```
- `forward_to` 列保留作「主/快捷转发」或渐进迁移；新表为权威。
- handler 命中邮箱后 `SELECT target_email FROM forwarding_targets WHERE mailbox_id=? AND enabled=1`，`Promise.all` 扇出。
- ✅ 灵活：增删目标、单独停用、打标签，无需 ALTER 大表。
- ✅ 与现有 `forward_to` 共存（平滑迁移）。
- ❌ 仍受「目标必须是已验证 destination」限制。

### 方案 S3：聚合组 `forwarding_groups`（最贴「多合一」语义）

引入「聚合组」概念：一个组绑定多个邮箱 + 多个目标，handler 落信时按 mailbox → group → targets 解析：
```text
group g1 (alias "我的主用")
  ├ mailboxes: a1@x, a2@x, a3@x        (many)
  └ targets:   me@gmail.com, me@qq.com (one or many)
```
- ✅ 完整覆盖 A/B/C：一个邮箱可属多组、一组可含多邮箱多目标。
- ✅ 前端可做「聚合收件箱」视图：按组查看所有成员邮箱的信。
- ❌ 改动最大：D1 多表、API、前端、handler 全链路；适合作为 V7 单独立项。

### 方案 S4：纯配置 `FORWARD_RULES` 增强（无 D1 改动）

扩展 `FORWARD_RULES` 的 JSON schema，支持「多目标」「优先级」「正则前缀」：
```json
[
  {"prefix":"vip","targets":["a@x","b@x"]},
  {"regex":"^\\d{4}@","target":"codes@x"},
  {"prefix":"*","target":"common@x"}
]
```
- ✅ 零 D1 改动，热更新（改 env 即生效）；适合做 **C（规则聚合）**。
- ❌ 不解决 A（按邮箱归属）与 B（单邮箱多目标）的精细需求；规则维护靠手工。

### 方案 S5：CF Email Sending 出站兜底（与其他方案叠加）

`forward()` 不可达的地址（用户填了未验证的真实邮箱）时，改用 `env.EMAIL.send()` 把邮件以「从自有域 → 任意真实地址」出站投递：
```js
async function relayOutbound(message, target, env) {
  const raw = await new Response(message.raw).arrayBuffer();
  await env.EMAIL.send({
    to: target,
    from: message.to,            // 仍以收件域为发件人，保留原语义
    subject: message.headers.get('subject'),
    raw: raw,                    // 原始 MIME（若 API 支持 raw）
  });
}
```
- ✅ 突破「仅已验证 destination」约束，真正能转发给用户**任意**真实邮箱。
- ⚠ 需要 Paid plan + 配额；`from` 域必须属本账户且通过 DNS 验证。
- ⚠ 可能影响投递信誉（转发链路 SPF/DMARC 破损）；建议改写发件人或加 `Reply-To`/`X-Original-From`。
- 仓库里已有 Resend/Sendflare/CYBERPERSONS 出站通道（`src/email/providers/`），任一都可作为兜底，无需新接入 CF Email Sending。

## 5. 集成点（与现仓库对接）

无论选哪个方案，落地点都集中在三处：

1. **`src/email/handler.js`** 解析目标处（约 `:42-51`）：把「单目标」换成「目标列表 + 并发扇出 + 结果聚合」：
   ```js
   const targets = await resolveForwardTargets(DB, normalizedAddr, env, localPart);
   const fwd = await forwardToTargets(message, targets, ctx);   // Promise.all
   if (fwd.atLeastOneTarget && !fwd.atLeastOneSuccess) message.setReject('Forward failed');
   ```
2. **`src/email/forwarder.js`**：新增 `forwardToTargets(message, targets, ctx)`，对每个目标 `try/catch` 单独记录成败；返回 `{hasTarget, forwarded, failures[]}`。失败原因入库便于排障。
3. **D1 + API**：按所选方案加表/字段，复用现有 `/api/mailbox/forward*` 形态扩成数组 target；前端 `frontend/src/components/EmailViewer`、`MailboxesPage` 的「转发」入口改为多目标列表（kumo `Chip`/`Dialog`）。

`FORWARD_RULES` 的解析（`parseForwardRules`/`resolveTargetEmail`）可顺势升级为支持 `targets` 数组，使规则路径与邮箱路径统一为「返回目标列表」。

## 6. 推荐落地顺序

> 本期不实现，仅给出后续建议节奏。

1. **Phase 1（解锁扇出，低风险）**：S1 + S4 增强。`forward_to` 接受逗号分隔多值，`forwarder` 并发扇出；`FORWARD_RULES` 支持 `targets:[...]`。改 3 个文件、零表结构变更。
2. **Phase 2（精细管理）**：S2 建表 `forwarding_targets`，前端加目标列表管理；`forward_to` 渐进迁移到子表（保留只读兼容）。
3. **Phase 3（未验证地址兜底）**：S5，在扇出失败「目标未验证」时回退到 Resend/Sendflare 出站通道，并加 `Reply-To`/发件人改写以保投递率。
4. **Phase 4（可选）**：S3 聚合组，配套前端「聚合收件箱」视图，作为 V7 单独立项。

## 7. 风险与限制

- **Verified Destination 是硬门槛**：任何 `forward()` 方案都需用户先在 CF 后台验证目标地址；落地时前端必须显式提示「请先在 Cloudflare Email Routing 验证该地址」。
- **扇出放大效应**：一封垃圾信会被扇出到 N 个真实邮箱，建议在 handler 前置轻量过滤（发件域黑名单/体积阈值，文档 §email-handler 的 reject 用法可直接复用）。
- **出站转发信誉**：S5 改写发件人后 SPF/DMARC 仍是转发破链问题，建议保留原 `From` 为 `Reply-To`、或用 `Resent-From`；务必抽测投递率。
- **`forward()` 仅留 `X-` 头**：自定义追踪头需以 `X-` 开头（如 `X-Freemail-Mailbox`、`X-Freemail-Forward-Reason`）才能在转发后保留。
- **API Key scope 边界**：转发管理属「manage」动作；本仓库 API Key scope 对 send/users/apikeys/batch- 路径永久拒绝（见 `src/routes/api.js`），新增的转发管理端点须沿用同一门控、不得放入 `read`/`create`。
- **重复转发幂等**：扇出时若 Worker 重试，可能对真实邮箱造成重复投递；建议按 `Message-ID + target` 做去重（D1 查或 KV 短 TTL 记录）。

## 8. 待研究

- CF Email Routing REST API 能否用程序化管理 destination address（自动发起验证），从而在前端「添加转发目标」时自动走完验证流程，免用户手动后台操作。
- 聚合组（S3）与既有「管理员分配邮箱」/「单邮箱角色」（`MailboxRolePage`）的账号模型如何对齐。
- 出站通道（Resend/Sendflare/CYBERPERSONS）作为转发兜底时的发件人策略与配额监控。
