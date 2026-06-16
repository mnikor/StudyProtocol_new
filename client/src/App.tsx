import { Switch, Route } from "wouter";
import { queryClient } from "./lib/queryClient";
import { QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import NotFound from "@/pages/not-found";
import Home from "@/pages/home";
import ProtocolBuilder from "@/pages/protocol-builder";
import AppLayout from "@/layouts/app-layout";
import { AIChatProvider } from "@/contexts/ai-chat-context";

function Router() {
  return (
    <AppLayout>
      <Switch>
        <Route path="/" component={Home} />
        <Route path="/protocol/:id" component={ProtocolBuilder} />
        <Route component={NotFound} />
      </Switch>
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
