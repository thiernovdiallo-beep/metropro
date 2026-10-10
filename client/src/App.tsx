import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { AdminGuard } from "@/components/AdminGuard";
import { DriverGuard } from "@/components/DriverGuard";
import NotFound from "@/pages/NotFound";
import { lazy, Suspense } from "react";
import { Route, Switch } from "wouter";
import ErrorBoundary from "./components/ErrorBoundary";
import { ThemeProvider } from "./contexts/ThemeContext";
import Home from "./pages/Home";
const CreateAccount = lazy(() => import("./pages/CreateAccount"));
const ForgotPassword = lazy(() => import("./pages/ForgotPassword"));
const ResetPassword = lazy(() => import("./pages/ResetPassword"));
const SearchResults = lazy(() => import("./pages/SearchResults"));
const TripDetails = lazy(() => import("./pages/TripDetails"));
const SeatSelection = lazy(() => import("./pages/SeatSelection"));
const PassengerInfo = lazy(() => import("./pages/PassengerInfo"));
const Checkout = lazy(() => import("./pages/Checkout"));
const Confirmation = lazy(() => import("./pages/Confirmation"));
const Ticket = lazy(() => import("./pages/Ticket"));
const Account = lazy(() => import("./pages/Account"));
const BookingDetail = lazy(() => import("./pages/BookingDetail"));
const RescheduleBooking = lazy(() => import("./pages/RescheduleBooking"));
const Membership = lazy(() => import("./pages/Membership"));
const DriverHome = lazy(() => import("./pages/DriverHome"));
const DriverTrip = lazy(() => import("./pages/DriverTrip"));
const DriverLogin = lazy(() => import("./pages/DriverLogin"));
const DriverSetup = lazy(() => import("./pages/DriverSetup"));
const DriverSupport = lazy(() => import("./pages/DriverSupport"));
const CustomerSupport = lazy(() => import("./pages/CustomerSupport"));
const About = lazy(() => import("./pages/PublicInfo").then(module => ({ default: module.About })));
const PublicRoutes = lazy(() => import("./pages/PublicInfo").then(module => ({ default: module.Routes })));
const Schedules = lazy(() => import("./pages/PublicInfo").then(module => ({ default: module.Schedules })));
const Contact = lazy(() => import("./pages/PublicInfo").then(module => ({ default: module.Contact })));
const FAQ = lazy(() => import("./pages/PublicInfo").then(module => ({ default: module.FAQ })));
const TravelInformation = lazy(() => import("./pages/PublicInfo").then(module => ({ default: module.TravelInformation })));
const Terms = lazy(() => import("./pages/PublicInfo").then(module => ({ default: module.Terms })));
const Privacy = lazy(() => import("./pages/PublicInfo").then(module => ({ default: module.Privacy })));
const AdminLogin = lazy(() => import("./pages/AdminLogin"));
const AdminSetup = lazy(() => import("./pages/AdminSetup"));
const AdminHome = lazy(() => import("./pages/AdminHome"));
const AdminSchedule = lazy(() => import("./pages/AdminSchedule"));
const AdminBookingDetail = lazy(() => import("./pages/AdminOperations").then(module => ({ default: module.AdminBookingDetail })));
const AdminBookings = lazy(() => import("./pages/AdminOperations").then(module => ({ default: module.AdminBookings })));
const AdminPayments = lazy(() => import("./pages/AdminOperations").then(module => ({ default: module.AdminPayments })));
const AdminSupport = lazy(() => import("./pages/AdminSupport"));
const AdminAnalytics = lazy(() => import("./pages/AdminPages").then(module => ({ default: module.AdminAnalytics })));
const AdminDispatch = lazy(() => import("./pages/AdminPages").then(module => ({ default: module.AdminDispatch })));
const AdminFleet = lazy(() => import("./pages/AdminPages").then(module => ({ default: module.AdminFleet })));
const AdminRoutes = lazy(() => import("./pages/AdminPages").then(module => ({ default: module.AdminRoutes })));
const AdminSettings = lazy(() => import("./pages/AdminPages").then(module => ({ default: module.AdminSettings })));
const AdminTrip = lazy(() => import("./pages/AdminPages").then(module => ({ default: module.AdminTrip })));
const AdminVehicle = lazy(() => import("./pages/AdminPages").then(module => ({ default: module.AdminVehicle })));

function Router() {
  return (
    <Switch>
      <Route path="/" component={Home} />
      <Route path="/create-account" component={CreateAccount} />
      <Route path="/forgot-password" component={ForgotPassword} />
      <Route path="/reset-password" component={ResetPassword} />
      <Route path="/search" component={SearchResults} />
      <Route path="/trip" component={TripDetails} />
      <Route path="/seats" component={SeatSelection} />
      <Route path="/book" component={PassengerInfo} />
      <Route path="/checkout" component={Checkout} />
      <Route path="/confirmation" component={Confirmation} />
      <Route path="/ticket/:token" component={Ticket} />
      <Route path="/membership" component={Membership} />
      <Route path="/about" component={About} />
      <Route path="/routes" component={PublicRoutes} />
      <Route path="/schedules" component={Schedules} />
      <Route path="/contact" component={Contact} />
      <Route path="/faq" component={FAQ} />
      <Route path="/travel-information" component={TravelInformation} />
      <Route path="/terms" component={Terms} />
      <Route path="/privacy" component={Privacy} />
      <Route path="/account/booking/:id/reschedule"><RescheduleBooking /></Route>
      <Route path="/account/booking/:id" component={BookingDetail} />
      <Route path="/support" component={CustomerSupport} />
      <Route path="/account/:section?" component={Account} />
      <Route path="/driver/login" component={DriverLogin} />
      <Route path="/driver/setup" component={DriverSetup} />
      <Route path="/driver/support"><DriverGuard><DriverSupport /></DriverGuard></Route>
      <Route path="/driver"><DriverGuard><DriverHome /></DriverGuard></Route>
      <Route path="/driver/trip/:id"><DriverGuard><DriverTrip /></DriverGuard></Route>
      <Route path="/admin/login" component={AdminLogin} />
      <Route path="/admin/setup" component={AdminSetup} />
      <Route path="/admin"><AdminGuard><AdminHome /></AdminGuard></Route>
      <Route path="/admin/bookings/:id/reschedule"><AdminGuard><RescheduleBooking admin /></AdminGuard></Route>
      <Route path="/admin/bookings/:id"><AdminGuard><AdminBookingDetail /></AdminGuard></Route>
      <Route path="/admin/bookings"><AdminGuard><AdminBookings /></AdminGuard></Route>
      <Route path="/admin/payments"><AdminGuard><AdminPayments /></AdminGuard></Route>
      <Route path="/admin/support"><AdminGuard><AdminSupport /></AdminGuard></Route>
      <Route path="/admin/trips/:id"><AdminGuard><AdminTrip /></AdminGuard></Route>
      <Route path="/admin/dispatch"><AdminGuard><AdminDispatch /></AdminGuard></Route>
      <Route path="/admin/schedule"><AdminGuard><AdminSchedule /></AdminGuard></Route>
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
          <Suspense fallback={<div role="status" className="container py-10 text-sm">Loading Metro Pro…</div>}><Router /></Suspense>
        </TooltipProvider>
      </ThemeProvider>
    </ErrorBoundary>
  );
}

export default App;
