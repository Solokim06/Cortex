"use client";

import Link from "next/link";
import { Home, Search } from "lucide-react";
import { Button } from "@/components/ui/button";

export default function NotFound() {
  return (
    <div className="flex min-h-[70vh] items-center justify-center px-4">
      <div className="max-w-md w-full text-center space-y-6">
        <p className="text-6xl font-semibold text-muted-foreground/30">404</p>

        <div className="space-y-2">
          <h2 className="text-xl font-semibold tracking-tight">
            This page doesn&apos;t exist
          </h2>
          <p className="text-sm text-muted-foreground">
            The page you&apos;re looking for may have been moved or
            doesn&apos;t exist in Cortex.
          </p>
        </div>

        <div className="flex items-center justify-center gap-2">
          <Button asChild size="sm">
            <Link href="/home">
              <Home className="w-4 h-4 mr-1.5" />
              Go home
            </Link>
          </Button>
          <Button asChild variant="outline" size="sm">
            <Link href="/memory">
              <Search className="w-4 h-4 mr-1.5" />
              Search memory
            </Link>
          </Button>
        </div>
      </div>
    </div>
  );
}
