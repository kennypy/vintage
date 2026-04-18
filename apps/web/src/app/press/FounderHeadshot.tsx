'use client';

/**
 * Client-only helper so the press page (a server component) can still
 * fall back gracefully when the founder headshot hasn't been dropped
 * in yet — the onError handler needs a client runtime. Kept in its
 * own file so the rest of /press stays server-rendered.
 */
export function FounderHeadshot() {
  return (
    <img
      src="/press-kit/founder-headshot.jpg"
      alt="Retrato do fundador"
      className="w-full h-full object-cover"
      onError={(e) => {
        (e.currentTarget as HTMLImageElement).style.display = 'none';
      }}
    />
  );
}
