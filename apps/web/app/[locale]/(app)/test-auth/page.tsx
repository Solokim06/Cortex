"use client";

import { useState } from "react";
import { useCortex } from "@/lib/hooks/use-cortex";
import { useUser } from "@clerk/nextjs";
import { Button } from "@/components/ui/button";

type CaptureResponse = {
  id: string;
  type: string;
  title: string | null;
  content: string | null;
  created_at: string;
};

function getErrorMessage(e: unknown): string {
  if (e instanceof Error) return e.message;
  if (typeof e === "string") return e;
  return "Unknown error";
}

export default function TestAuthPage() {
  const { user } = useUser();
  const cortex = useCortex();
  const [result, setResult] = useState<CaptureResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const test = async () => {
    setLoading(true);
    setError(null);
    setResult(null);
    try {
      const r = (await cortex.captureText(
        "Testing Cortex auth from the web UI.",
        "Auth Test",
      )) as CaptureResponse;
      setResult(r);
    } catch (e: unknown) {
      setError(getErrorMessage(e));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-6 max-w-2xl">
      <div>
        <h1 className="text-2xl font-semibold">Auth Test</h1>
        <p className="text-muted-foreground text-sm mt-1">
          Signed in as{" "}
          <strong>{user?.primaryEmailAddress?.emailAddress}</strong>
        </p>
        <p className="text-muted-foreground text-sm">
          Clerk ID: <code className="text-xs">{user?.id}</code>
        </p>
      </div>

      <Button onClick={test} disabled={loading}>
        {loading ? "Capturing…" : "Capture a test thought"}
      </Button>

      {error && (
        <div className="rounded-md border border-red-500/40 bg-red-500/10 p-4 text-sm text-red-200">
          <strong>Error:</strong> {error}
        </div>
      )}

      {result && (
        <div className="rounded-md border border-border bg-card/40 p-4 space-y-2 text-sm">
          <p className="text-green-400 font-medium">✅ Capture succeeded</p>
          <pre className="text-xs whitespace-pre-wrap overflow-x-auto">
            {JSON.stringify(result, null, 2)}
          </pre>
        </div>
      )}
    </div>
  );
}
