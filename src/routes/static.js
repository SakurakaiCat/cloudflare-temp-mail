/**
 * 静态资源路由：SPA 入口 + 静态资源。
 *
 * V6 起，前端改为 React + @cloudflare/kumo 单页应用（hash 路由）。
 * 所有页面都从根 index.html 加载，鉴权在客户端 RouteGuard 中完成。
 * 服务端仅需：
 *   1. 为 `/` 注入 mail-domains meta；
 *   2. 其余 GET 交给 Workers Assets 直接托管；
 *   3. 未命中的非资源路径回退到 index.html（便于未来切到 history 路由）。
 * @module routes/static
 */

import { Hono } from 'hono';

const router = new Hono();

function isStaticAsset(pathname) {
  return pathname.startsWith('/assets/')
    || pathname === '/favicon.svg'
    || pathname === '/robots.txt';
}

router.get('/', async (c) => {
  if (!c.env.ASSETS?.fetch) return c.redirect('/#/login', 302);
  const domains = (c.env.MAIL_DOMAIN || 'temp.example.com').split(/[,\s]+/).map(d => d.trim()).filter(Boolean);
  const resp = await c.env.ASSETS.fetch(new Request(new URL('/index.html', c.req.url), c.req.raw));
  try {
    const text = await resp.text();
    const metaContent = domains.join(',');
    // 兼容自闭合 `content="" />` 与 `content="">` 两种写法
    return new Response(
      text.replace(/<meta\s+name="mail-domains"\s+content="[^"]*"\s*\/?>/i, `<meta name="mail-domains" content="${metaContent}">`),
      { headers: { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store, no-cache, must-revalidate, max-age=0' } }
    );
  } catch (_) {
    return resp;
  }
});

router.get('*', async (c) => {
  if (!c.env.ASSETS?.fetch) return c.notFound();
  const pathname = new URL(c.req.url).pathname;

  // 资源文件：直接由 Assets 托管，命中缓存策略
  if (isStaticAsset(pathname)) {
    return c.env.ASSETS.fetch(c.req.raw);
  }
  // 未命中的非 API 路径：回退到 SPA 入口，交由客户端处理
  const resp = await c.env.ASSETS.fetch(new Request(new URL('/index.html', c.req.url), c.req.raw));
  if (resp.status === 404) return c.notFound();
  return resp;
});

export default router;
