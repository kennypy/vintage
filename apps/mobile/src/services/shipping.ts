import { apiFetch } from './api';

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
