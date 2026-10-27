"use client";

import { useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";
import {
  MessageSquare,
  GraduationCap,
  GitBranch,
  Plus,
} from "lucide-react";
import { HomeGreeting } from "@/components/home/HomeGreeting";
import { ActivityStats } from "@/components/home/ActivityStats";
import { QuickCapture } from "@/components/home/QuickCapture";
import { IdentityBanner } from "@/components/home/IdentityBanner";
import { TodayFocus } from "@/components/home/TodayFocus";
import { RecentCapturesFeed } from "@/components/home/RecentCapturesFeed";
import { DecisionsDue } from "@/components/home/DecisionsDue";
import { LatestLesson } from "@/components/home/LatestLesson";

export default function HomePage() {
  const t = useTranslations("home.page");

  return (
    <div className="space-y-6 max-w-5xl">
      {/* Personalized greeting */}
      <HomeGreeting />

      {/* Activity stats */}
      <ActivityStats />

      {/* Quick capture */}
      <QuickCapture />

      {/* Identity banner */}
      <IdentityBanner />

      {/* Primary briefing grid */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        <TodayFocus />
        <RecentCapturesFeed />
        <DecisionsDue />
      </div>

      {/* Latest lesson — full width */}
      <div className="grid gap-4 md:grid-cols-2">
        <LatestLesson />
      </div>

      {/* Quick actions */}
      <div>
        <h2 className="text-sm font-medium text-muted-foreground mb-3">
          {t("quickActionsHeading")}
        </h2>
        <div className="grid gap-3 grid-cols-2 md:grid-cols-4">
          <QuickAction
            href="/capture"
            icon={<Plus className="w-4 h-4" />}
            title={t("actionCaptureTitle")}
            description={t("actionCaptureDescription")}
          />
          <QuickAction
            href="/chat"
            icon={<MessageSquare className="w-4 h-4" />}
            title={t("actionChatTitle")}
            description={t("actionChatDescription")}
          />
          <QuickAction
            href="/learning"
            icon={<GraduationCap className="w-4 h-4" />}
            title={t("actionLearnTitle")}
            description={t("actionLearnDescription")}
          />
          <QuickAction
            href="/decisions"
            icon={<GitBranch className="w-4 h-4" />}
            title={t("actionDecideTitle")}
            description={t("actionDecideDescription")}
          />
        </div>
      </div>
    </div>
  );
}

function QuickAction({
  href,
  icon,
  title,
  description,
}: {
  href: string;
  icon: React.ReactNode;
  title: string;
  description: string;
}) {
  return (
    <Link
      href={href}
      className="group rounded-lg border border-border bg-card/40 p-3.5 transition-colors hover:bg-card hover:border-primary/40"
    >
      <div className="text-primary mb-2">{icon}</div>
      <h3 className="text-sm font-medium">{title}</h3>
      <p className="mt-0.5 text-xs text-muted-foreground line-clamp-2">
        {description}
      </p>
    </Link>
  );
}
