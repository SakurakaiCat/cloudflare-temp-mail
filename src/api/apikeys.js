/**
 * API Key 管理 API 模块（仅会话认证用户可访问自己的 Key）
 * @module api/apikeys
 */

import { getJwtPayload, errorResponse } from './helpers.js';
import { createApiKey, listApiKeysByUser, deleteApiKey, revokeApiKey } from '../db/index.js';

/**
 * 处理 API Key 管理 API
 * /api/apikeys        GET    列出当前用户的 Key
 * /api/apikeys        POST   创建新 Key（明文仅返回一次）
 * /api/apikeys/:id    DELETE 吊销并删除
 * @returns {Promise<Response|null>}
 */
export async function handleApiKeysApi(request, db, url, path, options) {
  const payload = getJwtPayload(request, options);
  if (!payload) return errorResponse('Unauthorized', 401);
  const userId = Number(payload.userId || 0);
  if (!userId) return errorResponse('需要登录用户身份', 401);
  // mailbox 角色没有 user_id，不允许管理 API Key
  if (payload.role === 'mailbox') return errorResponse('Forbidden', 403);

  // 列表
  if (path === '/api/apikeys' && request.method === 'GET') {
    const list = await listApiKeysByUser(db, userId);
    return Response.json(list || []);
  }

  // 创建
  if (path === '/api/apikeys' && request.method === 'POST') {
    let body;
    try { body = await request.json(); } catch (_) { return errorResponse('Bad Request', 400); }
    const name = String(body.name || '').trim();
    if (!name) return errorResponse('请填写名称', 400);
    const rawScopes = Array.isArray(body.scopes) ? body.scopes : [];
    const allowed = new Set(['read', 'create', 'manage']);
    const scopes = rawScopes.map(s => String(s).toLowerCase()).filter(s => allowed.has(s));
    if (!scopes.length) return errorResponse('至少选择一项权限范围', 400);

    let expiresAt = null;
    if (body.expires_at) {
      const t = Date.parse(body.expires_at);
      if (!Number.isFinite(t)) return errorResponse('expires_at 格式无效', 400);
      if (t <= Date.now()) return errorResponse('expires_at 必须是未来时间', 400);
      expiresAt = new Date(t).toISOString();
    }

    try {
      const created = await createApiKey(db, { userId, name, scopes, expiresAt });
      return Response.json(created, { status: 201 });
    } catch (e) {
      return errorResponse('创建失败: ' + (e?.message || e), 500);
    }
  }

  // 吊销 / 删除
  if (path.startsWith('/api/apikeys/') && request.method === 'DELETE') {
    const id = Number(path.split('/')[3] || 0);
    if (!id) return errorResponse('无效 ID', 400);
    const removed = await deleteApiKey(db, userId, id);
    return removed
      ? Response.json({ success: true })
      : errorResponse('Key 不存在或无权操作', 404);
  }

  return null;
}
