"use client";

import { useEffect } from "react";
import { AlertTriangle, RotateCcw, Home } from "lucide-react";
import { Button } from "@/components/ui/button";
import Link from "next/link";

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("[Cortex] Uncaught error:", error);
  }, [error]);

  return (
    <div className="flex min-h-[70vh] items-center justify-center px-4">
      <div className="max-w-md w-full text-center space-y-6">
        <div className="inline-flex rounded-full bg-destructive/10 p-3">
          <AlertTriangle className="w-6 h-6 text-destructive" />
        </div>

        <div className="space-y-2">
          <h2 className="text-xl font-semibold tracking-tight">
            Something went wrong
          </h2>
          <p className="text-sm text-muted-foreground">
            {error.message || "An unexpected error occurred."}
          </p>
          {error.digest && (
            <p className="text-[10px] text-muted-foreground font-mono">
              ref: {error.digest}
            </p>
          )}
        </div>

        <div className="flex items-center justify-center gap-2">
          <Button onClick={reset} variant="default" size="sm">
            <RotateCcw className="w-4 h-4 mr-1.5" />
            Try again
          </Button>
          <Button asChild variant="outline" size="sm">
            <Link href="/home">
              <Home className="w-4 h-4 mr-1.5" />
              Go home
            </Link>
          </Button>
        </div>
      </div>
    </div>
  );
}
