import { useCallback, useEffect, useState, type MouseEvent } from "react";
import { Link } from "react-router-dom";
import {
  Archive,
  ArchiveRestore,
  ChevronRight,
  FileText,
  Inbox,
  LayoutGrid,
  Plus,
  Trash2,
} from "lucide-react";
import { useCurrentAccount, useSuiClient } from "@mysten/dapp-kit";

import { AppShell, PageHeader } from "@/components/layout/AppShell";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ConnectGate } from "@/components/ConnectGate";
import {
  deleteLocalForm,
  LOCAL_FORMS_CHANGED_EVENT,
  readLocalForms,
  setLocalFormArchived,
  type LocalFormRecord,
} from "@/forms/localForms";
import {
  readSubscriptions,
  refreshSubscriptions,
  removeSubscription,
  SUBSCRIPTIONS_CHANGED_EVENT,
  type FormSubscription,
} from "@/forms/subscriptions";
import { getGroupsForMember } from "@/forms/groups";
import { cn, relativeTime, truncateAddr } from "@/lib/utils";

type TabKey = "mine" | "shared" | "archived";

function isObjectId(value: string): boolean {
  return /^0x[0-9a-fA-F]{64}$/.test(value);
}

export function DashboardPage() {
  return (
    <AppShell
      action={
        <Link
          to="/dashboard/templates"
          className="inline-flex h-10 items-center justify-center gap-2 rounded-lg bg-primary px-4 text-sm font-medium text-primary-foreground shadow-sm transition-all duration-200 hover:opacity-95 active:opacity-90"
        >
          <Plus className="h-4 w-4" />
          New form
        </Link>
      }
    >
      <PageHeader
        eyebrow="Forms"
        title="Your forms"
        description="Create, share, and triage feedback. Submissions live on Walrus, gated by Seal."
      />
      <ConnectGate message="Connect a wallet to see the forms you own and the forms shared with you.">
        <DashboardContent />
      </ConnectGate>
    </AppShell>
  );
}

