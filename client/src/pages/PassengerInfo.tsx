import { PageShell } from "@/components/Brand";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { startLogin } from "@/const";
import { trpc } from "@/lib/trpc";
import { useAuth } from "@/_core/hooks/useAuth";
import { useMemo, useState } from "react";
import { useLocation, useSearch } from "wouter";

export default function PassengerInfo() {
  const search = useSearch();
  const params = useMemo(() => new URLSearchParams(search), [search]);
  const [, setLocation] = useLocation();
  const { user, isAuthenticated } = useAuth();
  const settings = trpc.public.settings.useQuery();
  const saved = trpc.account.savedPassengers.useQuery(undefined, { enabled: isAuthenticated });
  const pax = Number(params.get("pax") ?? 1);
  const [contactFirstName, setFirst] = useState(user?.name?.split(" ")[0] ?? "");
  const [contactLastName, setLast] = useState(user?.name?.split(" ").slice(1).join(" ") ?? "");
  const [phone, setPhone] = useState(user?.phone ?? "");
  const [email, setEmail] = useState(user?.email ?? "");
  const [emergencyName, setEmName] = useState("");
  const [emergencyPhone, setEmPhone] = useState("");
  const [passengers, setPassengers] = useState(
    Array.from({ length: pax }, () => ({ firstName: "", lastName: "" }))
  );

  function applySaved(i: number, firstName: string, lastName: string) {
    setPassengers(list => list.map((p, idx) => (idx === i ? { firstName, lastName } : p)));
  }

  function go(e: React.FormEvent) {
    e.preventDefault();
    const payload = {
      out: params.get("out"),
      ret: params.get("ret"),
      pax: String(pax),
      type: params.get("type") ?? "one_way",
      contactFirstName,
      contactLastName,
      phone,
      email,
      emergencyName,
      emergencyPhone,
      passengers,
    };
    sessionStorage.setItem("metropro-booking", JSON.stringify(payload));
    setLocation("/checkout");
  }

  return (
    <PageShell>
      <div className="container max-w-2xl py-10">
        <h1 className="font-serif text-3xl">Passenger information</h1>
        {!isAuthenticated ? (
          <div className="ticket-card mt-6 p-5">
            <p className="text-sm">Sign in to book and retrieve digital tickets.</p>
            <Button className="mt-3" onClick={() => startLogin()}>
              Sign in
            </Button>
          </div>
        ) : (
          <form className="mt-6 grid gap-5" onSubmit={go}>
            <div className="grid gap-3 md:grid-cols-2">
              <div>
                <Label>First name</Label>
                <Input className="mt-1 h-12" value={contactFirstName} onChange={e => setFirst(e.target.value)} required />
              </div>
              <div>
                <Label>Last name</Label>
                <Input className="mt-1 h-12" value={contactLastName} onChange={e => setLast(e.target.value)} required />
              </div>
              <div>
                <Label>Phone</Label>
                <Input className="mt-1 h-12" value={phone} onChange={e => setPhone(e.target.value)} required />
              </div>
              <div>
                <Label>Email</Label>
                <Input type="email" className="mt-1 h-12" value={email} onChange={e => setEmail(e.target.value)} required />
              </div>
            </div>
            {settings.data?.emergencyContactRequired ? (
              <div className="grid gap-3 md:grid-cols-2">
                <div>
                  <Label>Emergency contact name</Label>
                  <Input className="mt-1 h-12" value={emergencyName} onChange={e => setEmName(e.target.value)} required />
                </div>
                <div>
                  <Label>Emergency contact phone</Label>
                  <Input className="mt-1 h-12" value={emergencyPhone} onChange={e => setEmPhone(e.target.value)} required />
                </div>
              </div>
            ) : null}
            {passengers.map((p, i) => (
              <div key={i} className="ticket-card p-4">
                <div className="text-sm font-semibold">Passenger {i + 1}</div>
                <div className="mt-3 grid gap-3 md:grid-cols-2">
                  <Input
                    placeholder="First name"
                    className="h-12"
                    value={p.firstName}
                    onChange={e =>
                      setPassengers(list =>
                        list.map((row, idx) => (idx === i ? { ...row, firstName: e.target.value } : row))
                      )
                    }
                    required
                  />
                  <Input
                    placeholder="Last name"
                    className="h-12"
                    value={p.lastName}
                    onChange={e =>
                      setPassengers(list =>
                        list.map((row, idx) => (idx === i ? { ...row, lastName: e.target.value } : row))
                      )
                    }
                    required
                  />
                </div>
                {saved.data && saved.data.length > 0 ? (
                  <div className="mt-2 flex flex-wrap gap-2">
                    {saved.data.map(s => (
                      <button
                        type="button"
                        key={s.id}
                        className="rounded-full border px-3 py-1 text-xs"
                        onClick={() => applySaved(i, s.firstName, s.lastName)}
                      >
                        {s.firstName} {s.lastName}
                      </button>
                    ))}
                  </div>
                ) : null}
              </div>
            ))}
            <Button type="submit" className="h-12">
              Continue to checkout
            </Button>
          </form>
        )}
      </div>
    </PageShell>
  );
}
