/**
 * Hono 应用中间件
 * @module middleware/app
 * 
 */

import { verifyJwtWithCache, checkRootAdminOverride } from './auth.js';
import { resolveApiKey } from '../db/apikeys.js';

export function authMiddleware() {
  return async (c, next) => {
    const token = c.env.JWT_TOKEN || c.env.JWT_SECRET || '';

    // 1) API Key 认证（Authorization: Bearer fm_xxx）—— 供 agent / 外部工具调用
    const authHeader = c.req.header('Authorization') || c.req.header('authorization') || '';
    if (authHeader.startsWith('Bearer ')) {
      const bearer = authHeader.slice(7).trim();
      if (bearer.startsWith('fm_') && c.env.TEMP_MAIL_DB) {
        try {
          const resolved = await resolveApiKey(c.env.TEMP_MAIL_DB, bearer);
          if (resolved) {
            c.set('authPayload', {
              role: resolved.role,
              username: resolved.username,
              userId: resolved.userId,
              apiKeyId: resolved.keyId,
              viaApiKey: true,
              scopes: resolved.scopes
            });
            return next();
          }
        } catch (e) {
          console.error('API Key 鉴权失败:', e);
        }
        // 携带了 fm_ 前缀但未命中：直接 401，避免回退到 cookie 误判
        return c.text('Unauthorized: invalid API key', 401);
      }
    }

    // 2) 超级管理员令牌覆盖
    const root = checkRootAdminOverride(c.req.raw, token);
    if (root) { c.set('authPayload', root); return next(); }

    // 3) 会话 Cookie 鉴证
    const payload = await verifyJwtWithCache(token, c.req.header('Cookie') || '');
    if (!payload) return c.text('Unauthorized', 401);
    c.set('authPayload', payload);
    return next();
  };
}

export function rateLimiter({ windowMs = 60_000, max = 100 } = {}) {
  const store = new Map();
  const banned = new Map();
  let cleanupCounter = 0;
  return async (c, next) => {
    const ip = c.req.header('CF-Connecting-IP') || c.req.header('X-Forwarded-For') || 'unknown';
    const now = Date.now();

    // 检查临时封禁
    const banEntry = banned.get(ip);
    if (banEntry && banEntry.until > now) {
      return c.text('Too Many Requests', 429);
    }
    if (banEntry && banEntry.until <= now) {
      banned.delete(ip);
    }

    const key = `${ip}:${c.req.path}`;
    let e = store.get(key);
    if (!e || e.resetAt < now) {
      store.set(key, { count: 1, resetAt: now + windowMs });
      return next();
    }
    if (++e.count > max) {
      // 超额后临时封禁该 IP（指数退避：首次 30s，后续加倍）
      const prevBan = banned.get(ip);
      const duration = prevBan ? Math.min((prevBan.duration || 30_000) * 2, 600_000) : 30_000;
      banned.set(ip, { until: now + duration, duration });
      return c.text('Too Many Requests', 429);
    }

    // 每 10 次请求清理过期条目，防止内存泄漏
    cleanupCounter++;
    if (cleanupCounter % 10 === 0) {
      const cutoff = now - windowMs;
      for (const [k, v] of store) {
        if (v.resetAt < cutoff) store.delete(k);
      }
      for (const [k, v] of banned) {
        if (v.until < now) banned.delete(k);
      }
    }

    return next();
  };
}
