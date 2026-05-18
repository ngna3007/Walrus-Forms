import { Link } from "react-router-dom";
import { FilePlus, Sparkles, Bug, Coins, Users2, Trophy } from "lucide-react";

import { AppShell, PageHeader } from "@/components/layout/AppShell";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { FORM_TEMPLATES, type FormTemplate } from "@/forms/templates";

const CATEGORY_ICON: Record<FormTemplate["category"], typeof Sparkles> = {
  feedback: Sparkles,
  bounty: Bug,
  grants: Coins,
  hiring: Users2,
  sessions: Trophy,
};

export function TemplatesPage() {
  return (
    <AppShell>
      <PageHeader
        eyebrow="Templates"
        title="Pick a starting point"
        description="Choose a template tuned for the use case, or start from a blank form."
      />

      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-5">
        <Link to="/builder?blank=1" className="block">
          <Card className="h-full min-h-[180px] flex flex-col justify-between p-6 border-dashed hover:border-primary/40 hover:scale-[1.01] transition-transform">
            <div className="flex items-center gap-2 text-primary">
              <FilePlus className="h-4 w-4" />
              <span className="text-xs uppercase tracking-widest">Custom</span>
            </div>
            <div className="mt-4">
              <div className="font-serif italic text-xl text-foreground">Blank form</div>
              <p className="mt-1 text-sm text-muted-foreground">
                Start from scratch and compose every field yourself.
              </p>
            </div>
          </Card>
        </Link>

        {FORM_TEMPLATES.map((template) => {
          const Icon = CATEGORY_ICON[template.category] ?? Sparkles;
          return (
            <Link
              key={template.id}
              to={`/builder?template=${encodeURIComponent(template.id)}`}
              className="block"
            >
              <Card className="h-full min-h-[180px] flex flex-col justify-between p-6 hover:border-primary/40 hover:scale-[1.01] transition-transform">
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2 text-primary">
                    <Icon className="h-4 w-4" />
                    <span className="text-xs uppercase tracking-widest">{template.category}</span>
                  </div>
                  <Badge tone="neutral">{template.schema.fields.length} fields</Badge>
                </div>
                <div className="mt-4">
                  <div className="font-serif italic text-xl text-foreground">{template.name}</div>
                  <p className="mt-1 text-sm text-muted-foreground line-clamp-2">
                    {template.schema.description ?? "Template-based form."}
                  </p>
                </div>
              </Card>
            </Link>
          );
        })}
      </div>
    </AppShell>
  );
}
