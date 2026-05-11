import { Link } from "react-router-dom";
import { Plus, Globe, Lock, Clock, Coins, ArrowUpRight } from "lucide-react";

import { AppShell, PageHeader } from "@/components/layout/AppShell";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge, StatusDot } from "@/components/ui/badge";
import { relativeTime } from "@/lib/utils";

type PolicyKind = "public" | "allowlist" | "timelock" | "tokenGated";

interface FormSummary {
  id: string;
  title: string;
  policy: PolicyKind;
  open: boolean;
  submissions: number;
  newSubmissions: number;
  lastSubmittedAt: number | null;
}

const DEMO_FORMS: FormSummary[] = [
  {
    id: "0x1::form::bug",
    title: "Bug Reports",
    policy: "allowlist",
    open: true,
    submissions: 42,
    newSubmissions: 6,
    lastSubmittedAt: Date.now() - 1000 * 60 * 18,
  },
  {
    id: "0x1::form::nps",
    title: "Q2 NPS Survey",
    policy: "public",
    open: true,
    submissions: 128,
    newSubmissions: 12,
    lastSubmittedAt: Date.now() - 1000 * 60 * 60 * 4,
  },
  {
    id: "0x1::form::roadmap",
    title: "Sealed Roadmap Vote",
    policy: "timelock",
    open: true,
    submissions: 19,
    newSubmissions: 0,
    lastSubmittedAt: Date.now() - 1000 * 60 * 60 * 26,
  },
  {
    id: "0x1::form::grants",
    title: "Grants Application",
    policy: "tokenGated",
    open: false,
    submissions: 7,
    newSubmissions: 0,
    lastSubmittedAt: Date.now() - 1000 * 60 * 60 * 24 * 11,
  },
];

const POLICY_META: Record<PolicyKind, { label: string; tone: "neutral" | "primary" | "secondary" | "tertiary"; icon: React.ReactNode }> = {
  public: { label: "Public", tone: "neutral", icon: <Globe className="h-3 w-3" /> },
  allowlist: { label: "Allowlist", tone: "secondary", icon: <Lock className="h-3 w-3" /> },
  timelock: { label: "Time-locked", tone: "tertiary", icon: <Clock className="h-3 w-3" /> },
  tokenGated: { label: "Token-gated", tone: "primary", icon: <Coins className="h-3 w-3" /> },
};

export function DashboardPage() {
  return (
    <AppShell
      action={
        <Link to="/builder">
          <Button leftIcon={<Plus className="h-4 w-4" />}>New form</Button>
        </Link>
      }
    >
      <PageHeader
        eyebrow="Forms"
        title="Your forms"
        description="Create, share, and triage feedback. Submissions live on Walrus, gated by Seal."
      />

      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-5">
        <Link to="/builder">
          <Card className="h-full min-h-[220px] flex items-center justify-center text-center p-8 border-dashed hover:border-primary/40 hover:scale-[1.01]">
            <div className="flex flex-col items-center gap-2 text-muted-foreground">
              <div className="h-10 w-10 rounded-full bg-primary/10 text-primary flex items-center justify-center">
                <Plus className="h-5 w-5" />
              </div>
              <div className="font-serif italic text-xl text-foreground">New form</div>
              <p className="text-sm">Start blank or pick a template</p>
            </div>
          </Card>
        </Link>

        {DEMO_FORMS.map((f) => (
          <FormCard key={f.id} form={f} />
        ))}
      </div>
    </AppShell>
  );
}

function FormCard({ form }: { form: FormSummary }) {
  const meta = POLICY_META[form.policy];
  return (
    <Link to={`/admin/${encodeURIComponent(form.id)}`}>
      <Card className="h-full min-h-[220px] p-6 flex flex-col justify-between hover:scale-[1.01] hover:border-primary/30 group">
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-center gap-2">
            <StatusDot tone={form.open ? "secondary" : "muted"} />
            <h3 className="font-serif italic text-2xl tracking-tight">{form.title}</h3>
          </div>
          <Badge tone={meta.tone} icon={meta.icon}>
            {meta.label}
          </Badge>
        </div>

        <div className="mt-6 flex items-end justify-between">
          <div>
            <div className="eyebrow">
              {form.submissions} submissions
              {form.newSubmissions > 0 && (
                <span className="ml-1.5 text-primary">· {form.newSubmissions} new</span>
              )}
            </div>
            <div className="mt-1 font-mono text-xs text-muted-foreground">
              {form.lastSubmittedAt ? `Last ${relativeTime(form.lastSubmittedAt)}` : "No submissions yet"}
            </div>
          </div>
          <ArrowUpRight className="h-5 w-5 text-muted-foreground/60 group-hover:text-primary group-hover:-translate-y-0.5 group-hover:translate-x-0.5 transition-all" />
        </div>
      </Card>
    </Link>
  );
}
