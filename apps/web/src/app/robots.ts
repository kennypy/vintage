import type { MetadataRoute } from 'next';

const APP_URL = process.env.NEXT_PUBLIC_APP_URL ?? 'https://vintage.br';

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: '*',
        allow: '/',
        disallow: [
          '/admin/',
          '/checkout/',
          '/messages/',
          '/orders/',
          '/my-listings/',
          '/wallet/',
          '/profile/',
          '/favorites/',
          '/notifications/',
          '/offers/',
          '/sell/',
          '/reviews/write/',
        ],
      },
    ],
    sitemap: `${APP_URL}/sitemap.xml`,
  };
}
