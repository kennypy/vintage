import { apiFetch } from './api';

export interface Address {
  id: string;
  label: string;
  street: string;
  number: string;
  complement?: string;
  neighborhood: string;
  city: string;
  state: string;
  cep: string;
  isDefault: boolean;
}

export interface CreateAddressData {
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

export async function getAddresses(): Promise<Address[]> {
  return apiFetch<Address[]>('/users/me/addresses');
}

export async function createAddress(data: CreateAddressData): Promise<Address> {
  return apiFetch<Address>('/users/me/addresses', {
    method: 'POST',
    body: JSON.stringify(data),
  });
}

export async function deleteAddress(addressId: string): Promise<void> {
  await apiFetch<void>(`/users/me/addresses/${encodeURIComponent(addressId)}`, {
    method: 'DELETE',
  });
}
