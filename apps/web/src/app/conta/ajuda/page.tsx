import Link from 'next/link';

const SHORTCUTS = [
  {
    title: 'Central de Ajuda',
    description: 'Artigos, guias e respostas para as dúvidas mais comuns.',
    href: '/help',
  },
  {
    title: 'Contato',
    description: 'Fale com nosso time — respondemos em até 48h úteis.',
    href: '/help#contato',
  },
  {
    title: 'Termos de Uso',
    description: 'Regras e condições para usar o Vintage.br.',
    href: '/terms',
  },
  {
    title: 'Política de Privacidade',
    description: 'Como usamos, armazenamos e protegemos seus dados.',
    href: '/privacy',
  },
];

export default function AjudaPage() {
  return (
    <div className="space-y-4">
      <section className="bg-white border border-gray-200 rounded-xl p-6">
        <h2 className="text-base font-semibold text-gray-900 mb-2">Como podemos ajudar?</h2>
        <p className="text-sm text-gray-500 mb-4">
          Escolha um dos atalhos abaixo ou abra a central de ajuda completa.
        </p>
        <div className="grid sm:grid-cols-2 gap-3">
          {SHORTCUTS.map((s) => (
            <Link
              key={s.href}
              href={s.href}
              className="p-4 border border-gray-200 rounded-xl hover:border-brand-300 hover:bg-brand-50/50 transition"
            >
              <p className="text-sm font-medium text-gray-900">{s.title}</p>
              <p className="text-xs text-gray-500 mt-1">{s.description}</p>
            </Link>
          ))}
        </div>
      </section>

      <section className="bg-white border border-gray-200 rounded-xl p-6">
        <h2 className="text-base font-semibold text-gray-900 mb-2">Problemas com um pedido?</h2>
        <p className="text-sm text-gray-500 mb-4">
          Abra uma disputa diretamente a partir da sua lista de pedidos para ter nossa equipe analisando o caso.
        </p>
        <Link
          href="/orders"
          className="inline-block px-4 py-2 bg-brand-600 text-white rounded-lg text-sm font-medium hover:bg-brand-700 transition"
        >
          Ver meus pedidos
        </Link>
      </section>
    </div>
  );
}
