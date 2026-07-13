import Link from "next/link";
import { buttonVariants } from "@/components/ui/button";

export default function NotFound() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-3 bg-app-bg px-4 text-center">
      <h1 className="text-xl font-semibold text-oxford">Page not found</h1>
      <p className="text-sm text-slate-500">The page you are looking for does not exist.</p>
      <Link href="/" className={buttonVariants({ variant: "outline" })}>
        Back to Dashboard
      </Link>
    </main>
  );
}
