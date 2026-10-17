import { Logo } from "@/components/layout/logo";
import { PosterWall } from "@/components/marketing/poster-wall";
import { serverApi } from "@/lib/api/server";

/** Centered card over a dim, slowly drifting poster wall. */
export default async function AuthLayout({ children }: LayoutProps<"/">) {
  const posters = await serverApi.searchContent({ limit: 18 });
  return (
    <div className="relative isolate flex min-h-dvh flex-col">
      <PosterWall items={posters} className="-z-20 opacity-25" />
      <div
        aria-hidden="true"
        className="absolute inset-0 -z-10 bg-linear-to-b from-background/80 via-background/90 to-background"
      />
      <header className="flex h-16 shrink-0 items-center px-4 sm:px-8 lg:px-12">
        <Logo />
      </header>
      <main className="flex flex-1 items-start justify-center px-4 pt-4 pb-16 sm:items-center sm:pt-0">{children}</main>
    </div>
  );
}
