import { createRoot } from "react-dom/client";
import App from "./App";
import "./index.css";
import { AppErrorBoundary } from "@/components/app-error-boundary";
import { runBrowserStorageRecovery } from "@/lib/browser-storage-recovery";

runBrowserStorageRecovery();

createRoot(document.getElementById("root")!).render(
  <AppErrorBoundary>
    <App />
  </AppErrorBoundary>
);
