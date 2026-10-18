import {
  CreditCardIcon,
  DashboardSquare01Icon,
  DatabaseImportIcon,
  Film01Icon,
  Tag01Icon,
} from "@hugeicons/core-free-icons";

export interface AdminNavItem {
  href: string;
  title: string;
  /** One-liner shown in the header next to the title. */
  description: string;
  icon: typeof DashboardSquare01Icon;
}

export const ADMIN_NAV: AdminNavItem[] = [
  {
    href: "/admin",
    title: "Dashboard",
    description: "Accounts, revenue and the catalogue at a glance, each with the query behind it.",
    icon: DashboardSquare01Icon,
  },
  {
    href: "/admin/content",
    title: "Content",
    description: "Browse the catalogue, remove a title and see what the delete cascades to.",
    icon: Film01Icon,
  },
  {
    href: "/admin/import",
    title: "Import from TMDB",
    description: "Find a title on TMDB, preview what it stores and the SQL that stores it.",
    icon: DatabaseImportIcon,
  },
  {
    href: "/admin/plans",
    title: "Plans",
    description: "Add, edit and delete subscription plans, each with the SQL it runs.",
    icon: Tag01Icon,
  },
  {
    href: "/admin/subscriptions",
    title: "Subscriptions",
    description: "Every subscription with its user and plan: cancel, extend or change plan.",
    icon: CreditCardIcon,
  },
];

/** The nav item for a path: exact match for the dashboard, prefix match for the rest. */
export function findAdminNavItem(pathname: string): AdminNavItem {
  return (
    ADMIN_NAV.find((item) => (item.href === "/admin" ? pathname === item.href : pathname.startsWith(item.href))) ??
    ADMIN_NAV[0]
  );
}