function DashboardContent() {
  const client = useSuiClient();
  const account = useCurrentAccount();
  const [tab, setTab] = useState<TabKey>("mine");
  const [forms, setForms] = useState<LocalFormRecord[]>([]);
  const [subscriptions, setSubscriptions] = useState<FormSubscription[]>([]);
  const [groupSharedIds, setGroupSharedIds] = useState<Set<string>>(new Set());
  const [chainCounts, setChainCounts] = useState<Record<string, number>>({});

  const reloadSubs = useCallback(() => {
    setSubscriptions(readSubscriptions(account?.address));
    void refreshSubscriptions(account?.address).then(setSubscriptions);
    // Also query sui-groups for forms shared on-chain with this wallet.
    if (account?.address) {
      void getGroupsForMember(client, account.address).then((ids) =>
        setGroupSharedIds(new Set(ids)),
      );
    }
  }, [account?.address, client]);

  const reloadForms = useCallback(() => {
    let cancelled = false;
    readLocalForms().then(async (next) => {
      if (cancelled) return;
      setForms(next);
      const publishedIds = next
        .filter((f) => (f.status ?? "published") === "published" && isObjectId(f.id))
        .map((f) => f.id);
      if (publishedIds.length === 0) return;
      try {
        const objects = await client.multiGetObjects({
          ids: publishedIds,
          options: { showContent: true },
        });
        if (cancelled) return;
        const counts: Record<string, number> = {};
        for (const obj of objects) {
          const data = obj?.data;
          const content = data?.content;
          if (!data || !content || content.dataType !== "moveObject") continue;
          const fields = content.fields as Record<string, unknown>;
          const count = Number(fields.submission_count ?? 0);
          if (Number.isFinite(count)) counts[data.objectId] = count;
        }
        setChainCounts((prev) => ({ ...prev, ...counts }));
      } catch {
        // Best-effort. Local count stays if RPC fails.
      }
    });
    return () => {
      cancelled = true;
    };
  }, [client]);

  useEffect(() => {
    let cancelReload = reloadForms();
    reloadSubs();

    function refresh() {
      cancelReload();
      cancelReload = reloadForms();
      reloadSubs();
    }

    function handleStorage(event: StorageEvent) {
      if (event.key === null || event.key === "walrus.forms.localForms.v1") refresh();
      if (event.key === null || (event.key && event.key.startsWith("walrus.forms.subscriptions.v1:"))) {
        reloadSubs();
      }
    }

    function handleVisibility() {
      if (document.visibilityState === "visible") refresh();
    }

    window.addEventListener(LOCAL_FORMS_CHANGED_EVENT, refresh);
    window.addEventListener(SUBSCRIPTIONS_CHANGED_EVENT, reloadSubs);
    window.addEventListener("storage", handleStorage);
    window.addEventListener("focus", refresh);
    document.addEventListener("visibilitychange", handleVisibility);
    const timer = window.setInterval(refresh, 30_000);

    return () => {
      cancelReload();
      window.removeEventListener(LOCAL_FORMS_CHANGED_EVENT, refresh);
      window.removeEventListener(SUBSCRIPTIONS_CHANGED_EVENT, reloadSubs);
      window.removeEventListener("storage", handleStorage);
      window.removeEventListener("focus", refresh);
      document.removeEventListener("visibilitychange", handleVisibility);
      window.clearInterval(timer);
    };
  }, [reloadForms, reloadSubs]);

  async function handleDeleteDraft(event: MouseEvent, form: LocalFormRecord) {
    event.preventDefault();
    event.stopPropagation();
    if (!window.confirm(`Delete draft "${form.title}"? This cannot be undone.`)) return;
    await deleteLocalForm(form.id);
    setForms((prev) => prev.filter((f) => f.id !== form.id));
  }

  async function handleArchive(event: MouseEvent, form: LocalFormRecord, archived: boolean) {
    event.preventDefault();
    event.stopPropagation();
    await setLocalFormArchived(form.id, archived);
    setForms((prev) =>
      prev.map((f) => (f.id === form.id ? { ...f, archivedAtMs: archived ? Date.now() : undefined } : f)),
    );
  }

  async function handleRemoveSubscription(event: MouseEvent, sub: FormSubscription) {
    event.preventDefault();
    event.stopPropagation();
    if (!window.confirm(`Remove "${sub.title}" from your dashboard? You can revisit its link to add it back.`)) return;
    await removeSubscription(sub.id, account?.address);
    setSubscriptions((prev) => prev.filter((s) => s.id !== sub.id));
  }

  const ownedIds = new Set(forms.map((f) => f.id));
  const activeForms = forms.filter((f) => !f.archivedAtMs);
  const archivedForms = forms.filter((f) => Boolean(f.archivedAtMs));
  // Supabase subscriptions (visit-link auto-subscribe) + sui-groups on-chain grants.
  // De-duplicate: if a form id appears in both, show once.
  const subIds = new Set(subscriptions.map((s) => s.id));
  const onlyGroupIds = Array.from(groupSharedIds).filter(
    (id) => !ownedIds.has(id) && !subIds.has(id),
  );
  const sharedForms = [
    ...subscriptions.filter((s) => !ownedIds.has(s.id)),
    // Group-only entries shown as minimal stubs (no cached metadata).
    ...onlyGroupIds.map((id) => ({ id, title: id.slice(0, 10) + "…", addedAtMs: 0 })),
  ] as FormSubscription[];

  const TAB_LIST: { key: TabKey; label: string; count: number; icon: typeof LayoutGrid }[] = [
    { key: "mine", label: "My forms", count: activeForms.length, icon: LayoutGrid },
    { key: "shared", label: "Shared with you", count: sharedForms.length, icon: Inbox },
    { key: "archived", label: "Archived", count: archivedForms.length, icon: Archive },
  ];

  return (
    <>
      <div className="mb-5 flex items-center gap-1 p-1 rounded-lg bg-background-soft border border-border w-fit">
        {TAB_LIST.map(({ key, label, count, icon: Icon }) => (
          <button
            key={key}
            type="button"
            onClick={() => setTab(key)}
            className={cn(
              "inline-flex items-center gap-2 rounded-md px-3 py-1.5 text-sm transition-colors",
              tab === key
                ? "bg-background text-foreground shadow-sm"
                : "text-muted-foreground hover:text-foreground",
            )}
          >
            <Icon className="h-3.5 w-3.5" />
            {label}
            <span
              className={cn(
                "ml-1 rounded-full px-1.5 text-[10px] font-mono",
                tab === key ? "bg-primary/15 text-primary" : "bg-muted/40",
              )}
            >
              {count}
            </span>
          </button>
        ))}
      </div>

      {tab === "mine" && (
        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-5">
          <Link to="/dashboard/templates">
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
          {activeForms.map((form) => (
            <OwnedFormCard
              key={form.id}
              form={form}
              chainCounts={chainCounts}
              onDeleteDraft={handleDeleteDraft}
              onArchive={handleArchive}
            />
          ))}
        </div>
      )}

      {tab === "shared" && (
        sharedForms.length === 0 ? (
          <EmptyHint icon={Inbox} title="No shared forms yet" body="Open a form link someone sent you and it'll land here." />
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-5">
            {sharedForms.map((sub) => (
              <SharedFormCard key={sub.id} sub={sub} onRemove={handleRemoveSubscription} />
            ))}
          </div>
        )
      )}

      {tab === "archived" && (
        archivedForms.length === 0 ? (
          <EmptyHint icon={Archive} title="Nothing archived" body="Archive a form to hide it from My forms without deleting it." />
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-5">
            {archivedForms.map((form) => (
              <OwnedFormCard
                key={form.id}
                form={form}
                chainCounts={chainCounts}
                onDeleteDraft={handleDeleteDraft}
                onArchive={handleArchive}
                archivedView
              />
            ))}
          </div>
        )
      )}
    </>
  );
}

