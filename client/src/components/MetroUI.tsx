import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { AlertCircle, ArrowLeft, LoaderCircle, RefreshCw } from "lucide-react";
import React, { type ReactNode } from "react";
import { Link } from "wouter";

export function PageIntro({ eyebrow, title, description, actions, className }: {
  eyebrow?: string; title: string; description?: ReactNode; actions?: ReactNode; className?: string;
}) {
  return <div className={cn("mb-8 flex min-w-0 flex-wrap items-end justify-between gap-4", className)}>
    <div className="min-w-0">
      {eyebrow ? <p className="metro-eyebrow">{eyebrow}</p> : null}
      <h1 className="metro-page-title">{title}</h1>
      {description ? <div className="metro-page-description">{description}</div> : null}
    </div>
    {actions ? <div className="flex flex-wrap items-center gap-2">{actions}</div> : null}
  </div>;
}

const success = new Set(["paid", "succeeded", "confirmed", "active", "available", "boarded", "completed", "arrived", "refunded", "checked_in"]);
const pending = new Set(["pending", "pending_payment", "held", "scheduled", "boarding", "in_transit", "delayed", "processing", "past_due"]);
const error = new Set(["failed", "canceled", "cancelled", "voided", "expired", "out_of_service", "no_show", "unpaid"]);
const neutral = new Set(["inactive", "not_boarded", "open", "draft", "maintenance", "unknown"]);

export function statusTone(status: string): "success" | "pending" | "error" | "neutral" | "info" {
  const key = status.toLowerCase().replace(/[\s-]+/g, "_");
  if (success.has(key)) return "success";
  if (pending.has(key)) return "pending";
  if (error.has(key)) return "error";
  if (neutral.has(key)) return "neutral";
  return "info";
}

export function StatusBadge({ status, label, className }: { status: string; label?: string; className?: string }) {
  const text = label ?? status.replace(/_/g, " ").replace(/\b\w/g, letter => letter.toUpperCase());
  return <span data-status={status.toLowerCase()} className={cn("metro-status", `metro-status--${statusTone(status)}`, className)}>{text}</span>;
}

export function StatusNotice({ tone = "info", children, className }: {
  tone?: "info" | "pending" | "success" | "error"; children: ReactNode; className?: string;
}) {
  return <div role={tone === "error" ? "alert" : "status"}
    className={cn("metro-notice", tone !== "info" && `metro-notice--${tone}`, className)}>{children}</div>;
}

export function ResourceState({ loading, error, empty, emptyTitle = "Nothing here yet", emptyDescription, onRetry, children }: {
  loading?: boolean; error?: string | null; empty?: boolean; emptyTitle?: string;
  emptyDescription?: string; onRetry?: () => void; children: ReactNode;
}) {
  if (loading) return <div role="status" className="ticket-card flex min-h-28 items-center gap-3 p-5 text-sm text-muted-foreground">
    <LoaderCircle className="metro-spinner h-5 w-5" aria-hidden="true" />Loading Metro Pro…
  </div>;
  if (error) return <div role="alert" className="metro-notice metro-notice--error flex min-w-0 flex-wrap items-center gap-3">
    <AlertCircle className="h-5 w-5 shrink-0" aria-hidden="true" />
    <span className="min-w-0 flex-1 break-words">{error}</span>
    {onRetry ? <Button type="button" variant="outline" onClick={onRetry}><RefreshCw aria-hidden="true" />Try again</Button> : null}
  </div>;
  if (empty) return <div className="ticket-card p-6 sm:p-8"><h2 className="font-serif text-xl font-semibold">{emptyTitle}</h2>
    {emptyDescription ? <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{emptyDescription}</p> : null}
    {onRetry ? <Button type="button" variant="outline" className="mt-4" onClick={onRetry}><RefreshCw aria-hidden="true" />Refresh</Button> : null}
  </div>;
  return <>{children}</>;
}

export function ActionLink({ href, children, variant = "secondary", back = false, className }: {
  href: string; children: ReactNode; variant?: "secondary" | "primary"; back?: boolean; className?: string;
}) {
  const classes = cn("metro-action-link", variant === "primary" && "metro-action-link--primary", className);
  const content = <>{back ? <ArrowLeft className="h-4 w-4" aria-hidden="true" /> : null}{children}</>;
  return href.includes("#") ? <a href={href} className={classes}>{content}</a>
    : <Link href={href} className={classes}>{content}</Link>;
}

const bookingSteps = ["Search", "Trip", "Seats", "Travelers", "Review", "Payment", "Ticket"] as const;
export type BookingStep = (typeof bookingSteps)[number];
export function BookingProgress({ current }: { current: BookingStep }) {
  const currentIndex = bookingSteps.indexOf(current);
  return <nav aria-label="Booking progress" className="mb-8 overflow-x-auto pb-1">
    <ol className="flex min-w-max items-center gap-2 text-xs font-semibold sm:gap-3">
      {bookingSteps.map((step, index) => <li key={step} aria-current={index === currentIndex ? "step" : undefined}
        className={cn("flex items-center gap-2 rounded-full border px-3 py-2.5", index < currentIndex ? "border-primary/30 bg-secondary text-primary"
          : index === currentIndex ? "border-[var(--metro-available)] bg-[var(--metro-available)] text-white" : "border-border bg-white text-muted-foreground")}>
        <span aria-hidden="true">{index + 1}</span>{step}
      </li>)}
    </ol>
  </nav>;
}
