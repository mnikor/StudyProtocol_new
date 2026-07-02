import { lazy, Suspense } from "react";
import { Switch, Route } from "wouter";
import { queryClient } from "./lib/queryClient";
import { QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import AppLayout from "@/layouts/app-layout";
import { AIChatProvider } from "@/contexts/ai-chat-context";

const Home = lazy(() => import("@/pages/home"));
const ProtocolBuilder = lazy(() => import("@/pages/protocol-builder"));
const NotFound = lazy(() => import("@/pages/not-found"));

function Router() {
  return (
    <AppLayout>
      <Suspense fallback={<div className="p-6 text-sm text-[#6c757d]">Loading...</div>}>
        <Switch>
          <Route path="/" component={Home} />
          <Route path="/protocol/:id" component={ProtocolBuilder} />
          <Route component={NotFound} />
        </Switch>
      </Suspense>
    </AppLayout>
  );
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <AIChatProvider>
        <Router />
        <Toaster />
      </AIChatProvider>
    </QueryClientProvider>
  );
}

export default App;
