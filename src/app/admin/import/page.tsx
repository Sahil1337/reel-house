import type { Metadata } from "next";

import { ImportView } from "@/components/admin/import/import-view";

export const metadata: Metadata = { title: "Import from TMDB" };

/** Search TMDB live, preview what an import stores and the SQL it runs, then import. */
export default function ImportPage() {
  return (
    <div className="flex flex-1 flex-col gap-6 px-4 py-6 lg:px-6">
      <ImportView />
    </div>
  );
}
