// ============================================================
// Vintage.br — Shared Validation Utilities
// ============================================================

import { CEP_REGEX, CNPJ_REGEX, CPF_REGEX, MIN_OFFER_PERCENTAGE } from './constants';

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

/**
 * Validate CNPJ using Modulo 11 algorithm.
 * Returns true if the CNPJ is valid.
 */
export function isValidCNPJ(cnpj: string): boolean {
  const cleaned = cnpj.replace(/\D/g, '');

  if (cleaned.length !== 14) return false;

  // Reject known invalid patterns (all same digits)
  if (/^(\d)\1{13}$/.test(cleaned)) return false;

  // First check digit (weights: 5,4,3,2,9,8,7,6,5,4,3,2)
  const weights1 = [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2];
  let sum = 0;
  for (let i = 0; i < 12; i++) {
    sum += parseInt(cleaned.charAt(i)) * weights1[i];
  }
  let remainder = sum % 11;
  const digit1 = remainder < 2 ? 0 : 11 - remainder;
  if (digit1 !== parseInt(cleaned.charAt(12))) return false;

  // Second check digit (weights: 6,5,4,3,2,9,8,7,6,5,4,3,2)
  const weights2 = [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2];
  sum = 0;
  for (let i = 0; i < 13; i++) {
    sum += parseInt(cleaned.charAt(i)) * weights2[i];
  }
  remainder = sum % 11;
  const digit2 = remainder < 2 ? 0 : 11 - remainder;
  if (digit2 !== parseInt(cleaned.charAt(13))) return false;

  return true;
}

/**
 * Format CNPJ as XX.XXX.XXX/XXXX-XX
 */
export function formatCNPJ(cnpj: string): string {
  const cleaned = cnpj.replace(/\D/g, '');
  return cleaned.replace(
    /(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})/,
    '$1.$2.$3/$4-$5',
  );
}

/**
 * Validate CNPJ format matches regex.
 */
export function matchesCNPJFormat(cnpj: string): boolean {
  return CNPJ_REGEX.test(cnpj);
}

// ── PIX key validation & display ─────────────────────────────────────
// Banco Central defines five PIX key types. Each has a canonical format
// the cash-out integration (Mercado Pago Payouts) must receive. We store
// the canonical form and present a masked display form to the UI.

export type PixKeyType =
  | 'PIX_CPF'
  | 'PIX_CNPJ'
  | 'PIX_EMAIL'
  | 'PIX_PHONE'
  | 'PIX_RANDOM';

/**
 * Normalise a PIX key to its canonical storage form:
 * - CPF/CNPJ: digits only
 * - email: lower-cased, trimmed
 * - phone: E.164 +55DDDNNNNNNNN — strictly Brazilian (Banco Central PIX
 *   doesn't accept foreign numbers)
 * - random: lower-cased UUID
 *
 * This function never throws. Invalid phone input is normalised to a form
 * that `isValidPixKey` will reject downstream, so the validation error is
 * raised at a single boundary.
 */
export function normalisePixKey(raw: string, type: PixKeyType): string {
  const trimmed = raw.trim();
  switch (type) {
    case 'PIX_CPF':
    case 'PIX_CNPJ':
      return trimmed.replace(/\D/g, '');
    case 'PIX_EMAIL':
      return trimmed.toLowerCase();
    case 'PIX_PHONE': {
      // Strict: if the user typed an explicit "+<cc>" it MUST be +55.
      // Anything else (e.g. +14155552671) is preserved so isValidPixKey
      // rejects it instead of us silently re-stamping it as a BR number.
      const digits = trimmed.replace(/\D/g, '');
      if (trimmed.startsWith('+') && !digits.startsWith('55')) {
        return `+${digits}`;
      }
      const national = digits.startsWith('55') && digits.length >= 12
        ? digits.slice(2)
        : digits;
      return `+55${national}`;
    }
    case 'PIX_RANDOM':
      return trimmed.toLowerCase();
  }
}

/**
 * Validate a PIX key against its declared type. The caller is responsible
 * for passing the already-normalised key (normalisePixKey).
 */
