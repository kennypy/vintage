# Vintage.br — Full Platform Plan (Vinted Clone for Brazil)

## Context

**Problem:** There is no dominant Vinted-style peer-to-peer fashion marketplace in Brazil. Existing competitors (Enjoei charges 20% commission, OLX has no buyer protection, Mercado Livre mixes new/used) leave a gap for a seller-friendly, protection-first secondhand marketplace.

**Solution:** Build "Vintage.br" — a Vinted clone localized for Brazil with zero seller fees, mandatory buyer protection, integrated shipping via Brazilian carriers, and PIX/Boleto/installment payments.

**Repo:** `/home/user/vintage` (empty — fresh start)

---

## Part A: What Vinted Currently Does (Reference)

### A1. Core Marketplace
- [x] Categories: Women's Fashion, Men's Fashion, Kids, Home, Electronics
- [x] Item conditions: New with tags, New without tags, Very good, Good, Satisfactory
- [x] Search with filters (category, size, color, brand, condition, price range)
- [x] Sort by newest, price, relevance
- [x] Saved searches with notifications
- [x] Personalized feed and recommendations
- [x] Up to 20 photos per listing (4:5 portrait aspect ratio)

### A2. Buyer Features
- [x] "Buy now" instant purchase
- [x] "Make an offer" (minimum 50% of asking price)
- [x] Favorites/wishlist (heart icon)
- [x] Bundles (multiple items from same seller, combined shipping)
- [x] Buyer Protection (mandatory fee: fixed amount + % of price)
- [x] 2-day window to report issues after delivery
- [x] Follow sellers for new listing notifications
- [x] Size guides

### A3. Seller Features
- [x] Free listing — zero commission (key differentiator)
- [x] Up to 20 photos per listing
- [x] Seller wallet/balance system
- [x] Payouts to bank account (48-72h after delivery confirmation)
- [x] Binary ratings (1-star or 5-star)
- [x] Profile verification (blue checkmark)
- [x] Vacation mode (pause up to 90 days)
- [x] Item Bump (paid visibility boost, 3-7 days)
- [x] Closet Spotlight (promote entire closet, 7 days)
- [x] Closet-wide discounts

### A4. Shipping & Logistics
- [x] Prepaid shipping labels auto-generated after purchase
- [x] Multiple carrier integrations (Royal Mail, Evri, UPS, USPS, etc.)
- [x] Package tracking with carrier integration
- [x] Drop-off points and home collection
- [x] Digital labels (barcode/QR scanned at drop-off)
- [x] Custom shipping option (seller arranges own postage)

### A5. Payments & Escrow
- [x] Escrow system: funds held until buyer confirms receipt
- [x] Buyer Protection fee (primary revenue: >50% of total)
  - Structure: fixed fee + percentage (e.g., €0.70 + 5%)
- [x] Seller wallet/balance
- [x] Multiple payment methods (cards, digital wallets)
- [x] Refunds for cancelled orders, lost packages, or disputes won

### A6. Trust & Safety
- [x] User verification (blue checkmark badge)
- [x] Item authentication for luxury/designer goods
- [x] Fraud detection (predictive analytics on listings/transactions)
- [x] Zero-tolerance counterfeit policy
- [x] Dispute resolution system
- [x] 2-day post-delivery complaint window
- [x] Account bans for policy violations

### A7. Social & Community
- [x] Follow sellers
- [x] In-app messaging (buyer ↔ seller)
- [x] Community forums
- [x] Personalized feed
- [x] Push notifications (configurable per type)
- [x] Referral program

### A8. Revenue Model
- [x] Buyer Protection fees (primary — >50% of revenue)
- [x] Promoted listings (Item Bump, Closet Spotlight)
- [x] Shipping margins (bulk carrier deals)
- [x] Advertising/sponsored listings (secondary)

---

## Part A-bis: Enjoei Competitor Analysis & Features to Adopt

### What Enjoei Does (Brazil's #1 secondhand fashion marketplace)
- **Founded** 2009 in São Paulo, publicly traded (ENJU3.SA), R$1B+ annual GMV
- **12.6M monthly visits**, 1M+ buyers, 1M+ sellers
- **Commission model**: 12% (Classic) or 18% (Turbinado/enhanced) + fixed tariff — versus our zero-fee model
- **Enjoei Pro**: Concierge service — home pickup, professional photography, curation, up to 50% commission
- **Carriers**: Correios, Rede Sul (south Brazil), Venuxx (urban pickup/delivery)
- **Payments**: Credit cards (installments), PIX, Boleto, via Wirecard
- **Inactivity fees**: R$14.99/mo (2-5 months inactive), R$29.99/mo (6+ months) — aggressive monetization

