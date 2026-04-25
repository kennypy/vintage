import { NextRequest, NextResponse } from 'next/server';

// Route-level auth gate. Matches every protected path; if the HttpOnly
// session cookie isn't present, redirect to /auth/login with a `next`
// param so the user lands back where they started after signing in.
//
// We deliberately DON'T verify the JWT signature here — that's the API's
// job. Middleware only checks for the cookie's presence, which is enough
// to short-circuit a no-flicker redirect on cold loads. A spoofed cookie
// gets rejected on the first /api/v1/* call (401 → clearAuthToken →
// redirect to login). Costs: zero crypto in middleware, faster TTFB,
// no shared secret between web and API needed at the edge.
//
// Public paths (homepage, auth, marketing/info, listing detail, seller
// profile, robots.txt, sitemap.xml, .well-known) are explicitly excluded.

const PUBLIC_PATH_PREFIXES: readonly string[] = [
  '/auth',
  '/about',
  '/sobre',
  '/help',
  '/ajuda',
  '/contato',
  '/contact',
  '/community-guidelines',
  '/diretrizes-comunidade',
  '/press',
  '/privacidade',
  '/privacy',
  '/termos',
  '/terms',
  '/listings',     // public listing detail
  '/seller',       // public seller profile
  '/users',        // public user profile (display only; mutations gated by API)
  '/report',       // public report-listing form
  '.well-known',
];

const PUBLIC_PATH_EXACT: ReadonlySet<string> = new Set([
  '/',
  '/robots.txt',
  '/sitemap.xml',
]);

const SESSION_COOKIE = 'vintage_session';

function isPublic(pathname: string): boolean {
  if (PUBLIC_PATH_EXACT.has(pathname)) return true;
  for (const prefix of PUBLIC_PATH_PREFIXES) {
    if (pathname === prefix || pathname.startsWith(`${prefix}/`)) return true;
  }
  return false;
}

export function middleware(req: NextRequest) {
  const { pathname, search } = req.nextUrl;
  if (isPublic(pathname)) return NextResponse.next();

  const hasSession = req.cookies.get(SESSION_COOKIE)?.value;
  if (hasSession) return NextResponse.next();

  const loginUrl = req.nextUrl.clone();
  loginUrl.pathname = '/auth/login';
  // Preserve the originally-requested path so /auth/login can bounce back.
  loginUrl.searchParams.set('next', `${pathname}${search ?? ''}`);
  return NextResponse.redirect(loginUrl);
}

export const config = {
  // Skip Next internals + static assets so we don't pay the middleware
  // cost on every CSS/JS chunk request.
  matcher: ['/((?!_next/|favicon|images/|fonts/|api/|.*\\.(?:png|jpg|jpeg|svg|gif|ico|webp|css|js|map|woff2?|ttf)$).*)'],
};
