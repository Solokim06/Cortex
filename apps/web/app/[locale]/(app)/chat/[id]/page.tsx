"use client";

import { Suspense } from "react";
import { useParams, useSearchParams } from "next/navigation";
import { ChatPanel } from "@/components/chat/ChatPanel";

function ChatWithIdInner() {
  const params = useParams<{ id: string }>();
  const searchParams = useSearchParams();
  const conversationId = typeof params?.id === "string" ? params.id : null;
  const initialQuestion = searchParams.get("q") ?? undefined;

  return (
    <ChatPanel
      conversationId={conversationId}
      initialQuestion={initialQuestion}
    />
  );
}

export default function ChatWithIdPage() {
  return (
    <Suspense fallback={null}>
      <ChatWithIdInner />
    </Suspense>
  );
}
