import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { AdminGuard } from "@/components/AdminGuard";
import { DriverGuard } from "@/components/DriverGuard";
import NotFound from "@/pages/NotFound";
import { Route, Switch } from "wouter";
import ErrorBoundary from "./components/ErrorBoundary";
import { ThemeProvider } from "./contexts/ThemeContext";
import Home from "./pages/Home";
import CreateAccount from "./pages/CreateAccount";
import SearchResults from "./pages/SearchResults";
import PassengerInfo from "./pages/PassengerInfo";
import Checkout from "./pages/Checkout";
import Confirmation from "./pages/Confirmation";
import Ticket from "./pages/Ticket";
import Account from "./pages/Account";
import Membership from "./pages/Membership";
import DriverHome from "./pages/DriverHome";
import DriverTrip from "./pages/DriverTrip";
import DriverLogin from "./pages/DriverLogin";
import DriverSetup from "./pages/DriverSetup";
import AdminLogin from "./pages/AdminLogin";
import AdminSetup from "./pages/AdminSetup";
import AdminHome from "./pages/AdminHome";
import {
  AdminAnalytics,
  AdminDispatch,
  AdminFleet,
  AdminRoutes,
  AdminSettings,
  AdminTrip,
  AdminVehicle,
} from "./pages/AdminPages";

function Router() {
  return (
    <Switch>
      <Route path="/" component={Home} />
      <Route path="/create-account" component={CreateAccount} />
      <Route path="/search" component={SearchResults} />
      <Route path="/book" component={PassengerInfo} />
      <Route path="/checkout" component={Checkout} />
      <Route path="/confirmation" component={Confirmation} />
      <Route path="/ticket/:token" component={Ticket} />
      <Route path="/membership" component={Membership} />
      <Route path="/account/:section?" component={Account} />
      <Route path="/driver/login" component={DriverLogin} />
      <Route path="/driver/setup" component={DriverSetup} />
      <Route path="/driver"><DriverGuard><DriverHome /></DriverGuard></Route>
      <Route path="/driver/trip/:id"><DriverGuard><DriverTrip /></DriverGuard></Route>
      <Route path="/admin/login" component={AdminLogin} />
      <Route path="/admin/setup" component={AdminSetup} />
      <Route path="/admin"><AdminGuard><AdminHome /></AdminGuard></Route>
      <Route path="/admin/trips/:id"><AdminGuard><AdminTrip /></AdminGuard></Route>
      <Route path="/admin/dispatch"><AdminGuard><AdminDispatch /></AdminGuard></Route>
      <Route path="/admin/fleet/:id"><AdminGuard><AdminVehicle /></AdminGuard></Route>
      <Route path="/admin/fleet"><AdminGuard><AdminFleet /></AdminGuard></Route>
      <Route path="/admin/routes"><AdminGuard><AdminRoutes /></AdminGuard></Route>
      <Route path="/admin/analytics"><AdminGuard><AdminAnalytics /></AdminGuard></Route>
      <Route path="/admin/settings"><AdminGuard><AdminSettings /></AdminGuard></Route>
      <Route path="/404" component={NotFound} />
      <Route component={NotFound} />
    </Switch>
  );
}

function App() {
  return (
    <ErrorBoundary>
      <ThemeProvider defaultTheme="light">
        <TooltipProvider>
          <Toaster />
          <Router />
        </TooltipProvider>
      </ThemeProvider>
    </ErrorBoundary>
  );
}

export default App;
