import {
  BarChart3,
  Bell,
  CalendarClock,
  Compass,
  FolderPlus,
  Inbox,
  Landmark,
  LayoutDashboard,
  Layers,
  FileText,
  ListChecks,
  PieChart,
  Plug,
  Settings,
  ShieldCheck,
  Ticket,
  Users,
  type LucideIcon,
} from "lucide-react";

export type NavItem = {
  href: string;
  label: string;
  icon: LucideIcon;
};

/**
 * v1 nav order per Section 11.1. Performance, Risk, Trading, Documents and
 * Reports stay OUT of the nav until their phases exist; no disabled placeholders.
 */
export const NAV_ITEMS: NavItem[] = [
  { href: "/", label: "Dashboard", icon: LayoutDashboard },
  { href: "/advisor", label: "Advisor Center", icon: Compass },
  { href: "/analytics", label: "Analytics", icon: BarChart3 },
  { href: "/portfolio-review", label: "Portfolio Review", icon: PieChart },
  { href: "/clients", label: "Clients", icon: Users },
  { href: "/accounts", label: "Accounts", icon: Landmark },
  { href: "/contacts", label: "Contacts & SLAs", icon: CalendarClock },
  { href: "/intake", label: "Intake Pipeline", icon: Inbox },
  { href: "/onboarding", label: "Onboarding", icon: FolderPlus },
  { href: "/proposals", label: "Proposals", icon: FileText },
  { href: "/models", label: "Models", icon: Layers },
  { href: "/tickets", label: "Tickets", icon: Ticket },
  { href: "/workflows", label: "Workflows", icon: ListChecks },
  { href: "/compliance", label: "Compliance", icon: ShieldCheck },
  { href: "/integrations", label: "Integrations", icon: Plug },
  { href: "/notifications", label: "Notifications", icon: Bell },
  { href: "/settings", label: "Settings", icon: Settings },
];
