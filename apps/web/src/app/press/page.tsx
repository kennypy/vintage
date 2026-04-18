import type { Metadata } from 'next';
import Link from 'next/link';
import { FounderHeadshot } from './FounderHeadshot';

/**
 * Press kit landing page. Ships as a scaffold — every asset slot has
 * a "coming soon" fallback, so this page can deploy immediately and
 * assets can be dropped into `apps/web/public/press-kit/` without
 * another code change.
 *
 * Asset manifest + specs: `docs/press-kit/README.md`.
 *
 * When the press inbox is provisioned, update `PRESS_CONTACT_EMAIL`
 * below to the live address.
 */

const PRESS_CONTACT_EMAIL = 'imprensa@vintage.br';

export const metadata: Metadata = {
  title: 'Imprensa',
  description:
    'Kit de imprensa da Vintage.br — logos, capturas de tela, biografia do fundador e ficha técnica para jornalistas e parceiros.',
  openGraph: {
    title: 'Imprensa — Vintage.br',
    description:
      'Kit de imprensa: logos, capturas de tela, biografia e ficha técnica.',
    type: 'website',
  },
  alternates: { canonical: '/press' },
};

interface AssetSlot {
  label: string;
  path: string;
  alt: string;
}

const LOGO_SLOTS: AssetSlot[] = [
  { label: 'Logo principal (SVG)', path: '/press-kit/logo-primary.svg', alt: 'Logo principal Vintage.br' },
  { label: 'Logo monocromático escuro (SVG)', path: '/press-kit/logo-mono-dark.svg', alt: 'Logo monocromático escuro' },
  { label: 'Logo monocromático claro (SVG)', path: '/press-kit/logo-mono-light.svg', alt: 'Logo monocromático claro' },
  { label: 'Wordmark (SVG)', path: '/press-kit/wordmark.svg', alt: 'Wordmark Vintage.br' },
];

const SCREENSHOT_SLOTS: AssetSlot[] = [
  { label: 'Feed do marketplace (mobile)', path: '/press-kit/screenshot-home.png', alt: 'Feed do marketplace no aplicativo' },
  { label: 'Detalhe do anúncio (mobile)', path: '/press-kit/screenshot-listing.png', alt: 'Tela de detalhe do anúncio' },
  { label: 'Checkout PIX (mobile)', path: '/press-kit/screenshot-checkout.png', alt: 'Fluxo de checkout via PIX' },
  { label: 'Carteira e saques (mobile)', path: '/press-kit/screenshot-wallet.png', alt: 'Carteira e solicitação de saques' },
  { label: 'Marketplace web', path: '/press-kit/screenshot-web-home.png', alt: 'Versão web do marketplace' },
];

function Slot({ slot }: { slot: AssetSlot }) {
  return (
    <li className="border border-gray-200 rounded-xl p-4 flex flex-col gap-3">
      <span className="text-sm font-medium text-gray-900">{slot.label}</span>
      <a
        href={slot.path}
        className="text-sm text-brand-600 hover:text-brand-700 underline"
        download
      >
        Baixar asset
      </a>
      <p className="text-xs text-gray-400 italic">
        Se o arquivo ainda não estiver no kit, este link retornará 404.
        Assets são adicionados em <code>apps/web/public/press-kit/</code>.
      </p>
    </li>
  );
}

export default function PressPage() {
  return (
    <main className="min-h-[80vh] px-4 py-10 max-w-4xl mx-auto">
      <h1 className="text-3xl font-bold text-gray-900 mb-2">Imprensa</h1>
      <p className="text-gray-600 mb-10">
        Kit de imprensa oficial da Vintage.br. Use os materiais abaixo para
        cobertura editorial, parcerias e materiais institucionais. Para
        entrevistas ou dados adicionais, entre em contato diretamente.
      </p>

      <section className="mb-10">
        <h2 className="text-xl font-semibold text-gray-900 mb-3">Sobre a Vintage.br</h2>
        <p className="text-sm text-gray-700 leading-relaxed">
          A Vintage.br é o marketplace brasileiro de moda de segunda mão
          pensado para o checkout via PIX, com proteção ao comprador em
          escrow e ferramentas que tornam a venda entre pessoas físicas
          simples e segura. Fundada em {new Date().getFullYear()}, a
          plataforma atende compradores e vendedores em todo o território
          nacional.
        </p>
        <p className="text-xs text-gray-400 italic mt-2">
          (Copie de <code>docs/press-kit/vintage-onepager.pdf</code> quando o
          one-pager estiver finalizado — este parágrafo é placeholder.)
        </p>
      </section>

      <section className="mb-10">
        <h2 className="text-xl font-semibold text-gray-900 mb-3">Logos</h2>
        <ul className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {LOGO_SLOTS.map((slot) => (
            <Slot key={slot.path} slot={slot} />
          ))}
        </ul>
      </section>

      <section className="mb-10">
        <h2 className="text-xl font-semibold text-gray-900 mb-3">Capturas de tela</h2>
        <ul className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {SCREENSHOT_SLOTS.map((slot) => (
            <Slot key={slot.path} slot={slot} />
          ))}
        </ul>
      </section>

      <section className="mb-10">
        <h2 className="text-xl font-semibold text-gray-900 mb-3">Fundador</h2>
        <div className="border border-gray-200 rounded-xl p-4">
          <div className="aspect-square w-32 bg-gray-100 rounded-lg mb-3 overflow-hidden">
            {/* Image drops in as /press-kit/founder-headshot.jpg;
                FounderHeadshot is a client component so the onError
                fallback works when the asset is missing. */}
            <FounderHeadshot />
          </div>
          <p className="text-sm text-gray-700 italic">
            Biografia e foto do fundador serão preenchidas em{' '}
            <code>apps/web/public/press-kit/founder-headshot.jpg</code> e{' '}
            <code>docs/press-kit/founder-bio.md</code>.
          </p>
        </div>
      </section>

      <section className="mb-10">
        <h2 className="text-xl font-semibold text-gray-900 mb-3">One-pager</h2>
        <a
          href="/press-kit/vintage-onepager.pdf"
          download
          className="inline-flex items-center gap-2 text-sm text-brand-600 hover:text-brand-700 underline"
        >
          Baixar one-pager (PDF)
        </a>
        <p className="text-xs text-gray-400 italic mt-2">
          Cobre mercado, diferenciais (PIX-native, escrow, detecção de logos
          falsificados), tração pós-lançamento. Arquivo: <code>apps/web/public/press-kit/vintage-onepager.pdf</code>.
        </p>
      </section>

      <section>
        <h2 className="text-xl font-semibold text-gray-900 mb-3">Contato de imprensa</h2>
        <p className="text-sm text-gray-700">
          Solicitações de entrevista, comentários ou dados adicionais:{' '}
          <a
            href={`mailto:${PRESS_CONTACT_EMAIL}`}
            className="text-brand-600 hover:text-brand-700 underline"
          >
            {PRESS_CONTACT_EMAIL}
          </a>
        </p>
        <p className="text-xs text-gray-400 mt-1">
          Retorno em até 2 dias úteis.
        </p>
      </section>

      <footer className="mt-12 pt-6 border-t border-gray-200 text-xs text-gray-500">
        <Link href="/" className="hover:underline">← Voltar ao marketplace</Link>
      </footer>
    </main>
  );
}
