import { apiFetch } from './api';

export interface CouponValidationResult {
  valid: boolean;
  couponId: string;
  code: string;
  discountPct: number;
  discountBrl: number;
}

export async function validateCoupon(
  code: string,
  orderTotal: number,
): Promise<CouponValidationResult> {
  return apiFetch<CouponValidationResult>('/coupons/validate', {
    method: 'POST',
    body: JSON.stringify({ code, orderTotal }),
  });
}
