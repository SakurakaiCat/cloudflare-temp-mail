/**
 * 会话认证 + 浏览器端 fetch 封装。
 * 后端使用同源 Cookie（iding-session）做会话认证；所有请求自动带 credentials。
 */

export type Session = {
  authenticated: boolean;
  role: "admin" | "guest" | "user" | "mailbox" | string;
  username: string;
  strictAdmin: boolean;
  mailboxAddress?: string;
  viaApiKey?: boolean;
  scopes?: string[];
};

export class ApiError extends Error {
  status: number;
  body: unknown;
  constructor(message: string, status: number, body: unknown) {
    super(message);
    this.status = status;
    this.body = body;
  }
}

const JSON_RE = /^application\/json/i;

async function request<T = unknown>(
  input: string,
  init: RequestInit = {},
): Promise<T> {
  const headers = new Headers(init.headers || {});
  if (init.body && typeof init.body === "string" && !headers.has("Content-Type")) {
    headers.set("Content-Type", "application/json");
  }
  headers.set("Accept", "application/json");

  let res: Response;
  try {
    res = await fetch(input, { ...init, headers, credentials: "include" });
  } catch (e) {
    throw new ApiError("网络错误：" + String(e), 0, null);
  }

  const ct = res.headers.get("Content-Type") || "";
  let body: unknown = null;
  if (JSON_RE.test(ct)) {
    body = await res.json().catch(() => null);
  } else {
    body = await res.text().catch(() => null);
  }

  if (!res.ok) {
    if (res.status === 401) {
      // 会话失效：跳登录页。避免在 #/login 自身无限重定向。
      const hash = window.location.hash.replace(/^#/, "");
      if (hash !== "/login") {
        window.location.hash = "/login";
      }
    }
    let msg = `请求失败 (${res.status})`;
    if (body && typeof body === "object" && "error" in (body as Record<string, unknown>)) {
      const e = (body as { error: unknown }).error;
      if (typeof e === "string") msg = e;
    } else if (typeof body === "string" && body) {
      msg = body;
    }
    throw new ApiError(msg, res.status, body);
  }
  return body as T;
}

export const api = {
  get: <T = unknown>(url: string) => request<T>(url, { method: "GET" }),
  post: <T = unknown>(url: string, body?: unknown) =>
    request<T>(url, { method: "POST", body: body === undefined ? undefined : JSON.stringify(body) }),
  patch: <T = unknown>(url: string, body?: unknown) =>
    request<T>(url, { method: "PATCH", body: body === undefined ? undefined : JSON.stringify(body) }),
  put: <T = unknown>(url: string, body?: unknown) =>
    request<T>(url, { method: "PUT", body: body === undefined ? undefined : JSON.stringify(body) }),
  del: <T = unknown>(url: string) => request<T>(url, { method: "DELETE" }),
};

// 语义化端点封装 ----------------------------------------------------------

export const Auth = {
  session: () => api.get<Session>("/api/session"),
  login: (username: string, password: string) =>
    api.post<{ success?: boolean; role?: string; mailbox?: string }>("/api/login", { username, password }),
  logout: () => api.post("/api/logout"),
};

export type Domain = string;

export type Mailbox = {
  id: number;
  address: string;
  created_at?: string;
  is_pinned?: number | boolean;
  is_favorite?: number | boolean;
  password_is_default?: number | boolean;
  can_login?: number | boolean;
  forward_to?: string | null;
};

export type GenerateResult = {
  email: string;
  expires?: number;
  mailbox?: {
    id: number;
    address: string;
    is_favorite: boolean;
    forward_to: string | null;
    can_login: boolean;
  };
};

export type EmailListItem = {
  id: number;
  sender: string;
  to_addrs?: string;
  subject: string;
  received_at: string;
  is_read?: number | boolean;
  preview?: string | null;
  verification_code?: string | null;
};

export type EmailDetail = EmailListItem & {
  content?: string;
  html_content?: string;
  r2_bucket?: string;
  r2_object_key?: string;
  download?: string;
};

export type SentEmail = {
  id: number;
  resend_id?: string | null;
  to_addrs?: string;
  recipients?: string;
  subject: string;
  status: string;
  created_at: string;
  provider?: string;
  html_content?: string;
  text_content?: string;
  from_name?: string | null;
  from_addr?: string;
};

export type ApiKeyListItem = {
  id: number;
  name: string;
  prefix: string;
  scopes: string;
  created_at: string;
  last_used_at: string | null;
  expires_at: string | null;
  revoked: number | boolean;
};

export type ApiKeyCreated = ApiKeyListItem & {
  key: string;
};

export type UserRow = {
  id: number;
  username: string;
  role: string;
  can_send?: number | boolean;
  mailbox_limit: number;
  created_at?: string;
  mailbox_count?: number;
};

export type Quota = {
  limit: number;
  used: number;
  remaining: number;
  note?: string;
};

export const Api = {
  domains: () => api.get<Domain[]>("/api/domains"),

  // 邮箱
  generate: (length: number, domainIndex: number) =>
    api.get<GenerateResult>(`/api/generate?length=${length}&domainIndex=${domainIndex}`),
  create: (local: string, domainIndex: number) =>
    api.post<GenerateResult>("/api/create", { local, domainIndex }),
  listMailboxes: (params: Record<string, string | number> = {}) => {
    const q = new URLSearchParams();
    for (const [k, v] of Object.entries(params)) q.set(k, String(v));
    return api.get<{ list: Mailbox[]; total: number }>(`/api/mailboxes?${q.toString()}`);
  },
  mailboxInfo: (address: string) =>
    api.get<{ id: number; address: string; is_favorite: boolean; forward_to: string | null; can_login: boolean }>(
      `/api/mailbox/info?address=${encodeURIComponent(address)}`,
    ),
  deleteMailbox: (address: string) => api.del(`/api/mailboxes?address=${encodeURIComponent(address)}`),
  pinMailbox: (address: string) =>
    api.post(`/api/mailboxes/pin?address=${encodeURIComponent(address)}`),
  setForward: (mailbox_id: number, forward_to: string | null) =>
    api.post("/api/mailbox/forward", { mailbox_id, forward_to }),
  toggleFavorite: (mailbox_id: number) => api.post("/api/mailbox/favorite", { mailbox_id }),
  batchFavoriteByAddress: (addresses: string[], is_favorite: boolean) =>
    api.post("/api/mailboxes/batch-favorite-by-address", { addresses, is_favorite }),
  batchForwardByAddress: (addresses: string[], forward_to: string | null) =>
    api.post("/api/mailboxes/batch-forward-by-address", { addresses, forward_to }),
  batchToggleLogin: (addresses: string[], can_login: boolean) =>
    api.post("/api/mailboxes/batch-toggle-login", { addresses, can_login }),
  resetMailboxPassword: (address: string) =>
    api.post(`/api/mailboxes/reset-password?address=${encodeURIComponent(address)}`),
  changeMailboxPassword: (address: string, new_password: string) =>
    api.post("/api/mailboxes/change-password", { address, new_password }),

  // 邮件
  listEmails: (mailbox: string, limit = 50) =>
    api.get<EmailListItem[]>(`/api/emails?mailbox=${encodeURIComponent(mailbox)}&limit=${limit}`),
  getEmail: (id: number | string) => api.get<EmailDetail>(`/api/email/${id}`),
  deleteEmail: (id: number | string) => api.del(`/api/email/${id}`),
  clearEmails: (mailbox: string) => api.del(`/api/emails?mailbox=${encodeURIComponent(mailbox)}`),
  markRead: (id: number | string) => api.post(`/api/email/${id}/read`) as Promise<unknown>,
  downloadUrl: (id: number | string) => `/api/email/${id}/download`,

  // 发件
  listSent: (from: string) => api.get<SentEmail[]>(`/api/sent?from=${encodeURIComponent(from)}`),
  getSent: (id: number | string) => api.get<SentEmail>(`/api/sent/${id}`),
  deleteSent: (id: number | string) => api.del(`/api/sent/${id}`),
  send: (payload: { from: string; to: string; subject: string; html?: string; text?: string; fromName?: string }) =>
    api.post<{ success: boolean; id?: string; provider?: string }>("/api/send", payload),

  // 配额
  quota: () => api.get<Quota>("/api/user/quota"),

  // 用户
  listUsers: (page = 1, size = 50) =>
    api.get<{ list: UserRow[]; total: number; total_mailboxes: number; admin_count: number; active_count: number }>(
      `/api/users?page=${page}&size=${size}`,
    ),
  createUser: (body: { username: string; password?: string; role?: string; mailboxLimit?: number }) =>
    api.post<UserRow>("/api/users", body),
  updateUser: (id: number, body: Record<string, unknown>) => api.patch(`/api/users/${id}`, body),
  deleteUser: (id: number) => api.del(`/api/users/${id}`),
  assignMailbox: (username: string, address: string) =>
    api.post("/api/users/assign", { username, address }),
  unassignMailbox: (username: string, address: string) =>
    api.post("/api/users/unassign", { username, address }),
  userMailboxes: (id: number) => api.get<Mailbox[]>(`/api/users/${id}/mailboxes`),

  // 邮箱角色
  changeOwnPassword: (currentPassword: string, newPassword: string) =>
    api.put("/api/mailbox/password", { currentPassword, newPassword }),

  // API Key
  listApiKeys: () => api.get<ApiKeyListItem[]>("/api/apikeys"),
  createApiKey: (body: { name: string; scopes: string[]; expires_at?: string | null }) =>
    api.post<ApiKeyCreated>("/api/apikeys", body),
  deleteApiKey: (id: number) => api.del(`/api/apikeys/${id}`),
};
