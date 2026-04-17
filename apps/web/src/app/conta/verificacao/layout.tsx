import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Verificação | Vintage.br',
  description: 'Verifique sua identidade, e-mail, telefone e CPF no Vintage.br.',
};

export default function VerificacaoLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
