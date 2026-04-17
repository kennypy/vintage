import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Notificações | Vintage.br',
  description: 'Acompanhe atualizações de pedidos, ofertas, mensagens e novidades no Vintage.br.',
};

export default function NotificationsLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
