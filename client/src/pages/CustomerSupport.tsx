import { CustomerLayout } from "@/layouts/CustomerLayout";
import { ActionLink, PageIntro, ResourceState, StatusBadge } from "@/components/MetroUI";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { trpc } from "@/lib/trpc";
import { useAuth } from "@/_core/hooks/useAuth";
import { useState } from "react";
import { toast } from "sonner";

export default function CustomerSupport() {
  const { isAuthenticated } = useAuth();
  const tickets = trpc.account.supportTickets.useQuery(undefined, { enabled: isAuthenticated });
  const send = trpc.account.support.useMutation({
    onSuccess: async () => { await tickets.refetch(); setSubject(""); setMessage(""); toast.success("Message sent to Metro Pro support"); },
    onError: error => toast.error(error.message),
  });
  const [subject, setSubject] = useState("");
  const [message, setMessage] = useState("");

  return <CustomerLayout><main className="metro-page metro-page--readable">
    <PageIntro eyebrow="Need a hand?" title="Customer support" description="Send a question to the Metro Pro team and review your previous requests." />
    {!isAuthenticated ? <div className="ticket-card p-5 sm:p-7"><p className="text-sm leading-relaxed text-muted-foreground">Sign in to contact support and view your request history.</p><div className="mt-4 flex flex-wrap gap-3"><ActionLink href="/#member-sign-in" variant="primary">Member sign in</ActionLink><ActionLink href="/#trip-search">Book without an account</ActionLink></div></div> : <>
      <form className="ticket-card grid max-w-xl gap-4 p-5 sm:p-6" onSubmit={event => { event.preventDefault(); send.mutate({ subject, message }); }}>
        <div className="form-field"><Label className="metro-form-label" htmlFor="customer-support-subject">Subject</Label><Input id="customer-support-subject" placeholder="What can we help with?" className="metro-control" value={subject} onChange={event => setSubject(event.target.value)} minLength={3} required /></div>
        <div className="form-field"><Label className="metro-form-label" htmlFor="customer-support-message">Message</Label><textarea id="customer-support-message" className="metro-control min-h-32 p-3" placeholder="Include your booking reference if this concerns a trip." value={message} onChange={event => setMessage(event.target.value)} minLength={5} required /></div>
        <Button type="submit" className="min-h-12" disabled={send.isPending}>{send.isPending ? "Sending…" : "Send message"}</Button>
      </form>
      <section className="mt-8" aria-labelledby="my-support-tickets"><h2 id="my-support-tickets" className="font-serif text-2xl">My support requests</h2>
        <div className="mt-4"><ResourceState loading={tickets.isLoading} error={tickets.error ? "Support history could not be loaded." : null} empty={!tickets.data?.length} emptyTitle="No support requests yet" emptyDescription="Your submitted support requests will appear here." onRetry={() => void tickets.refetch()}>
          <div className="grid gap-3">{(tickets.data ?? []).map(ticket => <article key={ticket.id} className="ticket-card p-5"><div className="flex flex-wrap items-start justify-between gap-3"><div><h3 className="font-semibold">{ticket.subject}</h3><p className="mt-1 text-xs text-muted-foreground">{ticket.createdAt.toLocaleString()}</p></div><StatusBadge status={ticket.status} /></div><p className="mt-3 whitespace-pre-wrap text-sm leading-relaxed">{ticket.message}</p></article>)}</div>
        </ResourceState></div>
      </section>
    </>}
  </main></CustomerLayout>;
}