function OwnedFormCard({
  form,
  chainCounts,
  onDeleteDraft,
  onArchive,
  archivedView = false,
}: {
  form: LocalFormRecord;
  chainCounts: Record<string, number>;
  onDeleteDraft: (e: MouseEvent, form: LocalFormRecord) => void;
  onArchive: (e: MouseEvent, form: LocalFormRecord, archived: boolean) => void;
  archivedView?: boolean;
}) {
  const status = form.status ?? "published";
  const isDraft = status === "draft";
  const target = isDraft
    ? `/builder/${encodeURIComponent(form.id)}`
    : `/admin/${encodeURIComponent(form.id)}`;
  return (
    <Link
      to={target}
      aria-label={`${form.title} ${isDraft ? "edit draft" : "open submissions"}`}
      className="group block focus:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background rounded-2xl"
    >
      <Card className="p-5 min-h-[220px] flex flex-col transition-all duration-200 cursor-pointer group-hover:-translate-y-0.5 group-hover:border-primary/40 group-hover:shadow-lg">
        <div className="flex items-start justify-between gap-3">
          <div className="h-10 w-10 rounded-lg bg-primary/10 text-primary flex items-center justify-center">
            <FileText className="h-5 w-5" />
          </div>
          <div className="flex items-center gap-2">
            {isDraft ? (
              <Badge tone="tertiary">Draft</Badge>
            ) : archivedView ? (
              <Badge tone="neutral">Archived</Badge>
            ) : (
              <Badge tone="neutral">{chainCounts[form.id] ?? form.submissionCount ?? 0} submissions</Badge>
            )}
            {isDraft && (
              <button
                type="button"
                onClick={(e) => onDeleteDraft(e, form)}
                className="p-1.5 rounded-md text-muted-foreground/60 hover:text-destructive hover:bg-destructive/10 transition-colors"
                aria-label="Delete draft"
                title="Delete draft"
              >
                <Trash2 className="h-3.5 w-3.5" />
              </button>
            )}
            {!isDraft && !archivedView && (
              <button
                type="button"
                onClick={(e) => onArchive(e, form, true)}
                className="p-1.5 rounded-md text-muted-foreground/60 hover:text-foreground hover:bg-background-soft transition-colors"
                aria-label="Archive"
                title="Archive"
              >
                <Archive className="h-3.5 w-3.5" />
              </button>
            )}
            {!isDraft && archivedView && (
              <button
                type="button"
                onClick={(e) => onArchive(e, form, false)}
                className="p-1.5 rounded-md text-muted-foreground/60 hover:text-primary hover:bg-primary/10 transition-colors"
                aria-label="Unarchive"
                title="Unarchive"
              >
                <ArchiveRestore className="h-3.5 w-3.5" />
              </button>
            )}
          </div>
        </div>
        <div className="mt-4 min-w-0">
          <h2 className="text-lg font-semibold truncate">{form.title}</h2>
          <p className="mt-1 font-mono text-xs text-muted-foreground truncate">{truncateAddr(form.id, 8, 6)}</p>
          <p className="mt-2 text-xs text-muted-foreground">
            {isDraft ? "Saved" : archivedView ? "Archived" : "Published"}{" "}
            {relativeTime((archivedView ? form.archivedAtMs : form.updatedAtMs) ?? form.createdAtMs)}
          </p>
        </div>
        <div className="mt-auto pt-5 flex items-center justify-end text-muted-foreground transition-colors group-hover:text-foreground">
          <ChevronRight className="h-4 w-4" />
        </div>
      </Card>
    </Link>
  );
}

