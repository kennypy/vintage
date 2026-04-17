import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Abrir disputa | Vintage.br',
  description: 'Registre um problema com um pedido no Vintage.br.',
};

export default function DisputeLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
