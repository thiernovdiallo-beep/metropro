import { PageShell } from "@/components/Brand";
import { Button } from "@/components/ui/button";
import { AlertCircle, Home } from "lucide-react";
import { useLocation } from "wouter";

export default function NotFound() {
  const [, setLocation] = useLocation();

  const handleGoHome = () => {
    setLocation("/");
  };

  return (
    <PageShell>
      <div className="metro-page metro-page--readable flex min-h-[60vh] items-center justify-center">
        <section className="ticket-card w-full max-w-lg px-6 py-9 text-center sm:px-10" aria-labelledby="not-found-title">
          <AlertCircle className="mx-auto mb-5 size-12 text-destructive" aria-hidden="true" />
          <p className="metro-eyebrow">404</p>
          <h1 id="not-found-title" className="metro-page-title">Page Not Found</h1>
          <p className="mt-4 leading-relaxed text-muted-foreground">
            Sorry, the page you are looking for doesn't exist.
            <br />
            It may have been moved or deleted.
          </p>
          <div id="not-found-button-group" className="mt-7 flex justify-center">
            <Button onClick={handleGoHome} className="min-h-12 px-6">
              <Home className="size-4" aria-hidden="true" />
              Go Home
            </Button>
          </div>
        </section>
      </div>
    </PageShell>
  );
}
