/**
 * API 路由：全部委托到 src/api/index.js
 * @module routes/api
 */

import { Hono } from 'hono';
import { getInitializedDatabase } from '../db/index.js';
import { handleApiRequest } from '../api/index.js';

const router = new Hono();

router.get('/api/session', (c) => {
  const p = c.get('authPayload');
  if (!p) return c.text('Unauthorized', 401);
  const ADMIN_NAME = String(c.env.ADMIN_NAME || 'admin').trim().toLowerCase();
  const resp = {
    authenticated: true,
    role: p.role || 'admin',
    username: p.username || '',
    strictAdmin: (p.role === 'admin') && (
      String(p.username || '').trim().toLowerCase() === ADMIN_NAME ||
      String(p.username || '') === '__root__'
    ),
    viaApiKey: !!p.viaApiKey,
    scopes: p.scopes || []
  };
  if (p.role === 'mailbox' && p.mailboxAddress) resp.mailboxAddress = p.mailboxAddress;
  return c.json(resp);
});

// API Key scope gating：对以 fm_ Bearer 鉴权的请求按路径强制校验。
function enforceApiKeyScopes(c, path, method) {
  const p = c.get('authPayload');
  if (!p || !p.viaApiKey) return null; // 非按 API Key 走的人不拦截
  const has = (scope) => Array.isArray(p.scopes) && p.scopes.includes(scope);

  // 永远禁止通过 API Key 执行：发件、用户管理、批量管理员操作、Key 自管理
  const never =
    (path === '/api/send' || path === '/api/send/batch' || path.startsWith('/api/send/')) ||
    path.startsWith('/api/users') ||
    path.startsWith('/api/apikeys') ||
    path.startsWith('/api/mailboxes/batch-');
  if (never) return c.json({ error: '此操作不允许通过 API Key 执行' }, 403);

  if (method === 'GET') {
    // 纯身份/配置类信息无需 scope
    const noScopeNeeded = path === '/api/session' || path === '/api/domains' || path === '/api/user/quota' || path === '/api/sent';
    if (noScopeNeeded) return null;
    // 其余 GET 一律要求 read
    if (!has('read')) return c.json({ error: 'API Key 缺少 read 权限' }, 403);
    return null;
  }

  // 写操作
  if (path === '/api/generate' || path === '/api/create') {
    if (!has('create')) return c.json({ error: 'API Key 缺少 create 权限' }, 403);
    return null;
  }

  // 其余写操作（删除邮箱/置顶/收藏/转发/登录权限/改密/删除邮件）一律要求 manage
  if (!has('manage')) return c.json({ error: 'API Key 缺少 manage 权限' }, 403);
  return null;
}

router.all('/api/*', async (c) => {
  const authPayload = c.get('authPayload');
  let DB;
  try { DB = await getInitializedDatabase(c.env); } catch (_) { return c.text('数据库连接失败', 500); }

  // API Key 路径上强制 scope 校验
  const blocked = enforceApiKeyScopes(c, c.req.path, c.req.method);
  if (blocked) return blocked;

  const MAIL_DOMAINS = (c.env.MAIL_DOMAIN || 'temp.example.com').split(/[,\s]+/).map(d => d.trim()).filter(Boolean);
  const baseOpts = {
    mockOnly: false,
    resendApiKey: c.env.RESEND_API_KEY || c.env.RESEND_TOKEN || c.env.RESEND || '',
    sendflareApiKey: c.env.SENDFLARE_API_KEY || c.env.SENDFLARE_TOKEN || '',
    cyberpersonsApiKey: c.env.CYBERPERSONS_API_KEY || c.env.CYBERPERSONS_API_TOKEN || c.env.CYBERPERSONS || '',
    adminName: String(c.env.ADMIN_NAME || 'admin').trim().toLowerCase(),
    r2: c.env.MAIL_EML,
    authPayload
  };

  if ((authPayload?.role || 'admin') === 'guest') {
    return handleApiRequest(c.req.raw, DB, MAIL_DOMAINS, { ...baseOpts, mockOnly: true });
  }
  if (authPayload?.role === 'mailbox') {
    return handleApiRequest(c.req.raw, DB, MAIL_DOMAINS, { ...baseOpts, mailboxOnly: true });
  }
  return handleApiRequest(c.req.raw, DB, MAIL_DOMAINS, baseOpts);
});

export default router;
