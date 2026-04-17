import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Configurações | Vintage.br',
  description: 'Ajuste idioma, senha, autenticação em 2 fatores e outras configurações da sua conta.',
};

export default function ConfiguracoesLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
