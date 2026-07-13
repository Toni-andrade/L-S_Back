import { ShieldAlert } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";

export default function PendingActivationPage() {
  return (
    <main className="flex min-h-screen items-center justify-center bg-app-bg px-4">
      <Card className="w-full max-w-md">
        <CardContent className="flex flex-col items-center gap-3 py-10 text-center">
          <div className="flex h-11 w-11 items-center justify-center rounded-full bg-celeste/10">
            <ShieldAlert className="h-5 w-5 text-royal" />
          </div>
          <h1 className="text-lg font-semibold text-oxford">Account pending activation</h1>
          <p className="text-sm text-slate-500">
            Your account was created but has not been activated yet. An L&amp;S admin
            needs to activate it before you can access the platform.
          </p>
          <form action="/auth/signout" method="post" className="mt-2">
            <Button variant="outline" type="submit">
              Sign out
            </Button>
          </form>
        </CardContent>
      </Card>
    </main>
  );
}
