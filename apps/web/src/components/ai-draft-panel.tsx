"use client";

import { Sparkles } from "lucide-react";
import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

type Draft = { text?: string; error?: string };

/**
 * Generic "generate a draft" panel. The bound server action gathers grounded
 * context and returns the draft; the user edits and copies it. Nothing is
 * sent or saved automatically.
 */
export function AiDraftPanel({
  title,
  description,
  action,
  rows = 8,
}: {
  title: string;
  description: string;
  action: () => Promise<Draft>;
  rows?: number;
}) {
  const [text, setText] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [pending, startTransition] = useTransition();

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-slate-500">
          <Sparkles className="h-3.5 w-3.5 text-royal" /> {title}
        </CardTitle>
        <p className="text-xs text-slate-400">{description}</p>
      </CardHeader>
      <CardContent className="flex flex-col gap-2">
        {text ? (
          <>
            <textarea
              value={text}
              onChange={(e) => setText(e.target.value)}
              rows={rows}
              className="w-full rounded-lg border border-hairline bg-white px-3 py-2 text-sm text-oxford focus:border-royal focus:outline-none"
              aria-label={title}
            />
            <div className="flex items-center gap-2">
              <Button
                type="button"
                size="sm"
                variant="outline"
                onClick={async () => {
                  await navigator.clipboard.writeText(text);
                  setCopied(true);
                  setTimeout(() => setCopied(false), 2000);
                }}
              >
                {copied ? "Copied" : "Copy"}
              </Button>
              <Button
                type="button"
                size="sm"
                variant="ghost"
                disabled={pending}
                onClick={() =>
                  startTransition(async () => {
                    const r = await action();
                    if (r.error) setError(r.error);
                    else if (r.text) {
                      setError(null);
                      setText(r.text);
                    }
                  })
                }
              >
                {pending ? "Generating…" : "Regenerate"}
              </Button>
            </div>
          </>
        ) : (
          <Button
            type="button"
            size="sm"
            disabled={pending}
            onClick={() =>
              startTransition(async () => {
                const r = await action();
                if (r.error) setError(r.error);
                else if (r.text) {
                  setError(null);
                  setText(r.text);
                }
              })
            }
          >
            {pending ? "Generating…" : "Generate draft"}
          </Button>
        )}
        {error ? <p className="text-xs text-alert">{error}</p> : null}
        <p className="text-xs text-slate-400">
          Draft only. Review and edit before any client contact; generation is audit-logged.
        </p>
      </CardContent>
    </Card>
  );
}
