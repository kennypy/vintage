import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Favoritos | Vintage.br',
  description: 'Seus anúncios favoritos no Vintage.br.',
};

export default function FavoritesLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