### Enjoei Features We Should Adopt for Vintage.br

**Smart Pricing ("Preço Esperto")** — *Phase 2*
- [ ] AI-powered price suggestions based on similar sold items, demand, and condition
- [ ] Optional auto-price-drop over time to encourage faster sales
- [ ] Price trend data visible to sellers ("items like this sell for R$X-Y")

**Megafone (Megaphone) Visibility Tool** — *Phase 2*
- [ ] Free 7-day visibility boost for newly listed items
- [ ] After 7 days, requires a small discount to re-boost (encourages price drops)
- [ ] Replaces/complements Item Bump — lower friction, drives engagement

**Listing Modes (Classic vs. Enhanced)** — *Phase 3*
- [ ] Option for sellers to choose enhanced visibility mode with slightly higher buyer fee
- [ ] Enhanced mode includes: subsidized shipping discounts, priority search placement, seller discount coupons

**Seller Storefront ("Lojinha")** — *Phase 2*
- [ ] Public profile URL: vintage.br/@username
- [ ] Custom cover photo and bio
- [ ] All listings displayed as a browsable storefront
- [ ] Shareable link for social media promotion

**Price Drop Notifications** — *Phase 2*
- [ ] Notify buyers when a favorited item drops in price
- [ ] Drives conversion from window shoppers to buyers

**Broader Categories (from Enjoei)** — *Phase 1 expansion*
- [ ] Furniture, antiques, decoration, appliances
- [ ] Books, games, videogames, music, movies
- [ ] Phones, tablets, computers, photography equipment
- [ ] Luggage, pets, stationery
- [ ] Vintage & retro items (special category — fits our brand name!)

**WhatsApp Sharing Integration** — *Phase 2*
- [ ] Deep-link sharing to WhatsApp (dominant messaging app in Brazil)
- [ ] Pre-formatted message with item photo, price, and link
- [ ] WhatsApp is critical for Brazilian user acquisition

### Enjoei Features We Should NOT Copy
- ❌ **12-20% seller commission** — our zero-fee model is the key differentiator
- ❌ **Inactivity fees** — penalizing dormant users is anti-user
- ❌ **Enjoei Pro (50% commission concierge)** — too complex for MVP, consider later as "Vintage Pro"
- ❌ **Physical stores** — focus on digital-first

### Vintage.br Competitive Advantages Over Enjoei
| Feature | Enjoei | Vintage.br |
|---------|--------|------------|
| Seller commission | 12-18% + fixed fee | **0% (free to sell)** |
| Revenue model | Seller fees | Buyer Protection fee (like Vinted) |
| Inactivity fees | R$14.99-29.99/mo | **None** |
| Vacation mode | Not available | **Up to 90 days** |
| Buyer Protection | Basic (funds held) | **Full coverage: lost, damaged, fake, not-as-described** |
| Dispute window | Unclear | **2-day post-delivery window** |
| Make an offer | Available | **Available (min 50% of price)** |
| Bundles | Not prominent | **Built-in with combined shipping** |
| Smart Pricing | Yes (Preço Esperto) | **Yes (adopted)** |
| Free listing boost | 7-day megafone | **7-day megafone (adopted)** |

---

## Part B: Brazil-Specific Requirements

