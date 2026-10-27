import {
  Home,
  Sparkles,
  MessageSquare,
  Brain,
  GraduationCap,
  GitBranch,
  Lightbulb,
  User as UserIcon,
  Settings,
  LifeBuoy,
  Shield,
  type LucideIcon,
} from "lucide-react";

export type NavItem = {
  href: string;
  label: string;
  icon: LucideIcon;
  hint?: string;
};

export const NAV_ITEMS: NavItem[] = [
  { href: "/home", label: "Home", icon: Home, hint: "Your daily briefing" },
  { href: "/capture", label: "Capture", icon: Sparkles, hint: "Add a thought" },
  { href: "/chat", label: "Chat", icon: MessageSquare, hint: "Talk to Cortex" },
  { href: "/memory", label: "Memory", icon: Brain, hint: "Search your mind" },
  {
    href: "/learning",
    label: "Learning",
    icon: GraduationCap,
    hint: "Goals and plans",
  },
  {
    href: "/decisions",
    label: "Decisions",
    icon: GitBranch,
    hint: "Think through choices",
  },
  {
    href: "/reflections",
    label: "Reflections",
    icon: Lightbulb,
    hint: "Lessons and reports",
  },
  {
    href: "/identity",
    label: "Identity",
    icon: UserIcon,
    hint: "Your self-model",
  },
  {
    href: "/help",
    label: "Help",
    icon: LifeBuoy,
    hint: "Help and feedback",
  },
];

export const SECONDARY_NAV_ITEMS: NavItem[] = [
  {
    href: "/settings",
    label: "Settings",
    icon: Settings,
    hint: "Account and extension",
  },
];

/**
 * Admin-only nav entry.
 *
 * NOT included in NAV_ITEMS --- the Sidebar conditionally appends this
 * when the current user has is_admin: true (checked via useAdminMe).
 *
 * Placed at the end so it sits below Help in the sidebar, which reads
 * as "admin area below user areas".
 */
export const ADMIN_NAV_ITEM: NavItem = {
  href: "/admin",
  label: "Admin",
  icon: Shield,
  hint: "Triage tickets and settings",
};
