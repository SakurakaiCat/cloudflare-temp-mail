/**
 * API Key 数据库操作模块
 * @module db/apikeys
 */

import { sha256Hex } from '../utils/common.js';

const KEY_PREFIX = 'fm_';
// 6 位抽取（& 0x3f）会产生 0..63，因此必须是 64 字符字母表；用 URL 安全的 base64url 字符集。
const ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_';

/**
 * 生成 32 字节强度的随机 API Key 字符串，格式 `fm_<42 位 base64url>`。
 * @returns {string} 完整 API Key（明文，仅返回一次）
 */
export function generateApiKey() {
  const bytes = crypto.getRandomValues(new Uint8Array(32));
  let out = KEY_PREFIX;
  let buf = 0;
  let bits = 0;
  for (let i = 0; i < bytes.length; i++) {
    buf = (buf << 8) | bytes[i];
    bits += 8;
    while (bits >= 6) {
      bits -= 6;
      out += ALPHABET[buf >> bits & 0x3f];
    }
  }
  if (bits > 0) out += ALPHABET[buf << (6 - bits) & 0x3f];
  return out;
}

/**
 * 计算传入明文 Key 的存储哈希（SHA-256 hex）。
 * @param {string} key - 明文 API Key
 * @returns {Promise<string>} 十六进制哈希
 */
export async function hashApiKey(key) {
  return await sha256Hex(String(key || ''));
}

/**
 * 创建一条 API Key 记录。
 * @param {object} db - D1 连接
 * @param {object} params
 * @param {number} params.userId - 所有者用户 ID
 * @param {string} params.name - 可读名称
 * @param {string[]} params.scopes - 权限范围（read / create / manage）
 * @param {string|null} [params.expiresAt] - ISO 失效时间；null 表示长期有效
 * @returns {Promise<{id:number,name:string,prefix:string,scopes:string,created_at:string,last_used_at:null,expires_at:string|null,key:string}>}
 */
export async function createApiKey(db, { userId, name, scopes, expiresAt = null }) {
  const uid = Number(userId || 0);
  if (!uid) throw new Error('缺少用户');
  const trimmedName = String(name || '').trim() || 'Untitled';
  const scopeStr = Array.isArray(scopes)
    ? scopes.map(s => String(s).trim().toLowerCase()).filter(s => ['read', 'create', 'manage'].includes(s)).join(',')
    : String(scopes || '');

  const fullKey = generateApiKey();
  const keyHash = await hashApiKey(fullKey);
  const prefix = fullKey.slice(0, 14); // 展示前缀，例如 fm_aBcD12Xy

  await db.prepare(
    'INSERT INTO api_keys (name, key_hash, prefix, user_id, scopes, expires_at) VALUES (?, ?, ?, ?, ?, ?)'
  ).bind(trimmedName, keyHash, prefix, uid, scopeStr, expiresAt || null).run();

  const created = await db.prepare('SELECT id, created_at FROM api_keys WHERE key_hash = ? LIMIT 1').bind(keyHash).first();
  return {
    id: created?.id || 0,
    name: trimmedName,
    prefix,
    scopes: scopeStr,
    created_at: created?.created_at || new Date().toISOString(),
    last_used_at: null,
    expires_at: expiresAt || null,
    key: fullKey
  };
}

/**
 * 列出某用户的所有 API Key（不返回明文）。
 * @param {object} db - D1 连接
 * @param {number} userId - 用户 ID
 * @returns {Promise<Array<object>>}
 */
export async function listApiKeysByUser(db, userId) {
  const uid = Number(userId || 0);
  if (!uid) return [];
  const res = await db.prepare(
    'SELECT id, name, prefix, scopes, created_at, last_used_at, expires_at, revoked FROM api_keys WHERE user_id = ? ORDER BY datetime(created_at) DESC'
  ).bind(uid).all();
  return res?.results || [];
}

/**
 * 根据 ID 删除（硬删除）某条 API Key，仅限所有者。
 * @param {object} db - D1 连接
 * @param {number} userId - 所有者 ID（用于鉴权）
 * @param {number} keyId - Key 记录 ID
 * @returns {Promise<boolean>}
 */
export async function deleteApiKey(db, userId, keyId) {
  const uid = Number(userId || 0);
  const kid = Number(keyId || 0);
  if (!uid || !kid) return false;
  const res = await db.prepare('DELETE FROM api_keys WHERE id = ? AND user_id = ?').bind(kid, uid).run();
  return (res?.meta?.changes || 0) > 0;
}

/**
 * 吊销（软删除）某条 API Key，仅限所有者。
 * @param {object} db - D1 连接
 * @param {number} userId - 所有者 ID
 * @param {number} keyId - Key 记录 ID
 * @returns {Promise<boolean>}
 */
export async function revokeApiKey(db, userId, keyId) {
  const uid = Number(userId || 0);
  const kid = Number(keyId || 0);
  if (!uid || !kid) return false;
  const res = await db.prepare('UPDATE api_keys SET revoked = 1 WHERE id = ? AND user_id = ?').bind(kid, uid).run();
  return (res?.meta?.changes || 0) > 0;
}

/**
 * 由明文 Key 解析身份。命中返回 { keyId, userId, scopes }，否则 null。
 * 同时更新 last_used_at（后台触发，不阻塞主流程）。
 * @param {object} db - D1 连接
 * @param {string} rawKey - 请求头携带的明文 Key
 * @returns {Promise<{keyId:number,userId:number,scopes:string[]}|null>}
 */
export async function resolveApiKey(db, rawKey) {
  const key = String(rawKey || '').trim();
  if (!key || !key.startsWith(KEY_PREFIX)) return null;
  const keyHash = await hashApiKey(key);
  const row = await db.prepare(
    `SELECT a.id AS key_id, a.user_id, a.scopes, a.expires_at, a.revoked, u.role, u.username
     FROM api_keys a JOIN users u ON u.id = a.user_id
     WHERE a.key_hash = ? LIMIT 1`
  ).bind(keyHash).first();
  if (!row) return null;
  if (row.revoked) return null;
  if (row.expires_at) {
    const exp = Date.parse(row.expires_at);
    if (Number.isFinite(exp) && exp <= Date.now()) return null;
  }
  db.prepare('UPDATE api_keys SET last_used_at = CURRENT_TIMESTAMP WHERE id = ?')
    .bind(row.key_id).run().catch(() => {});
  return {
    keyId: Number(row.key_id),
    userId: Number(row.user_id),
    scopes: String(row.scopes || '').split(',').map(s => s.trim()).filter(Boolean),
    role: String(row.role || 'user'),
    username: String(row.username || '')
  };
}
