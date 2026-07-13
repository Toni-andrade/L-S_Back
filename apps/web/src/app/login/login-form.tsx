"use client";

import { useActionState, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  sendMagicLink,
  signInWithPassword,
  signUpWithPassword,
  type AuthFormState,
} from "./actions";

const initialState: AuthFormState = {};

type Mode = "signin" | "signup" | "magic";

export function LoginForm() {
  const [mode, setMode] = useState<Mode>("signin");
  const [signInState, signInAction, signInPending] = useActionState(
    signInWithPassword,
    initialState,
  );
  const [signUpState, signUpAction, signUpPending] = useActionState(
    signUpWithPassword,
    initialState,
  );
  const [magicState, magicAction, magicPending] = useActionState(sendMagicLink, initialState);

  const state = mode === "signin" ? signInState : mode === "signup" ? signUpState : magicState;
  const action = mode === "signin" ? signInAction : mode === "signup" ? signUpAction : magicAction;
  const pending = signInPending || signUpPending || magicPending;

  return (
    <Card>
      <CardContent className="pt-5">
        <div className="mb-4 grid grid-cols-3 rounded-lg bg-app-bg p-1 text-xs font-medium">
          {(
            [
              ["signin", "Sign in"],
              ["signup", "Create account"],
              ["magic", "Magic link"],
            ] as const
          ).map(([value, label]) => (
            <button
              key={value}
              type="button"
              onClick={() => setMode(value)}
              className={
                mode === value
                  ? "rounded-md bg-white px-2 py-1.5 text-royal shadow-sm"
                  : "rounded-md px-2 py-1.5 text-slate-500 hover:text-oxford"
              }
            >
              {label}
            </button>
          ))}
        </div>

        <form action={action} className="flex flex-col gap-3">
          {mode === "signup" ? (
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="name">Name</Label>
              <Input id="name" name="name" autoComplete="name" required />
            </div>
          ) : null}

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="email">Email</Label>
            <Input id="email" name="email" type="email" autoComplete="email" required />
          </div>

          {mode !== "magic" ? (
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="password">Password</Label>
              <Input
                id="password"
                name="password"
                type="password"
                autoComplete={mode === "signup" ? "new-password" : "current-password"}
                required
              />
            </div>
          ) : null}

          {state.error ? <p className="text-sm text-alert">{state.error}</p> : null}
          {state.message ? <p className="text-sm text-verde">{state.message}</p> : null}

          <Button type="submit" disabled={pending} className="mt-1">
            {pending
              ? "Working..."
              : mode === "signin"
                ? "Sign in"
                : mode === "signup"
                  ? "Create account"
                  : "Send magic link"}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}
