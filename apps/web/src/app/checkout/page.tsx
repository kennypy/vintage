'use client';

import { Suspense, useState, useEffect } from 'react';
import Image from 'next/image';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { apiGet, apiPost } from '@/lib/api';
import { formatBRL } from '@/lib/i18n';

interface Address {
  id: string;
  label: string;
  street: string;
  number: string;
  complement?: string;
  neighborhood: string;
  city: string;
  state: string;
  cep: string;
  isDefault?: boolean;
}

type PaymentMethod = 'pix' | 'credit_card' | 'boleto';

export default function CheckoutPageWrapper() {
  return (
    <Suspense fallback={<div className="max-w-3xl mx-auto px-4 py-8"><div className="animate-pulse h-8 bg-gray-200 rounded w-48" /></div>}>
      <CheckoutPage />
    </Suspense>
  );
}

// Anything that flows into the checkout page from the URL is attacker-
// controllable — even when the user is logged in, anyone could craft
// a checkout link with their own listingId / title / price / image
// and trick the user into paying. The fields below are display-only
// (the API authoritatively re-prices when the order is created), but
// we still validate at the boundary so an XSS or rendering glitch
// can't be smuggled in via the search params.
const LISTING_ID_RE = /^[a-z0-9_-]{8,64}$/i;       // cuid / nanoid shape
const SAFE_TITLE_RE = /^[\p{L}\p{N} '\-_,.!?()&]{1,200}$/u;
const SAFE_IMAGE_HOSTS = new Set([
  'vintage.br',
  'cdn.vintage.br',
  'assets.vintage.br',
  'images.unsplash.com',  // dev placeholder
  'picsum.photos',         // dev placeholder
]);

function isSafeImageUrl(raw: string): boolean {
  if (!raw) return false;
  try {
    const u = new URL(raw);
    if (u.protocol !== 'https:') return false;
    return SAFE_IMAGE_HOSTS.has(u.hostname) || u.hostname.endsWith('.r2.cloudflarestorage.com');
  } catch {
    return false;
  }
}

function CheckoutPage() {
  const router = useRouter();
  const searchParams = useSearchParams();

  const rawListingId = searchParams.get('listingId') ?? '';
  const rawTitle = searchParams.get('title') ?? 'Item';
  const rawPrice = searchParams.get('price') ?? '0';
  const rawImage = searchParams.get('image') ?? '';

  // Refuse pathological input rather than trying to render it. The
  // server still re-validates the listing on order creation; this is
  // about not propagating attacker-controlled goo through the UI.
  const listingId = LISTING_ID_RE.test(rawListingId) ? rawListingId : '';
  const title = SAFE_TITLE_RE.test(rawTitle) ? rawTitle : 'Item';
  const parsedPrice = Number(rawPrice);
  const priceBrl =
    Number.isFinite(parsedPrice) && parsedPrice >= 0 && parsedPrice <= 1_000_000
      ? parsedPrice
      : 0;
  const imageUrl = isSafeImageUrl(rawImage) ? rawImage : '';

  const [addresses, setAddresses] = useState<Address[]>([]);
  const [selectedAddress, setSelectedAddress] = useState<Address | null>(null);
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>('pix');
  const [installments, setInstallments] = useState(1);
  const [couponInput, setCouponInput] = useState('');
  const [couponResult, setCouponResult] = useState<{ discountBrl: number; code: string } | null>(null);
  const [couponError, setCouponError] = useState('');
  const [applyingCoupon, setApplyingCoupon] = useState(false);
  const [paying, setPaying] = useState(false);
  const [loading, setLoading] = useState(true);

  const shippingCost = 18.9;
  const buyerProtectionFee = 3.5 + priceBrl * 0.05;
  const subtotal = priceBrl + shippingCost + buyerProtectionFee;
  const discount = couponResult?.discountBrl ?? 0;
  const total = Math.max(0, subtotal - discount);

  useEffect(() => {
    const token = typeof window !== 'undefined' ? localStorage.getItem('vintage_token') : null;
    if (!token) {
      router.push('/auth/login');
      return;
    }
    if (!listingId) {
      router.push('/listings');
      return;
    }

    apiGet<Address[] | { data: Address[] }>('/users/me/addresses')
      .then((res) => {
        const list = Array.isArray(res) ? res : (res.data ?? []);
        setAddresses(list);
        setSelectedAddress(list.find((a) => a.isDefault) ?? list[0] ?? null);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [router, listingId]);

  const handleApplyCoupon = async () => {
    const trimmed = couponInput.trim().toUpperCase();
    if (!trimmed) return;
    setApplyingCoupon(true);
    setCouponError('');
    setCouponResult(null);
    try {
      const result = await apiPost<{ valid: boolean; discountBrl: number }>('/coupons/validate', { code: trimmed, orderTotal: subtotal });
      if (result.valid) {
        setCouponResult({ discountBrl: result.discountBrl, code: trimmed });
      } else {
        setCouponError('Cupom invalido ou expirado.');
      }
    } catch {
      setCouponError('Cupom invalido ou expirado.');
    } finally {
      setApplyingCoupon(false);
    }
  };

  const handlePay = async () => {
    if (!selectedAddress) {
      alert('Selecione um endereco de entrega.');
      return;
    }
    setPaying(true);
    try {
      await apiPost('/orders', {
        listingId,
        addressId: selectedAddress.id,
        paymentMethod,
        installments: paymentMethod === 'credit_card' ? installments : undefined,
        couponCode: couponResult?.code,
      });
      router.push('/orders');
    } catch {
      alert('Erro ao processar pagamento. Tente novamente.');
    } finally {
      setPaying(false);
    }
  };

  if (loading) {
    return (
      <div className="max-w-3xl mx-auto px-4 py-8">
        <div className="animate-pulse space-y-6">
          <div className="h-8 bg-gray-200 rounded w-48" />
          <div className="h-32 bg-gray-200 rounded-xl" />
          <div className="h-48 bg-gray-200 rounded-xl" />
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      <h1 className="text-2xl font-bold text-gray-900 mb-6">Finalizar compra</h1>

      <div className="space-y-6">
        {/* Item summary */}
        <div className="bg-white border border-gray-200 rounded-xl p-4 flex gap-4">
          <div className="relative w-20 h-20 bg-gray-100 rounded-lg overflow-hidden flex-shrink-0">
            {imageUrl ? (
              <Image src={imageUrl} alt={title} fill className="object-cover" sizes="80px" />
            ) : (
              <div className="w-full h-full flex items-center justify-center text-gray-300">
                <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                </svg>
              </div>
            )}
          </div>
          <div>
            <p className="text-sm font-medium text-gray-900">{title}</p>
            <p className="text-lg font-bold text-brand-600 mt-1">{formatBRL(priceBrl)}</p>
          </div>
        </div>

        {/* Delivery address */}
        <div className="bg-white border border-gray-200 rounded-xl p-4">
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-sm font-semibold text-gray-900">Endereco de entrega</h2>
            <Link href="/profile" className="text-xs text-brand-600 hover:text-brand-700">Gerenciar</Link>
          </div>
          {addresses.length === 0 ? (
            <Link
              href="/profile"
              className="flex items-center gap-3 p-4 border-2 border-dashed border-brand-400 rounded-xl hover:bg-brand-50 transition"
            >
              <svg className="w-8 h-8 text-brand-600 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v3m0 0v3m0-3h3m-3 0H9m12 0a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              <div>
                <p className="text-sm font-semibold text-brand-600">Adicionar endereco de entrega</p>
                <p className="text-xs text-gray-500 mt-0.5">Voce precisa cadastrar um endereco para finalizar a compra</p>
              </div>
            </Link>
          ) : (
            <div className="space-y-2">
              {addresses.map((addr) => (
                <button
                  key={addr.id}
                  type="button"
                  onClick={() => setSelectedAddress(addr)}
                  className={`w-full text-left p-3 rounded-lg border-2 transition text-sm ${
                    selectedAddress?.id === addr.id
                      ? 'border-brand-600 bg-brand-50'
                      : 'border-gray-200 hover:border-gray-300'
                  }`}
                >
                  <p className="font-medium text-gray-900">{addr.label}</p>
                  <p className="text-gray-500 text-xs mt-0.5">
                    {addr.street}, {addr.number}{addr.complement ? ` - ${addr.complement}` : ''} — {addr.neighborhood}, {addr.city}/{addr.state} — CEP {addr.cep}
                  </p>
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Payment method */}
        <div className="bg-white border border-gray-200 rounded-xl p-4">
          <h2 className="text-sm font-semibold text-gray-900 mb-3">Forma de pagamento</h2>
          <div className="grid grid-cols-3 gap-2">
            {([
              { key: 'pix' as const, label: 'PIX', desc: 'Aprovacao instantanea' },
              { key: 'credit_card' as const, label: 'Cartao', desc: 'Ate 12x' },
              { key: 'boleto' as const, label: 'Boleto', desc: '1-3 dias uteis' },
            ]).map((pm) => (
              <button
                key={pm.key}
                type="button"
                onClick={() => setPaymentMethod(pm.key)}
                className={`p-3 rounded-lg border-2 text-center transition ${
                  paymentMethod === pm.key
                    ? 'border-brand-600 bg-brand-50'
                    : 'border-gray-200 hover:border-gray-300'
                }`}
              >
                <p className="text-sm font-medium text-gray-900">{pm.label}</p>
                <p className="text-xs text-gray-500 mt-0.5">{pm.desc}</p>
              </button>
            ))}
          </div>

          {paymentMethod === 'credit_card' && (
            <div className="mt-4">
              <label className="text-xs text-gray-500 mb-1 block">Parcelas</label>
              <select
                value={installments}
                onChange={(e) => setInstallments(Number(e.target.value))}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-600"
              >
                {[1, 2, 3, 6, 10, 12].map((n) => (
                  <option key={n} value={n}>
                    {n}x de {formatBRL(total / n)}{n === 1 ? ' (à vista)' : ''}
                  </option>
                ))}
              </select>
            </div>
          )}
        </div>

        {/* Coupon */}
        <div className="bg-white border border-gray-200 rounded-xl p-4">
          <h2 className="text-sm font-semibold text-gray-900 mb-3">Cupom de desconto</h2>
          {couponResult ? (
            <div className="flex items-center justify-between bg-green-50 px-3 py-2 rounded-lg">
              <span className="text-sm text-green-700 font-medium">
                {couponResult.code} — desconto de {formatBRL(couponResult.discountBrl)}
              </span>
              <button
                type="button"
                onClick={() => { setCouponResult(null); setCouponInput(''); }}
                className="text-xs text-red-500 hover:underline"
              >
                Remover
              </button>
            </div>
          ) : (
            <div className="flex gap-2">
              <input
                type="text"
                value={couponInput}
                onChange={(e) => setCouponInput(e.target.value)}
                placeholder="Digite o codigo do cupom"
                className="flex-1 border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-600"
              />
              <button
                type="button"
                onClick={handleApplyCoupon}
                disabled={applyingCoupon}
                className="px-4 py-2 bg-gray-900 text-white rounded-lg text-sm font-medium hover:bg-gray-800 transition disabled:opacity-50"
              >
                {applyingCoupon ? 'Validando...' : 'Aplicar'}
              </button>
            </div>
          )}
          {couponError && <p className="text-xs text-red-500 mt-2">{couponError}</p>}
        </div>

        {/* Price breakdown */}
        <div className="bg-white border border-gray-200 rounded-xl p-4 space-y-2">
          <div className="flex justify-between text-sm text-gray-600">
            <span>Produto</span>
            <span>{formatBRL(priceBrl)}</span>
          </div>
          <div className="flex justify-between text-sm text-gray-600">
            <span>Frete</span>
            <span>{formatBRL(shippingCost)}</span>
          </div>
          <div className="flex justify-between text-sm text-gray-600">
            <span>Protecao ao comprador</span>
            <span>{formatBRL(buyerProtectionFee)}</span>
          </div>
          {discount > 0 && (
            <div className="flex justify-between text-sm text-green-600">
              <span>Desconto</span>
              <span>-{formatBRL(discount)}</span>
            </div>
          )}
          <div className="border-t border-gray-200 pt-2 flex justify-between text-base font-bold text-gray-900">
            <span>Total</span>
            <span>{formatBRL(total)}</span>
          </div>
        </div>

        {/* Buyer protection */}
        <div className="flex items-center gap-3 p-4 bg-green-50 rounded-xl">
          <svg className="w-5 h-5 text-green-600 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
          </svg>
          <p className="text-sm text-green-700">
            Sua compra e protegida. Reembolso garantido se o item nao corresponder ao anuncio.
          </p>
        </div>

        {/* Pay button */}
        <button
          type="button"
          onClick={handlePay}
          disabled={paying || !selectedAddress}
          className="w-full py-4 bg-brand-600 text-white rounded-xl font-semibold text-lg hover:bg-brand-700 transition disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {paying ? 'Processando...' : `Pagar ${formatBRL(total)}`}
        </button>
      </div>
    </div>
  );
}
