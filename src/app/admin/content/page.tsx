import type { Metadata } from "next";

import { ContentView } from "@/components/admin/content/content-view";

export const metadata: Metadata = { title: "Content" };

/** Browse the catalogue, edit a title's details, or remove a title after seeing what the delete cascades to. */
export default function ContentPage() {
  return (
    <div className="flex flex-1 flex-col gap-6 px-4 py-6 lg:px-6">
      <ContentView />
    </div>
  );
}
