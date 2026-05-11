import { useEffect, useState } from "react";
import { Sun, Moon, Database, KeyRound } from "lucide-react";

import { AppShell, PageHeader } from "@/components/layout/AppShell";
import { Card } from "@/components/ui/card";
import { Label } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { applyTheme, getStoredTheme, type Theme } from "@/lib/theme";
import { NETWORK, PACKAGE_ID, WALRUS_USE_SDK } from "@/config";

export function SettingsPage() {
  const [theme, setTheme] = useState<Theme>(getStoredTheme());

  useEffect(() => {
    applyTheme(theme);
  }, [theme]);

  return (
    <AppShell>
      <PageHeader
        eyebrow="Settings"
        title="Settings"
        description="Theme, network, and Walrus upload behavior."
      />

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 max-w-4xl">
        <Card className="p-6">
          <Label>Appearance</Label>
          <p className="mt-1 text-sm text-muted-foreground">Light or dark theme. Persists across sessions.</p>
          <div className="mt-4 grid grid-cols-2 gap-3">
            {(["dark", "light"] as const).map((t) => (
              <button
                key={t}
                type="button"
                onClick={() => setTheme(t)}
                className={`rounded-xl border p-4 text-left transition-all ${
                  theme === t ? "border-primary bg-primary/8 ring-2 ring-primary/30" : "border-border hover:border-primary/30"
                }`}
              >
                {t === "dark" ? <Moon className="h-4 w-4" /> : <Sun className="h-4 w-4" />}
                <div className="mt-2 font-medium text-sm capitalize">{t}</div>
                <div className="mt-1 text-xs text-muted-foreground">
                  {t === "dark" ? "Default. Best on most screens." : "Bright. Good for daylight."}
                </div>
              </button>
            ))}
          </div>
        </Card>

        <Card className="p-6">
          <Label>Network</Label>
          <p className="mt-1 text-sm text-muted-foreground">Active Sui + Walrus network.</p>
          <div className="mt-4 flex items-center gap-2">
            <Badge tone="secondary">Sui {NETWORK}</Badge>
            <Badge tone="primary">Walrus testnet publisher</Badge>
          </div>
          <Label className="mt-6 block">Move package id</Label>
          <code className="mt-1 block font-mono text-xs text-muted-foreground break-all">
            {PACKAGE_ID === "0x0" ? "Not yet published — run `npm run publish:contracts`" : PACKAGE_ID}
          </code>
        </Card>

        <Card className="p-6 lg:col-span-2">
          <div className="flex items-start justify-between gap-4">
            <div>
              <Label>Walrus upload mode</Label>
              <p className="mt-1 text-sm text-muted-foreground max-w-xl">
                <strong>Publisher HTTP</strong> — fast, no wallet popups, publisher pays. Best for demos.
                <br />
                <strong>SDK + wallet</strong> — user pays own storage via writeFilesFlow. Stack-native, more popups.
              </p>
            </div>
            <Database className="h-6 w-6 text-primary/70 shrink-0" />
          </div>
          <div className="mt-4">
            <Badge tone={WALRUS_USE_SDK ? "primary" : "neutral"}>
              {WALRUS_USE_SDK ? "SDK + wallet" : "Publisher HTTP"}
            </Badge>
            <p className="mt-3 text-xs text-muted-foreground">
              Toggle by editing <code className="font-mono">app/src/config.ts</code>{" "}
              <code className="font-mono">WALRUS_USE_SDK</code>.
            </p>
          </div>
        </Card>

        <Card className="p-6 lg:col-span-2">
          <div className="flex items-start justify-between gap-4">
            <div>
              <Label>Seal session keys</Label>
              <p className="mt-1 text-sm text-muted-foreground max-w-xl">
                Session keys cache decryption permission per package for 10 minutes. Sign once, decrypt many.
              </p>
            </div>
            <KeyRound className="h-6 w-6 text-tertiary/70 shrink-0" />
          </div>
          <div className="mt-4 flex items-center gap-2">
            <Button variant="outline" size="sm">
              Clear session cache
            </Button>
          </div>
        </Card>
      </div>
    </AppShell>
  );
}
