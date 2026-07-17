"use client";

import { Sparkles } from "lucide-react";
import { useRef, useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { suggestTicketReply } from "@/lib/actions/ai";
import { commentTicket } from "@/lib/actions/tickets";

const fieldClass =
  "w-full rounded-lg border border-hairline bg-white px-3 py-2 text-sm text-oxford focus:border-royal focus:outline-none";

export function CommentBox({
  ticketId,
  canned,
  aiEnabled = false,
}: {
  ticketId: string;
  canned: { id: string; title: string; body: string }[];
  aiEnabled?: boolean;
}) {
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const [aiError, setAiError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  return (
    <form action={commentTicket} className="mt-4 flex flex-col gap-2">
      <input type="hidden" name="id" value={ticketId} />
      {canned.length > 0 ? (
        <select
          defaultValue=""
          onChange={(e) => {
            const c = canned.find((x) => x.id === e.target.value);
            if (c && textareaRef.current) textareaRef.current.value = c.body;
            e.target.value = "";
          }}
          className={fieldClass}
          aria-label="Insert canned response"
        >
          <option value="" disabled>
            Insert canned response…
          </option>
          {canned.map((c) => (
            <option key={c.id} value={c.id}>
              {c.title}
            </option>
          ))}
        </select>
      ) : null}
      <textarea name="body" required rows={3} placeholder="Add a comment…" ref={textareaRef} className={fieldClass} />
      {aiError ? <p className="text-xs text-alert">{aiError}</p> : null}
      <div className="flex items-center justify-end gap-2">
        {aiEnabled ? (
          <Button
            type="button"
            variant="ghost"
            disabled={pending}
            onClick={() =>
              startTransition(async () => {
                const r = await suggestTicketReply(ticketId);
                if (r.error) setAiError(r.error);
                else if (r.text && textareaRef.current) {
                  setAiError(null);
                  textareaRef.current.value = r.text;
                }
              })
            }
          >
            <Sparkles className="mr-1 h-3.5 w-3.5" />
            {pending ? "Drafting…" : "Suggest reply"}
          </Button>
        ) : null}
        <Button type="submit" variant="outline">
          Comment
        </Button>
      </div>
    </form>
  );
}
