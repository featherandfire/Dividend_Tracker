"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { TrendingUp } from "lucide-react";

export default function LoginPage() {
  const router = useRouter();
  const supabase = createClient();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);

  async function signIn(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    setInfo(null);
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    setBusy(false);
    if (error) setError(error.message);
    else router.push("/");
  }

  async function signUp(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    setInfo(null);
    const { data, error } = await supabase.auth.signUp({ email, password });
    setBusy(false);
    if (error) setError(error.message);
    else if (data.session) router.push("/");
    else setInfo("Check your email to confirm your account, then sign in.");
  }

  return (
    <div className="flex min-h-svh items-center justify-center bg-background p-4">
      <div className="pointer-events-none absolute inset-x-0 top-0 h-64 bg-[radial-gradient(ellipse_at_top,oklch(0.68_0.22_22)/12%,transparent_70%)]" />
      <Card className="relative w-full max-w-sm border-0 shadow-2xl shadow-black/40">
        <CardHeader className="text-center">
          <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-2xl bg-primary/15">
            <TrendingUp className="h-5 w-5 text-primary" />
          </div>
          <CardTitle className="text-xl tracking-tight">Dividend Tracker</CardTitle>
          <CardDescription>Track your passive income</CardDescription>
        </CardHeader>
        <CardContent>
          <Tabs defaultValue="signin">
            <TabsList className="grid w-full grid-cols-2">
              <TabsTrigger value="signin">Sign in</TabsTrigger>
              <TabsTrigger value="signup">Sign up</TabsTrigger>
            </TabsList>
            <TabsContent value="signin">
              <form onSubmit={signIn} className="grid gap-3 pt-2">
                <Field id="si-email" label="Email" type="email" value={email} onChange={setEmail} />
                <Field id="si-password" label="Password" type="password" value={password} onChange={setPassword} />
                <Button type="submit" disabled={busy}>{busy ? "Signing in…" : "Sign in"}</Button>
              </form>
            </TabsContent>
            <TabsContent value="signup">
              <form onSubmit={signUp} className="grid gap-3 pt-2">
                <Field id="su-email" label="Email" type="email" value={email} onChange={setEmail} />
                <Field id="su-password" label="Password" type="password" value={password} onChange={setPassword} />
                <Button type="submit" disabled={busy}>{busy ? "Creating…" : "Create account"}</Button>
              </form>
            </TabsContent>
          </Tabs>
          {error && <p className="mt-3 text-sm text-destructive">{error}</p>}
          {info && <p className="mt-3 text-sm text-muted-foreground">{info}</p>}
        </CardContent>
      </Card>
    </div>
  );
}

function Field(props: { id: string; label: string; type: string; value: string; onChange: (v: string) => void }) {
  return (
    <div className="grid gap-1.5">
      <Label htmlFor={props.id}>{props.label}</Label>
      <Input
        id={props.id}
        type={props.type}
        value={props.value}
        onChange={(e) => props.onChange(e.target.value)}
        required
        autoComplete={props.type === "password" ? "current-password" : "email"}
      />
    </div>
  );
}
