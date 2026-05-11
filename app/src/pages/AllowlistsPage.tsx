import { useState } from "react";
import { Plus, Users2, Trash2, Save } from "lucide-react";

import { AppShell, PageHeader } from "@/components/layout/AppShell";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input, Label } from "@/components/ui/input";
import { Badge, StatusDot } from "@/components/ui/badge";
import { truncateAddr } from "@/lib/utils";

interface Allowlist {
  id: string;
  name: string;
  members: string[];
}

const DEMO: Allowlist[] = [
  {
    id: "0xa11ow1",
    name: "Bug triagers",
    members: [
      "0x9F3aA1ce4982FE1abf3829FFbC32d5Dba2Ee84cd",
      "0x2Aa991Be4F9c0C9Ae62D3Fb71Ec43aE71b3CE112",
    ],
  },
  {
    id: "0xa11ow2",
    name: "Grants reviewers",
    members: ["0x4Fc91dEaA02D5b90B3F2Ab63FE5eA3A09b1aBcDe"],
  },
];

export function AllowlistsPage() {
  const [lists, setLists] = useState<Allowlist[]>(DEMO);
  const [activeId, setActiveId] = useState<string>(DEMO[0].id);
  const [draft, setDraft] = useState("");

  const active = lists.find((l) => l.id === activeId);

  function addMember() {
    if (!active || !draft.trim()) return;
    setLists((prev) =>
      prev.map((l) =>
        l.id === active.id ? { ...l, members: [...new Set([...l.members, draft.trim()])] } : l,
      ),
    );
    setDraft("");
  }

  function removeMember(addr: string) {
    if (!active) return;
    setLists((prev) =>
      prev.map((l) => (l.id === active.id ? { ...l, members: l.members.filter((m) => m !== addr) } : l)),
    );
  }

  function createList() {
    const id = `0xa11${(lists.length + 1).toString(16).padStart(3, "0")}`;
    const next: Allowlist = { id, name: `New list ${lists.length + 1}`, members: [] };
    setLists((prev) => [...prev, next]);
    setActiveId(id);
  }

  return (
    <AppShell
      action={
        <Button leftIcon={<Plus className="h-4 w-4" />} onClick={createList}>
          New list
        </Button>
      }
    >
      <PageHeader
        eyebrow="Access control"
        title="Allowlists"
        description="Manage Sui addresses that can decrypt allowlist-gated submissions."
      />

      <div className="grid grid-cols-1 lg:grid-cols-[280px_1fr] gap-6">
        <Card className="p-3 h-fit">
          <ul className="flex flex-col gap-1">
            {lists.map((l) => (
              <li key={l.id}>
                <button
                  type="button"
                  onClick={() => setActiveId(l.id)}
                  className={`w-full text-left rounded-lg px-3 py-2.5 text-sm transition-colors ${
                    activeId === l.id
                      ? "bg-primary/10 text-primary"
                      : "text-muted-foreground hover:text-foreground hover:bg-background-soft"
                  }`}
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-medium truncate">{l.name}</span>
                    <span className="text-[11px] font-mono text-muted-foreground">
                      {l.members.length}
                    </span>
                  </div>
                  <div className="mt-0.5 font-mono text-[10px] text-muted-foreground/70 truncate">
                    {l.id}
                  </div>
                </button>
              </li>
            ))}
          </ul>
        </Card>

        <Card className="p-6">
          {active ? (
            <>
              <div className="flex items-end justify-between gap-4 mb-4">
                <div>
                  <Label>Name</Label>
                  <Input
                    className="mt-1.5 text-xl font-serif italic h-auto py-2 bg-transparent border-0 border-b border-border rounded-none focus:ring-0 focus:border-primary"
                    value={active.name}
                    onChange={(e) =>
                      setLists((prev) =>
                        prev.map((l) => (l.id === active.id ? { ...l, name: e.target.value } : l)),
                      )
                    }
                  />
                </div>
                <Badge tone="secondary" icon={<StatusDot tone="secondary" />}>
                  {active.members.length} members
                </Badge>
              </div>

              <Label>Add address</Label>
              <div className="mt-2 flex gap-2">
                <Input
                  className="font-mono text-xs"
                  value={draft}
                  onChange={(e) => setDraft(e.target.value)}
                  placeholder="0x… (paste a Sui address)"
                  onKeyDown={(e) => e.key === "Enter" && addMember()}
                />
                <Button onClick={addMember} disabled={!draft.trim()}>
                  Add
                </Button>
              </div>

              <div className="mt-6">
                <Label>Members</Label>
                {active.members.length === 0 ? (
                  <p className="mt-3 text-sm text-muted-foreground italic">No members yet.</p>
                ) : (
                  <ul className="mt-3 divide-y divide-border/60">
                    {active.members.map((addr) => (
                      <li key={addr} className="flex items-center justify-between py-2.5">
                        <div className="flex items-center gap-3 min-w-0">
                          <div className="h-7 w-7 shrink-0 rounded-full bg-gradient-to-br from-primary via-secondary to-tertiary" />
                          <span className="font-mono text-xs truncate">{truncateAddr(addr, 10, 6)}</span>
                        </div>
                        <button
                          type="button"
                          onClick={() => removeMember(addr)}
                          className="p-1.5 rounded text-muted-foreground/60 hover:text-destructive hover:bg-destructive/10 transition-colors"
                          aria-label="Remove"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
              </div>

              <div className="mt-6 flex justify-end">
                <Button variant="primary" leftIcon={<Save className="h-4 w-4" />}>
                  Save changes
                </Button>
              </div>
            </>
          ) : (
            <div className="text-center py-12 text-muted-foreground">
              <Users2 className="h-10 w-10 mx-auto mb-3 opacity-50" />
              <p>Pick or create an allowlist to manage members.</p>
            </div>
          )}
        </Card>
      </div>
    </AppShell>
  );
}