export function isValidPixKey(key: string, type: PixKeyType): boolean {
  switch (type) {
    case 'PIX_CPF':
      return isValidCPF(key);
    case 'PIX_CNPJ':
      return isValidCNPJ(key);
    case 'PIX_EMAIL':
      return isValidEmail(key);
    case 'PIX_PHONE':
      // Strict BR format:
      //   Mobile:   +55 DD 9 NNNNNNNN   (DDD + 9 + 8 subscriber digits)
      //   Landline: +55 DD [2-5]NNNNNNN (DDD + 2-5 prefix + 7 digits)
      // DDD must be 11-99 (not starting with 0). This rejects both foreign
      // numbers forced into the +55 slot (e.g. +5514155552671 — DDD 14, then
      // '1' which isn't a valid landline prefix or mobile 9) and malformed
      // BR numbers (9-digit line without the leading 9).
      return /^\+55(1[1-9]|[2-9]\d)(9\d{8}|[2-5]\d{7})$/.test(key);
    case 'PIX_RANDOM':
      // Banco Central uses UUID v4 for random keys
      return /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(key);
  }
}

/**
 * Produce a safe, masked representation of a PIX key for the UI.
 * Reveals only enough to let the user recognise their own key — never
 * enough for a bystander to identify the provider, area code, or full
 * local-part. At most 4 characters of the canonical key leak.
 */
export function maskPixKey(key: string, type: PixKeyType): string {
  switch (type) {
    case 'PIX_CPF': {
      // Canonical CPF is 11 digits — expose only the last two.
      if (key.length !== 11) return '•••';
      return `•••.•••.•••-${key.slice(-2)}`;
    }
    case 'PIX_CNPJ': {
      if (key.length !== 14) return '•••';
      return `••.•••.•••/••••-${key.slice(-2)}`;
    }
    case 'PIX_EMAIL': {
      // Hide BOTH the local-part tail and the email provider. A bystander
      // who sees `j•••@g•••.com` knows the user's local-part initial and
      // the domain-initial + TLD — which is less than Gmail fingerprinting
      // via the full visible domain.
      const [local, domain] = key.split('@');
      if (!domain) return '•••';
      const head = local.length > 0 ? local.charAt(0) : '•';
      const firstDot = domain.indexOf('.');
      const domainBase = firstDot >= 0 ? domain.slice(0, firstDot) : domain;
      const tld = firstDot >= 0 ? domain.slice(firstDot) : '';
      const domainHead = domainBase.length > 0 ? domainBase.charAt(0) : '•';
      return `${head}•••@${domainHead}•••${tld}`;
    }
    case 'PIX_PHONE': {
      // Hide the DDD (area code) — it leaks the user's state in Brazil.
      // Canonical form is +55DDD(9)NNNNNNNN; expose only the final 4.
      if (key.length < 8) return '•••';
      return `+55 •• ••••-${key.slice(-4)}`;
    }
    case 'PIX_RANDOM': {
      if (key.length < 8) return '•••';
      return `${key.slice(0, 4)}-••••-••••-${key.slice(-4)}`;
    }
  }
}

// ============================================================
// Shared form validators (web + mobile)
// ============================================================
//
// These return a `Record<field, errorMessage>` keyed by form field. An empty
// object means the form is valid. Wired into web forms (Login, Register, Sell)
// to give immediate feedback before the API roundtrip and into mobile forms
// for the same UX. The API still validates on every request — these are
// purely a UX layer.

export interface FieldErrors {
  [field: string]: string;
}

/** Returns errors map; empty when input is valid. */
export function validateLoginForm(input: { email: string; password: string }): FieldErrors {
  const errors: FieldErrors = {};
  const email = input.email?.trim() ?? '';
  if (!email) {
    errors.email = 'Informe seu e-mail.';
  } else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    errors.email = 'E-mail inválido.';
  }
  if (!input.password) {
    errors.password = 'Informe sua senha.';
  } else if (input.password.length < 8) {
    errors.password = 'A senha tem no mínimo 8 caracteres.';
  }
  return errors;
}

