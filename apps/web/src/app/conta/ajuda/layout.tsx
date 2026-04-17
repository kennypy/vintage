import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Ajuda | Vintage.br',
  description: 'Atalhos para a central de ajuda, contato e políticas do Vintage.br.',
};

export default function AjudaLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
