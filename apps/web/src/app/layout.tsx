import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'Vintage.br — Compre e venda moda de segunda mão',
  description:
    'Marketplace de moda de segunda mão no Brasil. Venda sem taxas, compre com proteção.',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="pt-BR">
      <body>{children}</body>
    </html>
  );
}