function SharedFormCard({
  sub,
  onRemove,
}: {
  sub: FormSubscription;
  onRemove: (e: MouseEvent, sub: FormSubscription) => void;
}) {
  return (
    <Link
      to={`/admin/${encodeURIComponent(sub.id)}`}
      className="group block focus:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background rounded-2xl"
    >
      <Card className="p-5 min-h-[180px] flex flex-col transition-all duration-200 cursor-pointer group-hover:-translate-y-0.5 group-hover:border-primary/40 group-hover:shadow-lg">
        <div className="flex items-start justify-between gap-3">
          <div className="h-10 w-10 rounded-lg bg-tertiary/10 text-tertiary-strong dark:text-tertiary flex items-center justify-center">
            <Inbox className="h-5 w-5" />
          </div>
          <div className="flex items-center gap-2">
            <Badge tone="tertiary">Shared</Badge>
            <button
              type="button"
              onClick={(e) => onRemove(e, sub)}
              className="p-1.5 rounded-md text-muted-foreground/60 hover:text-destructive hover:bg-destructive/10 transition-colors"
              aria-label="Remove from dashboard"
              title="Remove from dashboard"
            >
              <Trash2 className="h-3.5 w-3.5" />
            </button>
          </div>
        </div>
        <div className="mt-4 min-w-0">
          <h2 className="text-lg font-semibold truncate">{sub.title}</h2>
          <p className="mt-1 font-mono text-xs text-muted-foreground truncate">{truncateAddr(sub.id, 8, 6)}</p>
          {sub.ownerAddress && (
            <p className="mt-1 text-[11px] text-muted-foreground">
              by <span className="font-mono">{truncateAddr(sub.ownerAddress, 6, 4)}</span>
            </p>
          )}
          <p className="mt-2 text-xs text-muted-foreground">Added {relativeTime(sub.addedAtMs)}</p>
        </div>
        <div className="mt-auto pt-4 flex items-center justify-end text-muted-foreground transition-colors group-hover:text-foreground">
          <ChevronRight className="h-4 w-4" />
        </div>
      </Card>
    </Link>
  );
}

function EmptyHint({ icon: Icon, title, body }: { icon: typeof Inbox; title: string; body: string }) {
  return (
    <Card className="p-10 text-center max-w-lg mx-auto">
      <div className="h-12 w-12 mx-auto rounded-full bg-background-soft text-muted-foreground flex items-center justify-center">
        <Icon className="h-5 w-5" />
      </div>
      <h3 className="mt-4 font-serif italic text-xl">{title}</h3>
      <p className="mt-2 text-sm text-muted-foreground">{body}</p>
    </Card>
  );
}
