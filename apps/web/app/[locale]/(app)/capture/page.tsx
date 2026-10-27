"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { CaptureBox } from "@/components/capture/CaptureBox";
import { VoiceRecorder } from "@/components/capture/VoiceRecorder";
import {
  CaptureResult,
  type CaptureNode,
} from "@/components/capture/CaptureResult";
import { RecentCaptures } from "@/components/capture/RecentCaptures";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";

type VoiceCaptureResult = {
  transcript: string;
  language: string;
  duration: number | null;
  node: CaptureNode | null;
  error: string | null;
};

export default function CapturePage() {
  const t = useTranslations("capture.page");
  const [lastNode, setLastNode] = useState<CaptureNode | null>(null);

  const signalRefetch = () => {
    setTimeout(() => {
      window.dispatchEvent(new CustomEvent("cortex:capture"));
    }, 300);
  };

  const handleTextCapture = (node: CaptureNode) => {
    setLastNode(node);
    signalRefetch();
  };

  const handleVoiceCapture = (result: VoiceCaptureResult) => {
    if (result.node) {
      setLastNode(result.node);
      signalRefetch();
    }
  };

  return (
    <div className="space-y-8 max-w-3xl">
      <div>
        <h1 className="text-3xl font-semibold tracking-tight">
          {t("title")}
        </h1>
        <p className="mt-2 text-muted-foreground">
          {t("subtitle")}
        </p>
      </div>

      <CaptureBox onCaptured={handleTextCapture} />

      <Card
        id="voice-capture-card"
        className="bg-card/40 border-border/60 transition-all duration-300"
      >
        <CardHeader className="pb-3">
          <CardTitle className="text-base font-medium">
            {t("voiceTitle")}
          </CardTitle>
        </CardHeader>
        <CardContent>
          <VoiceRecorder onCaptured={handleVoiceCapture} />
        </CardContent>
      </Card>

      {lastNode && (
        <CaptureResult node={lastNode} onDismiss={() => setLastNode(null)} />
      )}

      <Separator />

      <RecentCaptures />
    </div>
  );
}
