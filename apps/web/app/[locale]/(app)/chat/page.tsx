"use client";

import { Suspense } from "react";
import { useSearchParams } from "next/navigation";
import { ChatPanel } from "@/components/chat/ChatPanel";

function ChatPageInner() {
  const searchParams = useSearchParams();
  const initialQuestion = searchParams.get("q") ?? undefined;
  return <ChatPanel initialQuestion={initialQuestion} />;
}

export default function ChatPage() {
  return (
    <Suspense fallback={null}>
      <ChatPageInner />
    </Suspense>
  );
}
