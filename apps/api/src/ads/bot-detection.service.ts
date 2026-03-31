import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

// Known bot/headless browser user-agent patterns
const BOT_UA_PATTERNS = [
  /bot/i,
  /crawler/i,
  /spider/i,
  /headlesschrome/i,
  /phantomjs/i,
  /selenium/i,
  /puppeteer/i,
  /playwright/i,
  /curl/i,
  /wget/i,
  /python-requests/i,
  /axios/i,
  /scrapy/i,
  /go-http-client/i,
  /java\//i,
  /libwww/i,
  /okhttp/i,
];

// Datacenter/VPN ASN prefixes (simplified — production would use MaxMind or similar)
const DATACENTER_IP_PREFIXES = [
  '10.',
  '172.16.',
  '172.17.',
  '172.18.',
  '172.19.',
  '172.20.',
  '172.21.',
  '172.22.',
  '172.23.',
  '172.24.',
  '172.25.',
  '172.26.',
  '172.27.',
  '172.28.',
  '172.29.',
  '172.30.',
  '172.31.',
];

// Maximum legitimate clicks per IP per minute
const MAX_CLICKS_PER_IP_PER_MINUTE = 5;
// Minimum realistic ms between impression and click
const MIN_MS_TO_CLICK = 300;

export interface BotScoreResult {
  score: number; // 0.0 – 1.0
  isBot: boolean;
  signals: Record<string, unknown>;
}

@Injectable()
export class BotDetectionService {
  constructor(private readonly prisma: PrismaService) {}

  async score(params: {
    ip: string;
    ipHash: string;
    userAgent: string;
    msToClick?: number;
    impressionId?: string;
    campaignId: string;
    userId?: string;
  }): Promise<BotScoreResult> {
    const signals: Record<string, unknown> = {};
    let score = 0;

    // ── 1. User-agent analysis ─────────────────────────────────────────────
    const uaIsBot = BOT_UA_PATTERNS.some((p) => p.test(params.userAgent));
    signals.uaIsBot = uaIsBot;
    if (uaIsBot) score += 0.6;

    // Empty or very short user-agent
    if (params.userAgent.length < 20) {
      signals.emptyUa = true;
      score += 0.3;
    }

    // ── 2. Click velocity — too many clicks from same IP in 60s ───────────
    const recentClicks = await this.prisma.adClick.count({
      where: {
        ipHash: params.ipHash,
        createdAt: { gte: new Date(Date.now() - 60_000) },
      },
    });
    signals.recentClickCount = recentClicks;
    if (recentClicks >= MAX_CLICKS_PER_IP_PER_MINUTE) {
      score += 0.4;
      signals.highVelocity = true;
    }

    // ── 3. Time-to-click anomaly ───────────────────────────────────────────
    if (params.msToClick !== undefined) {
      signals.msToClick = params.msToClick;
      if (params.msToClick < MIN_MS_TO_CLICK) {
        score += 0.4;
        signals.tooFast = true;
      }
    }

    // ── 4. Impression existence check — clicked without being shown ────────
    if (params.impressionId) {
      const impression = await this.prisma.adImpression.count({
        where: { id: params.impressionId, campaignId: params.campaignId },
      });
      if (impression === 0) {
        score += 0.5;
        signals.noMatchingImpression = true;
      }
    } else {
      // No impressionId provided at all — suspicious
      score += 0.2;
      signals.missingImpressionId = true;
    }

    // ── 5. Private/datacenter IP ───────────────────────────────────────────
    const isDatacenterIp = DATACENTER_IP_PREFIXES.some((prefix) =>
      params.ip.startsWith(prefix),
    );
    signals.isDatacenterIp = isDatacenterIp;
    if (isDatacenterIp) score += 0.2;

    // Cap at 1.0
    const finalScore = Math.min(score, 1.0);
    return {
      score: Math.round(finalScore * 100) / 100,
      isBot: finalScore >= 0.7,
      signals,
    };
  }
}
