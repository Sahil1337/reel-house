import { DashboardSquare01Icon, DatabaseImportIcon } from "@hugeicons/core-free-icons";

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
    href: "/admin/import",
    title: "Import from TMDB",
    description: "Find a title on TMDB, preview what it stores and the SQL that stores it.",
    icon: DatabaseImportIcon,
  },
];

/** The nav item for a path: exact match for the dashboard, prefix match for the rest. */
export function findAdminNavItem(pathname: string): AdminNavItem {
  return (
    ADMIN_NAV.find((item) => (item.href === "/admin" ? pathname === item.href : pathname.startsWith(item.href))) ??
    ADMIN_NAV[0]
  );
}
