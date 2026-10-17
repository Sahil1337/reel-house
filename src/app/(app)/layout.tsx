import { requireUser } from "@/server/session/current-session";

/** Everything under (app) needs a signed-in user; proxy.ts does the optimistic check first. */
export default async function SignedInLayout({ children }: LayoutProps<"/">) {
  await requireUser();
  return children;
}
