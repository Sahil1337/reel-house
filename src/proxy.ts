/**
 * Route guard that runs before every page request (pages still verify again on the server).
 *   signed out on an app page   → /sign-in?next=<the page>   (includes /admin; the admin layout checks the role)
 *   signed in on /sign-in|up    → /profiles
 * "Signed in" means the session cookie carries a valid signature; a missing profile is left to
 * the pages, which send you to /profiles.
 */
import { NextResponse, type NextRequest } from "next/server";

import { verifySessionToken } from "@/server/auth/session-token";
import { SESSION_COOKIE } from "@/lib/constants";

const APP_PREFIXES = [
  "/browse",
  "/search",
  "/title",
  "/watch",
  "/my-list",
  "/history",
  "/account",
  "/profiles",
  "/onboarding",
  "/admin",
];
const AUTH_PAGES = ["/sign-in", "/sign-up"];

const matches = (path: string, prefixes: string[]) =>
  prefixes.some((prefix) => path === prefix || path.startsWith(`${prefix}/`));

export function proxy(request: NextRequest) {
  const { pathname, search } = request.nextUrl;
  const signedIn = verifySessionToken(request.cookies.get(SESSION_COOKIE)?.value) !== null;

  if (signedIn && matches(pathname, AUTH_PAGES)) {
    return NextResponse.redirect(new URL("/profiles", request.url));
  }
  if (!signedIn && matches(pathname, APP_PREFIXES)) {
    const url = new URL("/sign-in", request.url);
    url.searchParams.set("next", `${pathname}${search}`);
    return NextResponse.redirect(url);
  }
  return NextResponse.next();
}

export const config = {
  // API routes answer 401 themselves; skip them, Next internals and static files.
  matcher: ["/((?!api|_next/static|_next/image|favicon.ico|icon.svg|.*\\.(?:png|jpg|jpeg|svg|ico|webp)$).*)"],
};
