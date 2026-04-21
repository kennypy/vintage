import { apiFetch } from './api';

export interface ReferralEntry {
  id: string;
  refereeName: string;
  refereeAvatarUrl: string | null;
  rewardedAt: string | null;
  invitedAt: string;
}

export interface MyReferrals {
  code: string;
  rewardAmountBrl: number;
  totalRewardsBrl: number;
  totalInvited: number;
  totalRewarded: number;
  referrals: ReferralEntry[];
}

export async function getMyReferrals(): Promise<MyReferrals> {
  return apiFetch<MyReferrals>('/referrals/me');
}

export async function validateReferralCode(
  code: string,
): Promise<{ valid: boolean; referrerName: string }> {
  return apiFetch<{ valid: boolean; referrerName: string }>(
    `/referrals/validate/${encodeURIComponent(code)}`,
    { authenticated: false },
  );
}
