import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Endereços | Vintage.br',
  description: 'Gerencie os endereços de entrega da sua conta Vintage.br.',
};

export default function AddressesLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
