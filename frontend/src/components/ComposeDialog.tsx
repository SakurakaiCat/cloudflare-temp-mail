import { Button, Dialog, Field, Input, Textarea } from "@cloudflare/kumo";
import { PaperPlaneTiltIcon } from "@phosphor-icons/react/dist/ssr";
import { useState } from "react";
import { Api, type Domain } from "../lib/api";
import { useAuth } from "../lib/auth";
import { toast } from "../lib/toast";

export function ComposeDialog({
  open,
  onOpenChange,
  from,
  domains,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  from: string;
  domains: Domain[];
}) {
  const { session } = useAuth();
  const [to, setTo] = useState("");
  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");
  const [fromName, setFromName] = useState("");
  const [loading, setLoading] = useState(false);

  const canSend = !!(session && (session.strictAdmin || session.role === "admin"));
  if (!canSend) return null;

  const fromDomain = domains.find((d) => from.endsWith("@" + d)) || domains[0];

  async function send() {
    if (!to || !subject) {
      toast.warning("请填写收件人和主题");
      return;
    }
    setLoading(true);
    try {
      await Api.send({
        from,
        to,
        subject,
        html: body,
        text: body.replace(/<[^>]+>/g, ""),
        fromName: fromName || undefined,
      });
      toast.success("邮件已发送");
      onOpenChange(false);
      setTo("");
      setSubject("");
      setBody("");
      setFromName("");
    } catch (e) {
      toast.error("发送失败", String((e as Error).message));
    } finally {
      setLoading(false);
    }
  }

  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog size="lg" className="p-6">
        <Dialog.Title className="text-lg font-semibold text-kumo-strong px-6 pt-6">写邮件</Dialog.Title>
        <div className="flex flex-col gap-3 p-6">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <Field label="发件人">
              <Input value={from} disabled />
            </Field>
            <Field label="发件人名称（可选）">
              <Input value={fromName} onChange={(e) => setFromName((e.target as HTMLInputElement).value)} placeholder={fromDomain || ""} />
            </Field>
          </div>
          <Field label="收件人">
            <Input value={to} onChange={(e) => setTo((e.target as HTMLInputElement).value)} placeholder="someone@example.com" />
          </Field>
          <Field label="主题">
            <Input value={subject} onChange={(e) => setSubject((e.target as HTMLInputElement).value)} />
          </Field>
          <Field label="正文（HTML）">
            <Textarea
              value={body}
              onValueChange={setBody}
              minRows={8}
              placeholder="<h1>标题</h1>\n<p>正文…</p>"
            />
          </Field>
        </div>
        <div className="flex justify-end gap-2 border-t border-kumo-line p-4">
          <Dialog.Close render={(p) => <Button variant="ghost" {...p}>取消</Button>} />
          <Button variant="primary" icon={<PaperPlaneTiltIcon className="h-4 w-4" />} loading={loading} onClick={send}>
            发送
          </Button>
        </div>
      </Dialog>
    </Dialog.Root>
  );
}
