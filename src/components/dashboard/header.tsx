import { TrendingUp } from "lucide-react";
import { Button } from "@/components/ui/button";

export function DashboardHeader({ email }: { email: string }) {
  return (
    <header className="border-b border-border/60 bg-background/80 backdrop-blur">
      <div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-4 sm:px-6">
        <div className="flex items-center gap-3">
          <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-primary/15">
            <TrendingUp className="h-4 w-4 text-primary" />
          </div>
          <div className="leading-tight">
            <p className="text-4xl font-heading font-semibold tracking-tight leading-none">Dividend Tracker</p>
            <p className="hidden text-xs text-muted-foreground sm:block">{email}</p>
          </div>
        </div>
        <form action="/auth/signout" method="post">
          <Button type="submit" variant="ghost" size="sm" className="text-muted-foreground">
            Sign out
          </Button>
        </form>
      </div>
    </header>
  );
}