/**
 * Web/mobile registration form. Mirrors the API's RegisterDto. CPF is
 * required eventually (LGPD onboarding) but the API also accepts a deferred
 * CPF — when `cpf` is empty here we skip the modulo-11 check and the user
 * can fill it in later from /conta/seguranca.
 */
export function validateRegisterForm(input: {
  email: string;
  password: string;
  passwordConfirm?: string;
  displayName: string;
  cpf?: string;
  birthDate?: string;
}): FieldErrors {
  const errors: FieldErrors = validateLoginForm({
    email: input.email,
    password: input.password,
  });
  if (input.passwordConfirm !== undefined && input.password !== input.passwordConfirm) {
    errors.passwordConfirm = 'As senhas não conferem.';
  }
  const name = (input.displayName ?? '').trim();
  if (!name) {
    errors.displayName = 'Informe seu nome de exibição.';
  } else if (name.length < 2) {
    errors.displayName = 'Nome muito curto.';
  } else if (name.length > 60) {
    errors.displayName = 'Nome muito longo (máx 60 caracteres).';
  }
  if (input.cpf) {
    const cleaned = input.cpf.replace(/\D/g, '');
    if (cleaned.length !== 11 || !isValidCPF(cleaned)) {
      errors.cpf = 'CPF inválido.';
    }
  }
  if (input.birthDate) {
    const d = new Date(input.birthDate);
    if (Number.isNaN(d.getTime())) {
      errors.birthDate = 'Data de nascimento inválida.';
    } else {
      const ageMs = Date.now() - d.getTime();
      const years = ageMs / (365.25 * 24 * 3600 * 1000);
      if (years < 18) errors.birthDate = 'Você precisa ter pelo menos 18 anos.';
      if (years > 120) errors.birthDate = 'Data de nascimento inválida.';
    }
  }
  return errors;
}

/**
 * Listing-creation form. Title length, price range, photo count, weight,
 * and category presence — all the user-facing constraints the API also
 * enforces. Fast feedback in the form prevents a 400 round-trip when the
 * user picks an out-of-range price or forgets a photo.
 */
export function validateSellListingForm(input: {
  title?: string;
  description?: string;
  priceBrl?: number | string;
  categoryId?: string;
  shippingWeightG?: number | string;
  photoCount?: number;
}): FieldErrors {
  const errors: FieldErrors = {};
  const title = (input.title ?? '').trim();
  if (!title) {
    errors.title = 'Informe um título.';
  } else if (title.length < 4) {
    errors.title = 'Título muito curto (mín 4 caracteres).';
  } else if (title.length > 80) {
    errors.title = 'Título muito longo (máx 80 caracteres).';
  }
  if ((input.description ?? '').length > 4000) {
    errors.description = 'Descrição muito longa (máx 4000 caracteres).';
  }
  const price = typeof input.priceBrl === 'string' ? Number(input.priceBrl.replace(',', '.')) : input.priceBrl;
  if (price === undefined || !Number.isFinite(price)) {
    errors.priceBrl = 'Informe um preço.';
  } else if (price < 5) {
    errors.priceBrl = 'Preço mínimo é R$ 5,00.';
  } else if (price > 10000) {
    errors.priceBrl = 'Preço máximo é R$ 10.000,00.';
  }
  if (!input.categoryId) {
    errors.categoryId = 'Escolha uma categoria.';
  }
  const weight = typeof input.shippingWeightG === 'string' ? Number(input.shippingWeightG) : input.shippingWeightG;
  if (weight === undefined || !Number.isFinite(weight)) {
    errors.shippingWeightG = 'Informe o peso para envio.';
  } else if (weight < 50) {
    errors.shippingWeightG = 'Peso mínimo: 50g.';
  } else if (weight > 30000) {
    errors.shippingWeightG = 'Peso máximo: 30kg.';
  }
  if ((input.photoCount ?? 0) < 1) {
    errors.photos = 'Adicione pelo menos uma foto.';
  } else if ((input.photoCount ?? 0) > 20) {
    errors.photos = 'Máximo de 20 fotos por anúncio.';
  }
  return errors;
}


