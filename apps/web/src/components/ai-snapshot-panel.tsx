"use client";

import { Sparkles } from "lucide-react";
import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

type Draft = { text?: string; cached?: boolean; error?: string };

/**
 * Daily/weekly AI briefing panel. Cached content renders instantly; Generate
 * builds today's briefing (with live web search), Regenerate forces a fresh
 * one. Content is an internal draft, never sent anywhere automatically.
 */
export function AiSnapshotPanel({
  title,
  description,
  initial,
  action,
}: {
  title: string;
  description: string;
  initial: { content: string; updated_at: string } | null;
  action: (force: boolean) => Promise<Draft>;
}) {
  const [text, setText] = useState(initial?.content ?? "");
  const [updatedAt, setUpdatedAt] = useState(initial?.updated_at ?? null);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function run(force: boolean) {
    startTransition(async () => {
      const r = await action(force);
      if (r.error) setError(r.error);
      else if (r.text) {
        setError(null);
        setText(r.text);
        setUpdatedAt(new Date().toISOString());
      }
    });
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center justify-between">
          <span className="flex items-center gap-2">
            <Sparkles className="h-4 w-4 text-royal" /> {title}
          </span>
          <span className="flex items-center gap-2">
            {updatedAt ? (
              <span className="text-xs font-normal text-slate-400">
                {new Date(updatedAt).toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit" })}
              </span>
            ) : null}
            <Button type="button" size="sm" variant={text ? "ghost" : "primary"} disabled={pending} onClick={() => run(Boolean(text))}>
              {pending ? "Generating…" : text ? "Regenerate" : "Generate"}
            </Button>
          </span>
        </CardTitle>
        <p className="text-xs text-slate-400">{description}</p>
      </CardHeader>
      {text || error ? (
        <CardContent>
          {error ? <p className="mb-2 text-xs text-alert">{error}</p> : null}
          {text ? (
            <div className="whitespace-pre-wrap text-sm leading-relaxed text-slate-700">{text}</div>
          ) : null}
          <p className="mt-3 text-xs text-slate-400">
            Internal draft with live-searched market context; verify sources before repeating a
            market claim to a client. Generation is audit-logged.
          </p>
        </CardContent>
      ) : null}
    </Card>
  );
}
