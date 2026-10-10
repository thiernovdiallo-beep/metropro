import { AdminLayout } from "@/layouts/AdminLayout";
import { PageIntro, ResourceState, StatusBadge, StatusNotice } from "@/components/MetroUI";
import { Button } from "@/components/ui/button";
import { formatDate } from "@/lib/format";
import { trpc } from "@/lib/trpc";
import { ArrowLeft, Mail, Phone } from "lucide-react";
import { useMemo, useState } from "react";
import { toast } from "sonner";

type Filter = "all" | "open" | "closed";

export default function AdminSupport() {
  const [filter, setFilter] = useState<Filter>("all");
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const list = trpc.admin.support.list.useQuery();
  const detail = trpc.admin.support.get.useQuery({ id: selectedId ?? 0 }, {
    enabled: selectedId !== null,
    retry: false,
  });
  const utils = trpc.useUtils();
  const updateStatus = trpc.admin.support.updateStatus.useMutation({
    onSuccess: async (_, input) => {
      await Promise.all([
        utils.admin.support.list.invalidate(),
        utils.admin.support.get.invalidate({ id: input.id }),
        utils.admin.supportTickets.invalidate(),
      ]);
      toast.success(input.status === "closed" ? "Support ticket closed" : "Support ticket reopened");
    },
    onError: error => toast.error(error.message),
  });
  const visibleTickets = useMemo(() => (list.data ?? []).filter(ticket => filter === "all" || ticket.status === filter), [list.data, filter]);
  const selected = detail.data;

  return <AdminLayout><div className="metro-page metro-page--wide">
    <PageIntro eyebrow="Customer care" title="Support inbox" description="Review customer requests, respond through your support process, and keep ticket status current." />
    <div className="mb-5 flex flex-wrap items-center gap-2" role="group" aria-label="Filter support tickets">
      {(["all", "open", "closed"] as const).map(value => <Button key={value} type="button" variant={filter === value ? "default" : "outline"} className="min-h-10 capitalize" onClick={() => setFilter(value)}>
        {value} <span className="ml-1 text-xs opacity-75">({value === "all" ? (list.data?.length ?? 0) : (list.data ?? []).filter(ticket => ticket.status === value).length})</span>
      </Button>)}
    </div>
    <div className="grid gap-5 lg:grid-cols-[minmax(0,1.35fr)_minmax(20rem,0.65fr)]">
      <section aria-labelledby="support-ticket-list-title">
        <h2 id="support-ticket-list-title" className="sr-only">Support tickets</h2>
        <ResourceState loading={list.isLoading} error={list.error ? "Support tickets could not be loaded." : null} empty={!visibleTickets.length} emptyTitle={filter === "all" ? "No support tickets yet" : `No ${filter} tickets`} emptyDescription="Customer support requests will appear here when submitted." onRetry={() => void list.refetch()}>
          <div className="hidden overflow-hidden rounded-2xl border border-border bg-white shadow-sm md:block">
            <table className="w-full text-left text-sm">
              <thead className="bg-secondary text-xs uppercase tracking-[0.12em] text-muted-foreground"><tr><th className="px-4 py-3">Date</th><th className="px-4 py-3">Customer</th><th className="px-4 py-3">Subject</th><th className="px-4 py-3">Status</th><th className="px-4 py-3"><span className="sr-only">Action</span></th></tr></thead>
              <tbody className="divide-y divide-border">{visibleTickets.map(ticket => <tr key={ticket.id} className={selectedId === ticket.id ? "bg-secondary/60" : "hover:bg-secondary/30"}>
                <td className="whitespace-nowrap px-4 py-4 text-muted-foreground">{formatDate(ticket.createdAt)}</td>
                <td className="max-w-44 px-4 py-4"><div className="truncate font-semibold">{ticket.customerName || "Unnamed customer"}</div><div className="truncate text-xs text-muted-foreground">{ticket.customerEmail || "No email"}</div></td>
                <td className="max-w-56 px-4 py-4 font-medium"><div className="truncate">{ticket.subject}</div></td>
                <td className="px-4 py-4"><StatusBadge status={ticket.status} /></td>
                <td className="px-4 py-4 text-right"><Button type="button" variant="outline" size="sm" onClick={() => setSelectedId(ticket.id)}>{selectedId === ticket.id ? "Selected" : "View"}</Button></td>
              </tr>)}</tbody>
            </table>
          </div>
          <div className="grid gap-3 md:hidden">{visibleTickets.map(ticket => <button key={ticket.id} type="button" className={`ticket-card w-full p-4 text-left ${selectedId === ticket.id ? "border-primary ring-2 ring-primary/20" : ""}`} onClick={() => setSelectedId(ticket.id)}>
            <div className="flex items-start justify-between gap-3"><div className="min-w-0"><p className="truncate font-semibold">{ticket.subject}</p><p className="mt-1 truncate text-sm text-muted-foreground">{ticket.customerName || "Unnamed customer"}</p></div><StatusBadge status={ticket.status} /></div>
            <div className="mt-3 flex items-center justify-between gap-3 text-xs text-muted-foreground"><span>{ticket.customerEmail || "No email"}</span><span>{formatDate(ticket.createdAt)}</span></div>
          </button>)}</div>
        </ResourceState>
      </section>
      <aside className="min-w-0" aria-label="Support ticket details">
        {selectedId === null ? <div className="ticket-card flex min-h-56 items-center justify-center p-6 text-center text-sm text-muted-foreground">Select a ticket to view the full message and customer contact details.</div> : <ResourceState loading={detail.isLoading} error={detail.error ? "This support ticket could not be loaded." : null} empty={!selected} onRetry={() => void detail.refetch()}>
          {selected ? <article className="ticket-card p-5 sm:p-6"><Button type="button" variant="ghost" className="mb-4 -ml-2 min-h-10" onClick={() => setSelectedId(null)}><ArrowLeft className="mr-2 h-4 w-4" aria-hidden="true" />Back to inbox</Button>
            <div className="flex flex-wrap items-start justify-between gap-3"><div><p className="metro-eyebrow">Ticket #{selected.id}</p><h2 className="font-serif text-2xl font-semibold">{selected.subject}</h2></div><StatusBadge status={selected.status} /></div>
            <div className="mt-5 grid gap-2 rounded-xl bg-secondary p-4 text-sm"><strong>{selected.customerName || "Unnamed customer"}</strong>{selected.customerEmail ? <a className="inline-flex items-center gap-2 break-all text-primary underline" href={`mailto:${selected.customerEmail}`}><Mail className="h-4 w-4 shrink-0" aria-hidden="true" />{selected.customerEmail}</a> : null}{selected.customerPhone ? <a className="inline-flex items-center gap-2 text-primary underline" href={`tel:${selected.customerPhone}`}><Phone className="h-4 w-4 shrink-0" aria-hidden="true" />{selected.customerPhone}</a> : null}<span className="text-xs text-muted-foreground">Submitted {formatDate(selected.createdAt)}</span></div>
            <div className="mt-5 whitespace-pre-wrap rounded-xl border border-border bg-white p-4 text-sm leading-relaxed">{selected.message}</div>
            {selected.status === "open" ? <Button type="button" className="mt-5 min-h-11 w-full" disabled={updateStatus.isPending} onClick={() => updateStatus.mutate({ id: selected.id, status: "closed" })}>{updateStatus.isPending ? "Saving…" : "Mark closed"}</Button> : <><StatusNotice tone="success" className="mt-5">This ticket is closed.</StatusNotice><Button type="button" variant="outline" className="mt-3 min-h-11 w-full" disabled={updateStatus.isPending} onClick={() => updateStatus.mutate({ id: selected.id, status: "open" })}>{updateStatus.isPending ? "Saving…" : "Reopen ticket"}</Button></>}
          </article> : null}
        </ResourceState>}
      </aside>
    </div>
  </div></AdminLayout>;
}
