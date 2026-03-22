// ============================================================
// Vintage.br — Shared Validation Utilities
// ============================================================

import { CEP_REGEX, CPF_REGEX, MIN_OFFER_PERCENTAGE } from './constants';

/**
 * Validate CPF using Modulo 11 algorithm.
 * Returns true if the CPF is valid.
 */
export function isValidCPF(cpf: string): boolean {
  const cleaned = cpf.replace(/\D/g, '');

  if (cleaned.length !== 11) return false;

  // Reject known invalid patterns (all same digits)
  if (/^(\d)\1{10}$/.test(cleaned)) return false;

  // First check digit
  let sum = 0;
  for (let i = 0; i < 9; i++) {
    sum += parseInt(cleaned.charAt(i)) * (10 - i);
  }
  let remainder = (sum * 10) % 11;
  if (remainder === 10) remainder = 0;
  if (remainder !== parseInt(cleaned.charAt(9))) return false;

  // Second check digit
  sum = 0;
  for (let i = 0; i < 10; i++) {
    sum += parseInt(cleaned.charAt(i)) * (11 - i);
  }
  remainder = (sum * 10) % 11;
  if (remainder === 10) remainder = 0;
  if (remainder !== parseInt(cleaned.charAt(10))) return false;

  return true;
}

/**
 * Format CPF as XXX.XXX.XXX-XX
 */
export function formatCPF(cpf: string): string {
  const cleaned = cpf.replace(/\D/g, '');
  return cleaned.replace(/(\d{3})(\d{3})(\d{3})(\d{2})/, '$1.$2.$3-$4');
}

/**
 * Validate CEP (Brazilian postal code).
 */
export function isValidCEP(cep: string): boolean {
  return CEP_REGEX.test(cep);
}

/**
 * Format CEP as XXXXX-XXX
 */
export function formatCEP(cep: string): string {
  const cleaned = cep.replace(/\D/g, '');
  return cleaned.replace(/(\d{5})(\d{3})/, '$1-$2');
}

/**
 * Format BRL currency: 1234.56 → "R$ 1.234,56"
 */
export function formatBRL(value: number): string {
  return value.toLocaleString('pt-BR', {
    style: 'currency',
    currency: 'BRL',
  });
}

/**
 * Calculate buyer protection fee.
 * R$3.50 fixed + 5% of item price
 */
export function calculateBuyerProtectionFee(itemPriceBrl: number): number {
  const fixed = 3.5;
  const percentage = itemPriceBrl * 0.05;
  return Math.round((fixed + percentage) * 100) / 100;
}

/**
 * Validate offer amount (minimum 50% of listing price).
 */
export function isValidOfferAmount(offerBrl: number, listingPriceBrl: number): boolean {
  return offerBrl >= listingPriceBrl * MIN_OFFER_PERCENTAGE;
}

/**
 * Validate email format.
 */
export function isValidEmail(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

/**
 * Validate Brazilian phone number (with or without country code).
 * Accepts: +5511999998888, 11999998888, (11) 99999-8888
 */
export function isValidBrazilianPhone(phone: string): boolean {
  const cleaned = phone.replace(/\D/g, '');
  // 11 digits (with area code) or 13 digits (with +55)
  return cleaned.length === 11 || (cleaned.length === 13 && cleaned.startsWith('55'));
}

/**
 * Validate CPF format matches regex.
 */
export function matchesCPFFormat(cpf: string): boolean {
  return CPF_REGEX.test(cpf);
}
