"use client";

import { useRef } from "react";
import { Button } from "@/components/ui/button";
import { commentTicket } from "@/lib/actions/tickets";

const fieldClass =
  "w-full rounded-lg border border-hairline bg-white px-3 py-2 text-sm text-oxford focus:border-royal focus:outline-none";

export function CommentBox({
  ticketId,
  canned,
}: {
  ticketId: string;
  canned: { id: string; title: string; body: string }[];
}) {
  const textareaRef = useRef<HTMLTextAreaElement>(null);

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
      <div className="flex justify-end">
        <Button type="submit" variant="outline">
          Comment
        </Button>
      </div>
    </form>
  );
}
