import { Button, Dialog, Loader } from "@cloudflare/kumo";
import { ArrowSquareOutIcon, CopyIcon, DownloadSimpleIcon, TrashIcon } from "@phosphor-icons/react/dist/ssr";
import { useEffect, useState } from "react";
import { Api, ApiError, type EmailDetail } from "../lib/api";
import { fmtDate, copyText, safeHtmlFrame } from "../lib/utils";
import { toast } from "../lib/toast";

export function EmailViewer({
  emailId,
  open,
  onOpenChange,
  onDelete,
}: {
  emailId: number | string | null;
  open: boolean;
  onOpenChange: (v: boolean) => void;
  onDelete?: () => void;
}) {
  const [email, setEmail] = useState<EmailDetail | null>(null);
  const [loading, setLoading] = useState(false);
  const [tab, setTab] = useState<"html" | "text">("html");

  useEffect(() => {
    if (!open || emailId == null) return;
    setLoading(true);
    setEmail(null);
    setTab("html");
    Api.getEmail(emailId)
      .then((d) => {
        setEmail(d);
        if (!d.html_content) setTab("text");
      })
      .catch((e) => toast.error("加载失败", e instanceof ApiError ? e.message : String(e)))
      .finally(() => setLoading(false));
  }, [open, emailId]);

  async function copyCode() {
    if (!email?.verification_code) return;
    const ok = await copyText(email.verification_code);
    ok ? toast.success("验证码已复制") : toast.error("复制失败");
  }

  async function del() {
    if (emailId == null) return;
    try {
      await Api.deleteEmail(emailId);
      toast.success("已删除");
      onOpenChange(false);
      onDelete?.();
    } catch (e) {
      toast.error("删除失败", e instanceof ApiError ? e.message : String(e));
    }
  }

  const htmlBody = safeHtmlFrame(email?.html_content || "");
  const showHtml = tab === "html" && !!email?.html_content;

  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog size="xl" className="flex max-h-[88vh] flex-col p-0">
        {loading ? (
          <div className="flex items-center gap-2 p-10 text-kumo-subtle">
            <Loader /> <span>加载邮件…</span>
          </div>
        ) : email ? (
          <>
            <div className="border-b border-kumo-line p-5">
              <Dialog.Title className="text-lg font-semibold text-kumo-strong">{email.subject || "(无主题)"}</Dialog.Title>
              <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-kumo-subtle">
                <span><span className="text-kumo-default">发件人：</span>{email.sender}</span>
                {email.to_addrs?.includes(",") ? <span><span className="text-kumo-default">收件人：</span>{email.to_addrs}</span> : null}
                <span>{fmtDate(email.received_at)}</span>
                {email.verification_code ? (
                  <Button variant="secondary" size="sm" icon={<CopyIcon className="h-4 w-4" />} onClick={copyCode}>
                    验证码：{email.verification_code}
                  </Button>
                ) : null}
              </div>
            </div>
            <div className="flex items-center gap-1 border-b border-kumo-line px-4 pt-2">
              {email.html_content ? (
                <Button variant={tab === "html" ? "primary" : "ghost"} size="sm" onClick={() => setTab("html")}>渲染</Button>
              ) : null}
              <Button variant={tab === "text" ? "primary" : "ghost"} size="sm" onClick={() => setTab("text")}>纯文本</Button>
              <div className="ml-auto mb-2 flex items-center gap-1">
                {email.download ? (
                  <a href={Api.downloadUrl(email.id)} target="_blank" rel="noopener noreferrer">
                    <Button variant="ghost" size="sm" shape="square" aria-label="下载 EML" title="下载 EML">
                      <DownloadSimpleIcon className="h-4 w-4" />
                    </Button>
                  </a>
                ) : null}
                {onDelete ? (
                  <Button variant="secondary-destructive" size="sm" icon={<TrashIcon className="h-4 w-4" />} onClick={del}>删除</Button>
                ) : null}
              </div>
            </div>
            <div className="min-h-0 flex-1 overflow-auto p-5 text-sm text-kumo-default">
              {showHtml ? (
                <div
                  className="prose prose-sm max-w-none dark:prose-invert"
                  // eslint-disable-next-line react/no-danger
                  dangerouslySetInnerHTML={{ ...htmlBody, __html: `<base target="_blank">${htmlBody.__html}` }}
                />
              ) : (
                <pre className="whitespace-pre-wrap break-words font-sans text-sm text-kumo-default">
                  {email.content || email.preview || "(无正文)"}
                </pre>
              )}
            </div>
            <div className="flex items-center justify-end border-t border-kumo-line p-3">
              <Dialog.Close render={(p) => <Button variant="ghost" {...p}>关闭</Button>} />
            </div>
          </>
        ) : (
          <div className="p-10 text-center text-kumo-subtle">未找到邮件</div>
        )}
      </Dialog>
    </Dialog.Root>
  );
}
