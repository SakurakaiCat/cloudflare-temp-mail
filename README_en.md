# Cloudflare Temp Mail

[![Deploy to Cloudflare Workers](https://deploy.workers.cloudflare.com/button)](https://deploy.workers.cloudflare.com/?url=https://github.com/ShinozakiKasumi/cloudflare-temp-mail)

🌐 English | 🇨🇳 [中文](README.md)

An open-source temporary email service with a decoupled frontend/backend, built on **Cloudflare Workers + D1 + R2 + Email Routing**. Supports receiving, sending and forwarding email, multiple domains, user management and a RESTful API. The frontend is a React + @cloudflare/kumo SPA.

> This project is derived from [idinging/freemail](https://github.com/idinging/freemail) (Apache-2.0). Since V6 the frontend has been fully rewritten and API Key authentication was added.

## Features

| Category | Features |
|----------|----------|
| 📧 **Mailbox Management** | Random temp mailboxes · multi-domain support · pin/favorite · history · search |
| 💌 **Mail** | Real-time receiving · auto refresh · smart verification-code extraction · HTML/plain text · forwarding |
| ✉️ **Sending** | Multi-provider sending (Resend / SendFlare / Cyberpersons) · automatic routing by sender domain |
| 🔑 **API Keys** | Issue keys for agents / external tools to read mail and manage mailboxes (read/create/manage scopes, no sending) |
| 🎨 **Frontend** | React + @cloudflare/kumo · dark mode · responsive SPA |
| ⚡ **Stack** | Cloudflare Workers · D1 database · R2 storage · Email Routing |

> Mailboxes are created automatically on incoming mail. Forwarding target addresses must first be verified under Cloudflare Email Routing → Destination addresses.

## Screenshots

| Home | All Mailboxes |
|------|---------------|
| ![Home](./pic/light/shouye.png) | ![All Mailboxes](./pic/light/suoyouyouxiang.png) |

| User Management | Single Mailbox Login |
|-----------------|----------------------|
| ![User Management](./pic/light/yonghuguanli.png) | ![Single Mailbox Login](./pic/dange邮箱登录.png) |

[Light mode gallery](docs/zhanshi-light.md) | [Dark mode gallery](docs/zhanshi-dark.md)

## Docs

📖 **[One-click Deploy Guide](docs/yijianbushu.md)** | 🤖 **[GitHub Actions Deploy Guide](docs/action-deployment.md)** | 📚 **[API Documentation](docs/api.md)** | 🔄 **[Many-in-One Forwarding Research](docs/multi-inbox-forwarding.md)**

Sending providers: 📬 [Resend](docs/resend.md) · 🚀 [SendFlare](docs/sendflare.md) · ☁️ [Cyberpersons](docs/cyberpersons.md)

## Quick Deploy

1. **One-click deploy**: click the Deploy button above and follow the [deploy guide](docs/yijianbushu.md)
2. **Configure Email Routing** (required for receiving): Cloudflare dashboard → your domain → Email Routing → Catch-all → bind to this Worker
3. **Configure sending** (optional): see the provider guides above; all three providers can be enabled at the same time

> When deploying via Git integration, set environment variables manually in Workers → Settings → Variables.

### Environment Variables

| Variable | Description | Required |
|----------|-------------|----------|
| TEMP_MAIL_DB | D1 database binding | Yes |
| MAIL_EML | R2 bucket binding | Yes |
| MAIL_DOMAIN | Mail domains, comma-separated | Yes |
| ADMIN_PASSWORD | Admin password | Yes |
| ADMIN_NAME | Admin username (default `admin`) | No |
| JWT_TOKEN | JWT signing secret | Yes |
| RESEND_API_KEY | Resend API key, supports per-domain config | No |
| SENDFLARE_API_KEY | SendFlare API key, same format as Resend | No |
| CYBERPERSONS_API_KEY | Cyberpersons API key, same format as Resend | No |
| FORWARD_RULES | Email forwarding rules | No |
| GUEST_PASSWORD | Guest demo password | No |
| SESSION_EXPIRE_DAYS | Session validity in days | No |

Upload `ADMIN_PASSWORD` and `JWT_TOKEN` with `npx wrangler secret put <NAME>`; do not commit them to `wrangler.toml`.

## Local Development

Local development is great for debugging the frontend, admin APIs and sending logic. Real inbound mail depends on Cloudflare Email Routing and can only be fully tested after deployment.

1. **Install dependencies**

```bash
npm install
```

2. **Configure local variables**

Adjust `[vars]`, the D1 and R2 bindings in `wrangler.toml`, or create a `.dev.vars` file in the project root (ignored by .gitignore):

```bash
ADMIN_NAME=admin
ADMIN_PASSWORD=your_admin_password
JWT_TOKEN=your_random_jwt_secret
MAIL_DOMAIN=example.com
```

3. **Initialize the local D1 database**

```bash
npx wrangler d1 execute mail-free-db --local --file=./d1-init.sql
```

If you changed `database_name` in `wrangler.toml`, replace `mail-free-db` above with your database name.

4. **Start the dev server**

The frontend is a standalone Vite + React app (`frontend/`) built into `public/`, which the Worker serves. One-command startup (build frontend, then run wrangler):

```bash
npm run dev      # = npm run build:frontend && wrangler dev
```

For frontend hot reload, run two terminals: A) `npx wrangler dev` for the backend, B) `npm install && npm run dev` inside `frontend/` (Vite dev server, `/api` proxied to `127.0.0.1:8787`).

Open the local URL printed by Wrangler. The default admin account is `admin` with password `ADMIN_PASSWORD`.

## Project Structure

```
├── src/               # Worker backend (Hono)
│   ├── api/           # REST API (mailboxes / messages / users / API keys / sending)
│   ├── db/            # D1 data access layer
│   ├── email/         # Inbound handling, forwarding and sending providers (providers/)
│   ├── middleware/    # Auth and app middleware
│   └── routes/        # Routes and static assets
├── frontend/          # Vite + React + @cloudflare/kumo frontend
├── docs/              # Deployment, API, provider and forwarding docs
├── security/          # Security regression scripts
├── d1-init.sql        # D1 schema initialization
└── wrangler.toml      # Cloudflare configuration
```

## Troubleshooting

1. **Not receiving mail**: check Email Routing, MX records and the MAIL_DOMAIN variable
2. **Database errors**: make sure the D1 binding is named `TEMP_MAIL_DB` and database_id is correct
3. **Login problems**: make sure ADMIN_PASSWORD and JWT_TOKEN are set; clear browser cache
4. **Broken UI**: check static asset paths and browser console errors

```bash
# Live logs
wrangler tail

# Inspect the database
wrangler d1 execute TEMP_MAIL_DB --command "SELECT * FROM mailboxes LIMIT 10"
```

## Notes

- **Static asset caching**: after updates, Purge Everything in the Cloudflare dashboard and hard-refresh the browser
- **R2/D1 usage**: free-tier limits apply; clean up expired mail regularly
- **Security**: always change the default `ADMIN_PASSWORD` and `JWT_TOKEN` in production

## Acknowledgements

- Original project: [idinging/freemail](https://github.com/idinging/freemail)
- Thanks to [sarsanta](https://github.com/sarsanta) for the GitHub Actions auto-deployment
- Thanks to [oxygen](https://github.com/daimiaopeng) for the privilege-escalation report and fix

## License

Apache-2.0 license