### B1. Legal & Regulatory
- [ ] Register CNPJ (business entity)
- [ ] Comply with CDC (Código de Defesa do Consumidor)
- [ ] Comply with Decreto 7.962/2013 (e-commerce specific rules)
- [ ] Display on site: CNPJ, business name, address, contact, prices incl. shipping, 7-day withdrawal right
- [ ] LGPD compliance (Brazil's GDPR — data protection, consent, deletion rights)
- [ ] Terms of service & privacy policy in Portuguese (BR)

### B2. Payments (Brazil)
- [ ] **PIX** — real-time bank transfers (dominant method, 153M+ users)
- [ ] **Credit cards with installments** (parcelamento up to 12x) — essential for Brazil
- [ ] **Boleto bancário** — bank slip for unbanked users
- [ ] **Digital wallets** — Mercado Pago, PicPay
- [ ] Payment gateway: **Mercado Pago** or **PagSeguro** (or Stripe Brazil)
- [ ] Buyer Protection fee adapted for BRL (e.g., R$3.50 + 5%)

### B3. Shipping (Brazil)
- [ ] **Correios** integration (national postal service — widest coverage)
- [ ] **Jadlog** integration (private carrier — faster for urban areas)
- [ ] Prepaid shipping label generation via carrier APIs
- [ ] CEP-based shipping rate calculation
- [ ] Package tracking integration
- [ ] Drop-off point locator (Correios agencies, Jadlog pickup points)
- [ ] Handle ICMS on interstate shipments (tax on goods circulation)

### B4. Tax & Invoicing
- [ ] **Nota Fiscal Eletrônica (NF-e)** generation — mandatory for all transactions
  - XML format, digitally signed (ICP-Brasil certificate), SEFAZ authorization
- [ ] ICMS calculation (17-19% intra-state, 7-12% interstate)
- [ ] ISS for service fees (2-5% municipal tax)
- [ ] Prepare for 2026 tax reform (CBS + IBS replacing current taxes)

### B5. Identity & Verification
- [ ] **CPF validation** (11-digit taxpayer ID, Modulo 11 algorithm)
- [ ] KYC/AML compliance for wallet/payouts
- [ ] Optional: selfie + document verification for enhanced trust

### B6. Localization
- [ ] Portuguese (BR) — all UI, emails, notifications, legal text
- [ ] BRL currency (R$) with Brazilian number formatting (1.234,56)
- [ ] CEP postal code format (NNNNN-NNN) with address autocomplete
- [ ] Brazilian clothing sizes (P, M, G, GG, XG or numeric)
- [ ] Popular Brazilian fashion brands in catalog

---

## Part C: Tech Stack

| Layer | Technology | Rationale |
|-------|-----------|-----------|
| **Frontend Web** | Next.js 14+ (App Router, TypeScript) | SSR for SEO, React ecosystem, mobile-first |
| **Mobile Apps** | React Native (Expo) | Code sharing with web, large community |
| **Backend API** | Node.js + NestJS (TypeScript) | Type-safe, modular, scalable |
| **Database** | PostgreSQL + Prisma ORM | Relational for marketplace data, great migrations |
| **Cache** | Redis | Sessions, rate limiting, real-time features |
| **Search** | Elasticsearch (or Meilisearch for simpler start) | Full-text search, filters, facets |
| **Real-time** | Socket.io (or WebSockets) | Messaging, notifications |
| **Image Storage** | AWS S3 (or Cloudflare R2) | Scalable image hosting |
| **Image Processing** | Sharp (Node.js) | Resize, optimize listing photos |
| **Auth** | NextAuth.js + JWT | Social login, email/password, CPF-based |
| **Payments** | Mercado Pago SDK (or PagSeguro) | PIX, cards, boleto, installments |
| **Shipping** | Correios API + Jadlog API | Label generation, tracking, rates |
| **Email** | SendGrid or Amazon SES | Transactional emails |
| **Push Notifications** | Firebase Cloud Messaging | Mobile push |
| **Monitoring** | Sentry + Datadog (or Grafana) | Error tracking, APM |
| **CI/CD** | GitHub Actions | Automated testing, deployment |
| **Hosting** | AWS (São Paulo region sa-east-1) or Vercel + Railway | Low latency for Brazil |

---

## Part D: Database Schema (Key Models)

```
User { id, email, cpf, name, phone, avatar_url, bio, verified, vacation_mode, vacation_until, rating_avg, rating_count, created_at }

Listing { id, seller_id→User, title, description, category_id, brand_id, condition, size, color, price_brl, shipping_weight_g, status(active/sold/paused/deleted), promoted_until, created_at }

ListingImage { id, listing_id→Listing, url, position, width, height }

Category { id, parent_id→Category, name_pt, slug, icon }

Brand { id, name, slug, verified }

Order { id, buyer_id→User, seller_id→User, listing_id→Listing, status(pending/paid/shipped/delivered/completed/disputed/refunded), total_brl, item_price_brl, shipping_cost_brl, buyer_protection_fee_brl, payment_method, payment_id, shipping_label_url, tracking_code, carrier, shipped_at, delivered_at, confirmed_at, dispute_deadline, created_at }

Offer { id, listing_id→Listing, buyer_id→User, amount_brl, status(pending/accepted/rejected/expired), expires_at }

Bundle { id, buyer_id→User, seller_id→User, status }
BundleItem { id, bundle_id→Bundle, listing_id→Listing }

Wallet { id, user_id→User, balance_brl, pending_brl }
WalletTransaction { id, wallet_id→Wallet, type(credit/debit/payout), amount_brl, reference_id, description, created_at }

Favorite { id, user_id→User, listing_id→Listing }
Follow { id, follower_id→User, following_id→User }

Message { id, conversation_id, sender_id→User, body, read_at, created_at }
Conversation { id, participant1_id→User, participant2_id→User, order_id→Order(nullable), last_message_at }

Review { id, order_id→Order, reviewer_id→User, reviewed_id→User, rating(1|5), comment, created_at }

Dispute { id, order_id→Order, opened_by→User, reason, description, status(open/resolved/escalated), resolution, created_at }

Notification { id, user_id→User, type, title, body, data_json, read_at, created_at }

Address { id, user_id→User, label, street, number, complement, neighborhood, city, state, cep, is_default }

Promotion { id, listing_id→Listing(nullable), user_id→User, type(bump|spotlight|megafone), starts_at, ends_at, price_paid_brl, requires_discount }

SavedSearch { id, user_id→User, query, filters_json, notify }

PriceSuggestion { id, listing_id→Listing, suggested_price_brl, based_on_count, confidence, created_at }

PriceDropAlert { id, listing_id→Listing, user_id→User, original_price_brl, notified_at }
```

---

## Part E: Implementation Phases

### Phase 1 — MVP (Weeks 1-8)

**1.1 Project Setup (Week 1)**
- [ ] Initialize monorepo (Turborepo: `apps/web`, `apps/api`, `packages/shared`)
- [ ] Set up Next.js frontend with Tailwind CSS
- [ ] Set up NestJS backend with Prisma + PostgreSQL
- [ ] Set up Docker Compose for local dev (Postgres, Redis, Meilisearch)
- [ ] Configure ESLint, Prettier, TypeScript strict mode
- [ ] Set up CI/CD pipeline (GitHub Actions: lint, test, build)
- [ ] Configure environment variables and secrets management

**1.2 Auth & User Profiles (Week 2)**
- [ ] Email/password registration with CPF validation
- [ ] Social login (Google, Apple)
- [ ] Email verification flow
- [ ] User profile page (avatar, bio, location, ratings)
- [ ] Address management (CEP autocomplete via ViaCEP API)
- [ ] JWT-based auth with refresh tokens

**1.3 Listings (Weeks 2-3)**
- [ ] Create listing flow (photos → details → price → publish)
- [ ] Image upload to S3 with resize/optimization
- [ ] Category tree with subcategories (fashion + home + electronics + books/games + vintage/retro)
- [ ] Brand autocomplete
- [ ] Condition selector
- [ ] Size selector (Brazilian sizes: P/M/G/GG/XG + numeric)
- [ ] Listing detail page
- [ ] Edit and delete listings
- [ ] Listing status management (active/paused/sold)

**1.4 Search & Discovery (Week 3)**
- [ ] Full-text search with Meilisearch
- [ ] Filters: category, size, color, brand, condition, price range
- [ ] Sort by: newest, price low→high, price high→low, relevance
- [ ] Infinite scroll / pagination
- [ ] Homepage feed (personalized later)

**1.5 Buying Flow (Weeks 4-5)**
- [ ] "Comprar agora" (Buy now) button
- [ ] Checkout page with address selection
- [ ] Shipping rate calculation (Correios API by CEP + weight)
- [ ] Buyer Protection fee calculation and display
- [ ] Payment integration (Mercado Pago: PIX, credit card, boleto)
- [ ] Credit card installments (parcelamento up to 12x)
- [ ] Order creation and confirmation
- [ ] Escrow: hold funds until buyer confirms

**1.6 Shipping (Weeks 5-6)**
- [ ] Correios API integration (rate calculation + label generation)
- [ ] Shipping label PDF generation for seller
- [ ] Tracking number assignment and status polling
- [ ] Seller notification to ship within 5 business days
- [ ] Buyer tracking page

**1.7 Order Lifecycle (Week 6)**
- [ ] Order statuses: Paid → Shipped → Delivered → Completed
- [ ] Buyer confirmation ("Tudo certo" / Everything OK)
- [ ] Auto-confirm after 2 days if no dispute
- [ ] Release funds to seller wallet upon confirmation
- [ ] Basic dispute flow (buyer reports issue within 2 days)

**1.8 Messaging (Week 7)**
- [ ] Conversation list page
- [ ] Real-time chat (Socket.io)
- [ ] Send text messages between buyer/seller
- [ ] Pre-purchase questions on listings
- [ ] Order-linked conversations

**1.9 Seller Wallet & Payouts (Week 7)**
- [ ] Wallet balance page
- [ ] Transaction history
- [ ] Payout request to bank account (via Mercado Pago)
- [ ] Minimum payout threshold

**1.10 Reviews & Ratings (Week 8)**
- [ ] Post-order review prompt
- [ ] Binary rating (1-star or 5-star)
- [ ] Optional text comment
- [ ] Display on seller profile
- [ ] Average rating calculation

**1.11 MVP Polish (Week 8)**
- [ ] Responsive mobile-first design
- [ ] Loading states, error handling, empty states
- [ ] SEO meta tags for listings
- [ ] Basic email notifications (order updates, messages)
- [ ] 404/error pages
- [ ] Legal pages: Terms, Privacy Policy, Buyer Protection policy

---

### Phase 2 — Growth Features (Weeks 9-16)

**2.1 Offers & Negotiation**
- [ ] "Fazer oferta" (Make an offer) button on listings
- [ ] Minimum 50% of asking price
- [ ] Seller accept/reject/counter flow
- [ ] Offer expiration (24-48h)
- [ ] Direct checkout from accepted offer

**2.2 Bundles**
- [ ] Add multiple items from same seller to bundle
- [ ] Combined shipping calculation
- [ ] Bundle discount setting for sellers
- [ ] Bundle checkout flow

**2.3 Favorites & Saved Searches**
- [ ] Heart icon to favorite listings
- [ ] Favorites list page
- [ ] Saved search with filter criteria
- [ ] Notification when saved search has new matches

**2.4 Vacation Mode**
- [ ] Toggle vacation mode (up to 90 days)
- [ ] Hide all listings while on vacation
- [ ] Prevent purchases during vacation
- [ ] Return date display on profile

**2.5 Social Features**
- [ ] Follow/unfollow sellers
- [ ] Following feed (new listings from followed sellers)
- [ ] Follower/following counts on profile
- [ ] Share listing to WhatsApp/Instagram/social media

**2.6 Push Notifications (Mobile)**
- [ ] Firebase Cloud Messaging integration
- [ ] Configurable notification preferences per type
- [ ] Types: messages, offers, order updates, followed seller new items, price drops on favorites

**2.7 Advanced Shipping**
- [ ] Jadlog carrier integration
- [ ] Multiple carrier rate comparison at checkout
- [ ] Drop-off point locator with map
- [ ] QR code / barcode digital labels

**2.8 Promoted Listings & Megafone**
- [ ] **Megafone**: Free 7-day visibility boost for new listings (Enjoei-inspired)
- [ ] After 7 days, require small discount to re-activate megafone
- [ ] Item Bump: pay R$4.90 for 3-day paid visibility boost
- [ ] Closet Spotlight: pay R$29.90 for 7-day closet promotion
- [ ] Payment for promotions via wallet balance or direct payment
- [ ] Analytics: views and clicks during promotion

**2.9 Smart Pricing (Enjoei-inspired)**
- [ ] AI price suggestions based on similar sold items
- [ ] Price trend data shown to sellers ("items like this sell for R$X-Y")
- [ ] Optional auto-price-drop schedule (e.g., -5% per week)
- [ ] Price drop notifications to users who favorited the item

**2.10 Seller Storefront**
- [ ] Public profile URL: vintage.br/@username
- [ ] Custom cover photo
- [ ] Browsable storefront with all active listings
- [ ] Share to WhatsApp/Instagram with deep links

**2.11 Enhanced Trust & Safety**
- [ ] Seller verification flow (CPF + selfie + document)
- [ ] Blue checkmark badge for verified sellers
- [ ] Automated fraud detection (duplicate listings, suspicious pricing)
- [ ] Report listing/user functionality
- [ ] Admin moderation dashboard

**2.12 Nota Fiscal**
- [ ] NF-e generation integration (via API like Enotas or NFe.io)
- [ ] Automatic invoice generation per transaction
- [ ] Tax calculation (ICMS, ISS)
- [ ] Invoice available for download by buyer and seller

---

### Phase 3 — Scale (Weeks 17-24+)

**3.1 React Native Mobile App**
- [ ] iOS and Android apps via Expo
- [ ] Camera integration for listing photos
- [ ] Barcode scanning at drop-off points
- [ ] Push notifications
- [ ] All core features from web

**3.2 Personalization & AI**
- [ ] Personalized homepage feed based on browsing/purchase history
- [ ] "Similar items" recommendations on listing pages
- [ ] Smart pricing suggestions for sellers
- [ ] AI-powered search (natural language queries)

**3.3 Community & Forums**
- [ ] Community forum/discussion boards
- [ ] Fashion tips and style guides
- [ ] User-generated content feed

**3.4 Luxury Authentication**
- [ ] Item Verification service for high-value items (>R$500)
- [ ] Partner with authentication service
- [ ] Verified authenticity badge on listings

**3.5 Advanced Analytics**
- [ ] Seller dashboard (views, favorites, conversion rate)
- [ ] Admin analytics (GMV, active users, listings, revenue)
- [ ] A/B testing infrastructure

**3.6 Referral Program**
- [ ] Invite friends via link/code
- [ ] Reward: R$10 credit for both referrer and referee on first purchase
- [ ] Tracking and anti-abuse measures

**3.7 Closet-Wide Discounts**
- [ ] Sellers set % discount on entire closet
- [ ] Time-limited sales events
- [ ] Notification to followers

**3.8 Multi-Carrier Expansion**
- [ ] Additional carriers (Loggi, Total Express, Azul Cargo)
- [ ] Home pickup scheduling
- [ ] Express delivery options

**3.9 International Expansion Prep**
- [ ] i18n framework (already in Portuguese, add Spanish for LatAm)
- [ ] Multi-currency support
- [ ] Cross-border shipping considerations

---

## Part F: Vintage.br Feature Checklist

### Launch Readiness Checklist

**Legal & Compliance**
- [ ] CNPJ registered
- [ ] CDC compliance verified by legal counsel
- [ ] Terms of Service (Portuguese BR)
- [ ] Privacy Policy (LGPD compliant)
- [ ] Buyer Protection policy published
- [ ] 7-day withdrawal right implemented
- [ ] Cookie consent banner
- [ ] CNPJ, address, contact visible on all pages

**Infrastructure**
- [ ] AWS sa-east-1 (São Paulo) hosting configured
- [ ] SSL certificates
- [ ] CDN for static assets and images
- [ ] Database backups automated
- [ ] Monitoring and alerting (Sentry, uptime)
- [ ] Rate limiting and DDoS protection
- [ ] LGPD data export/deletion capability

**Payments**
- [ ] Mercado Pago (or PagSeguro) account and API keys
- [ ] PIX payment flow tested end-to-end
- [ ] Credit card with installments tested
- [ ] Boleto bancário flow tested
- [ ] Escrow hold/release logic verified
- [ ] Refund flow tested
- [ ] Buyer Protection fee calculation correct

**Shipping**
- [ ] Correios API contract and credentials
- [ ] Shipping label generation tested
- [ ] Tracking integration working
- [ ] Rate calculation accurate for all states
- [ ] Seller shipping notification flow

**Core Flows**
- [ ] User registration + CPF validation
- [ ] Listing creation with photo upload
- [ ] Search and filter working
- [ ] Buy now → checkout → payment → order created
- [ ] Seller receives notification and ships
- [ ] Buyer confirms receipt → funds released to seller
- [ ] Dispute/refund flow working
- [ ] Messaging working in real-time
- [ ] Wallet balance and payout working
- [ ] Reviews/ratings working

---

## Verification Plan

1. **Unit tests**: Jest for backend services, React Testing Library for frontend components
2. **Integration tests**: Supertest for API endpoints, test database with seed data
3. **E2E tests**: Playwright for critical user flows (register → list → buy → ship → confirm)
4. **Payment testing**: Mercado Pago sandbox environment for all payment methods
5. **Shipping testing**: Correios homologation environment for label generation
6. **Load testing**: k6 for API performance under load
7. **Manual QA**: Full user journey on mobile and desktop browsers
8. **Security audit**: OWASP top 10 checklist, penetration testing before launch
