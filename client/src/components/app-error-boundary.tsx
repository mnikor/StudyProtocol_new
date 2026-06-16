import React from "react";
import { clearLocalDraftCache } from "@/lib/browser-storage-recovery";

type AppErrorBoundaryState = {
  error: Error | null;
};

export class AppErrorBoundary extends React.Component<React.PropsWithChildren, AppErrorBoundaryState> {
  state: AppErrorBoundaryState = { error: null };

  static getDerivedStateFromError(error: Error): AppErrorBoundaryState {
    return { error };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo) {
    console.error("App render failed:", error, info);
  }

  private clearAndReload = () => {
    clearLocalDraftCache();
    window.location.reload();
  };

  render() {
    if (!this.state.error) return this.props.children;

    return (
      <div className="min-h-screen bg-[#f8f9fa] p-8 text-[#212529]">
        <div className="mx-auto mt-16 max-w-xl rounded-md border border-[#dee2e6] bg-white p-6 shadow-sm">
          <h1 className="text-xl font-semibold">The app could not load this page</h1>
          <p className="mt-3 text-sm leading-6 text-[#495057]">
            Chrome may have an outdated or oversized local draft cache for this protocol. The project data is saved on the server, so clearing the local browser cache for this app is safe.
          </p>
          <div className="mt-5 flex flex-wrap gap-3">
            <button
              type="button"
              onClick={this.clearAndReload}
              className="rounded-md bg-[#228be6] px-4 py-2 text-sm font-medium text-white hover:bg-[#1864ab]"
            >
              Clear local cache and reload
            </button>
            <button
              type="button"
              onClick={() => window.location.reload()}
              className="rounded-md border border-[#ced4da] bg-white px-4 py-2 text-sm font-medium text-[#212529] hover:bg-[#f1f3f5]"
            >
              Reload only
            </button>
          </div>
          {this.state.error?.message ? (
            <p className="mt-4 rounded bg-[#f1f3f5] p-3 text-xs text-[#495057]">
              Error: {this.state.error.message}
            </p>
          ) : null}
        </div>
      </div>
    );
  }
}
