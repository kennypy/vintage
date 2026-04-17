import { apiFetch } from './api';

export interface CepLookupResult {
  cep: string;
  street: string;
  neighborhood: string;
  city: string;
  state: string;
}

/**
 * Look up a Brazilian CEP via ViaCEP. Returns null when the CEP is not found
 * or the service is unavailable — callers should fall back to manual entry.
 */
export async function lookupCep(cep: string): Promise<CepLookupResult | null> {
  const digits = cep.replace(/\D/g, '');
  if (digits.length !== 8) return null;
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 5000);
    const res = await fetch(`https://viacep.com.br/ws/${digits}/json/`, {
      signal: controller.signal,
    });
    clearTimeout(timeout);
    if (!res.ok) return null;
    const data = await res.json() as {
      cep?: string;
      logradouro?: string;
      bairro?: string;
      localidade?: string;
      uf?: string;
      erro?: boolean;
    };
    if (data.erro) return null;
    return {
      cep: data.cep ?? `${digits.slice(0, 5)}-${digits.slice(5)}`,
      street: data.logradouro ?? '',
      neighborhood: data.bairro ?? '',
      city: data.localidade ?? '',
      state: data.uf ?? '',
    };
  } catch {
    return null;
  }
}

export interface ShippingOption {
  carrier: string;
  service: string;
  priceBrl: number;
  estimatedDays: number;
}

export interface ShippingRatesResponse {
  options: ShippingOption[];
}

export async function calculateShipping(
  originCep: string,
  destinationCep: string,
  weightG: number,
): Promise<ShippingRatesResponse> {
  return apiFetch<ShippingRatesResponse>('/shipping/rates', {
    method: 'POST',
    body: JSON.stringify({ originCep, destinationCep, weightG }),
  });
}
