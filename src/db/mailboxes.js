/**
 * 邮箱数据库操作模块
 * @module db/mailboxes
 */

import {
  getCachedMailboxId,
  updateMailboxIdCache,
  invalidateMailboxCache,
  invalidateSystemStatCache,
  getCachedSystemStat
} from '../utils/cache.js';

/**
 * 获取或创建邮箱ID，如果邮箱不存在则自动创建。
 * 优化版：用 `INSERT ... ON CONFLICT DO NOTHING RETURNING id` 把创建热路径压缩到单次往返。
 * @param {object} db - 数据库连接对象
 * @param {string} address - 邮箱地址
 * @returns {Promise<number>} 邮箱ID
 * @throws {Error} 当邮箱地址无效时抛出异常
 */
export async function getOrCreateMailboxId(db, address) {
  const normalized = String(address || '').trim().toLowerCase();
  if (!normalized) throw new Error('无效的邮箱地址');

  // 先检查内存缓存
  const cachedId = await getCachedMailboxId(db, normalized);
  if (cachedId) {
    // 后台刷新访问时间，不阻塞主流程
    db.prepare('UPDATE mailboxes SET last_accessed_at = CURRENT_TIMESTAMP WHERE id = ?')
      .bind(cachedId).run().catch(() => {});
    return cachedId;
  }

  // 解析邮箱地址
  let local_part = '';
  let domain = '';
  const at = normalized.indexOf('@');
  if (at > 0 && at < normalized.length - 1) {
    local_part = normalized.slice(0, at);
    domain = normalized.slice(at + 1);
  }
  if (!local_part || !domain) throw new Error('无效的邮箱地址');

  // 尝试直接插入；命中已有地址则 ON CONFLICT DO NOTHING 返回空，随后用单次 SELECT 兜底。
  // 对于随机生成邮箱（绝大多数为新地址），这条语句单次往返即可拿到 id。
  const ins = await db.prepare(
    'INSERT INTO mailboxes (address, local_part, domain, password_hash, last_accessed_at) VALUES (?, ?, ?, NULL, CURRENT_TIMESTAMP) ON CONFLICT(address) DO NOTHING RETURNING id'
  ).bind(normalized, local_part, domain).all();

  if (ins?.results && ins.results.length > 0) {
    const newId = ins.results[0].id;
    updateMailboxIdCache(normalized, newId);
    invalidateSystemStatCache('total_mailboxes');
    return newId;
  }

  // 已存在：兜底查询 id（缓存未命中的已存在地址）
  const existing = await db.prepare('SELECT id FROM mailboxes WHERE address = ? LIMIT 1').bind(normalized).all();
  const id = existing?.results?.[0]?.id;
  if (!id) throw new Error('无法解析或创建 mailbox 记录');
  updateMailboxIdCache(normalized, id);
  db.prepare('UPDATE mailboxes SET last_accessed_at = CURRENT_TIMESTAMP WHERE id = ?').bind(id).run().catch(() => {});
  return id;
}

/**
 * 获取或创建邮箱，并一次性返回邮箱元信息（id、是否收藏、转发目标、是否可登录）。
 * 供 /api/generate 和 /api/create 调用，使前端无需再发一次 /api/mailbox/info 请求。
 * @param {object} db - D1 连接
 * @param {string} address - 邮箱地址
 * @returns {Promise<{id:number, address:string, is_favorite:boolean, forward_to:string|null, can_login:boolean, created:boolean}>}
 */
export async function getOrCreateMailboxInfo(db, address) {
  const normalized = String(address || '').trim().toLowerCase();
  if (!normalized) throw new Error('无效的邮箱地址');

  // 创建/获取 id
  const id = await getOrCreateMailboxId(db, normalized);

  // 单次查询拿到展示用元信息
  const row = await db.prepare(
    'SELECT id, address, COALESCE(is_favorite, 0) AS is_favorite, forward_to, COALESCE(can_login, 0) AS can_login FROM mailboxes WHERE id = ? LIMIT 1'
  ).bind(id).first();
  if (!row) throw new Error('邮箱记录查询失败');
  return {
    id: Number(row.id),
    address: row.address,
    is_favorite: !!row.is_favorite,
    forward_to: row.forward_to || null,
    can_login: !!row.can_login
  };
}

/**
 * 根据邮箱地址获取邮箱ID
 * @param {object} db - 数据库连接对象
 * @param {string} address - 邮箱地址
 * @returns {Promise<number|null>} 邮箱ID，如果不存在返回null
 */
export async function getMailboxIdByAddress(db, address) {
  const normalized = String(address || '').trim().toLowerCase();
  if (!normalized) return null;
  
  // 使用缓存
  return await getCachedMailboxId(db, normalized);
}

