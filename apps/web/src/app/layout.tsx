import { Suspense } from 'react';
import type { Metadata } from 'next';
import Header from '@/components/Header';
import Footer from '@/components/Footer';
import { VerifyIdentityBanner } from '@/components/VerifyIdentityBanner';
import { PostHogProvider } from '@/components/PostHogProvider';
import './globals.css';

const APP_URL = process.env.NEXT_PUBLIC_APP_URL ?? 'https://vintage.br';

export const metadata: Metadata = {
  metadataBase: new URL(APP_URL),
  title: {
    default: 'Vintage.br — Compre e venda moda de segunda mão',
    template: '%s | Vintage.br',
  },
  description:
    'Marketplace de moda de segunda mão no Brasil. Venda sem taxas, compre com proteção.',
  openGraph: {
    type: 'website',
    locale: 'pt_BR',
    url: APP_URL,
    siteName: 'Vintage.br',
    title: 'Vintage.br — Compre e venda moda de segunda mão',
    description:
      'Marketplace de moda de segunda mão no Brasil. Venda sem taxas, compre com proteção.',
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Vintage.br — Compre e venda moda de segunda mão',
    description:
      'Marketplace de moda de segunda mão no Brasil. Venda sem taxas, compre com proteção.',
  },
  robots: {
    index: true,
    follow: true,
  },
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="pt-BR">
      <body className="flex flex-col min-h-screen">
        {/* Suspense boundary: PostHogProvider uses useSearchParams which
            Next 14 App Router wants wrapped to avoid a full-tree client
            render on pages that don't use it. */}
        <Suspense fallback={null}>
          <PostHogProvider>
            <Header />
            <VerifyIdentityBanner />
            <main className="flex-1">{children}</main>
            <Footer />
          </PostHogProvider>
        </Suspense>
      </body>
    </html>
  );
}
