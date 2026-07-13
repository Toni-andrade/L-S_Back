import { LoginForm } from "./login-form";

export default function LoginPage() {
  return (
    <main className="flex min-h-screen items-center justify-center bg-app-bg px-4">
      <div className="w-full max-w-sm">
        <div className="mb-8 text-center">
          <div className="text-2xl font-semibold tracking-tight text-oxford">
            L<span className="italic text-celeste">&amp;</span>S
          </div>
          <p className="mt-1 text-sm text-slate-500">
            Investment Advisors, internal backoffice
          </p>
        </div>
        <LoginForm />
        <p className="mt-6 text-center text-xs text-slate-400">
          Access is restricted to allowlisted L&amp;S staff. New accounts require
          admin activation.
        </p>
      </div>
    </main>
  );
}