/**
 * 检查邮箱是否存在以及是否属于特定用户
 * @param {object} db - 数据库连接对象
 * @param {string} address - 邮箱地址
 * @param {number} userId - 用户ID（可选）
 * @returns {Promise<object>} 包含exists(是否存在)、ownedByUser(是否属于该用户)、mailboxId的对象
 */
export async function checkMailboxOwnership(db, address, userId = null) {
  const normalized = String(address || '').trim().toLowerCase();
  if (!normalized) return { exists: false, ownedByUser: false, mailboxId: null };
  
  // 检查邮箱是否存在
  const res = await db.prepare('SELECT id FROM mailboxes WHERE address = ? LIMIT 1').bind(normalized).all();
  if (!res.results || res.results.length === 0) {
    return { exists: false, ownedByUser: false, mailboxId: null };
  }
  
  const mailboxId = res.results[0].id;
  
  // 如果没有提供用户ID，只返回存在性检查结果
  if (!userId) {
    return { exists: true, ownedByUser: false, mailboxId };
  }
  
  // 检查邮箱是否属于该用户
  const ownerRes = await db.prepare(
    'SELECT id FROM user_mailboxes WHERE user_id = ? AND mailbox_id = ? LIMIT 1'
  ).bind(userId, mailboxId).all();
  
  const ownedByUser = ownerRes.results && ownerRes.results.length > 0;
  
  return { exists: true, ownedByUser, mailboxId };
}

/**
 * 切换邮箱的置顶状态
 * @param {object} db - 数据库连接对象
 * @param {string} address - 邮箱地址
 * @param {number} userId - 用户ID
 * @returns {Promise<object>} 包含is_pinned状态的对象
 * @throws {Error} 当邮箱地址无效、用户未登录或邮箱不存在时抛出异常
 */
export async function toggleMailboxPin(db, address, userId) {
  const normalized = String(address || '').trim().toLowerCase();
  if (!normalized) throw new Error('无效的邮箱地址');
  const uid = Number(userId || 0);
  if (!uid) throw new Error('未登录');

  // 获取邮箱 ID
  const mbRes = await db.prepare('SELECT id FROM mailboxes WHERE address = ? LIMIT 1').bind(normalized).all();
  if (!mbRes.results || mbRes.results.length === 0){
    throw new Error('邮箱不存在');
  }
  const mailboxId = mbRes.results[0].id;

  // 检查该邮箱是否属于该用户
  const umRes = await db.prepare('SELECT id, is_pinned FROM user_mailboxes WHERE user_id = ? AND mailbox_id = ? LIMIT 1')
    .bind(uid, mailboxId).all();
  if (!umRes.results || umRes.results.length === 0){
    // 若尚未存在关联记录（例如严格管理员未分配该邮箱），则创建一条仅用于个人置顶的关联
    await db.prepare('INSERT INTO user_mailboxes (user_id, mailbox_id, is_pinned) VALUES (?, ?, 1)')
      .bind(uid, mailboxId).run();
    return { is_pinned: 1 };
  }

  const currentPin = umRes.results[0].is_pinned ? 1 : 0;
  const newPin = currentPin ? 0 : 1;
  await db.prepare('UPDATE user_mailboxes SET is_pinned = ? WHERE user_id = ? AND mailbox_id = ?')
    .bind(newPin, uid, mailboxId).run();
  return { is_pinned: newPin };
}

/**
 * 获取系统中所有邮箱的总数量
 * @param {object} db - 数据库连接对象
 * @returns {Promise<number>} 系统中所有邮箱的总数量
 */
export async function getTotalMailboxCount(db) {
  try {
    // 使用缓存避免频繁的 COUNT 全表扫描
    return await getCachedSystemStat(db, 'total_mailboxes', async (db) => {
      const result = await db.prepare('SELECT COUNT(1) AS count FROM mailboxes').all();
      return result?.results?.[0]?.count || 0;
    });
  } catch (error) {
    console.error('获取系统邮箱总数失败:', error);
    return 0;
  }
}

/**
 * 获取邮箱的转发目标
 * @param {object} db - 数据库连接对象
 * @param {string} address - 邮箱地址
 * @returns {Promise<string|null>} 转发目标地址，无配置返回 null
 */
export async function getForwardTarget(db, address) {
  const normalized = String(address || '').trim().toLowerCase();
  if (!normalized) return null;
  
  const result = await db.prepare(
    'SELECT forward_to FROM mailboxes WHERE address = ? LIMIT 1'
  ).bind(normalized).first();
  
  return result?.forward_to || null;
}
