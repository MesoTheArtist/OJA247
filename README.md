# 🚀 OJA247 — Nigerian Multi-Vendor Marketplace

[![License](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)
[![GitHub stars](https://img.shields.io/github/stars/MesoTheArtist/OJA247?style=social)](https://github.com/MesoTheArtist/OJA247/stargazers)

**OJA247** is a full-featured MERN-stack marketplace platform that lets Nigerian small businesses run their own online store, take payments, manage orders, and grow their customer base — vendors bring their own existing customers rather than competing for strangers' attention the way a Jumia-style marketplace works.

> **"Support Local. Shop Small. Grow Together."**

---

## 📷 Screenshots

<table>
  <tr>
    <td><img src="oja247/src/assets/website-demo-image/OJA247demo.png" alt="Desktop View"/></td>
    <td><img src="oja247/src/assets/website-demo-image/mobile-view.png" alt="Mobile View"/></td>
  </tr>
</table>

---

## ✨ Features

### 🛍️ For Customers
- Browse and search businesses and products, filter by category/location
- **Guest checkout** — no account required to buy
- Optional **customer account**: password signup (email verification required) or **Google sign-in** (instant, no verification step) — customers are the only role that can sign up with Google
- Guest orders retroactively link to an account once the email is verified
- **Order history**, with a guest-lookup flow (order reference + email) for anyone without an account
- **Follow** vendors — get emailed automatically when a followed vendor adds a new product
- **Reviews** — leave a star rating + comment on any vendor you've actually bought from (verified-purchase gated, one review per vendor per order, no time limit); vendors can post one public reply
- **Disputes** — file a dispute on a paid order (5-day window), as a signed-in customer or as a guest; vendor gets 7 days to self-resolve before it escalates to admin
- **Pay by bank transfer straight to the vendor**: checkout shows the vendor's account details, the customer pays and uploads a receipt, and the vendor confirms the payment. A payment-status page tracks the order, and the customer can re-upload a receipt or cancel while it is waiting
- **Delivery confirmation** — the customer confirms receipt from their order or from an emailed link; unconfirmed orders are reminded, then marked received automatically after a set number of days

### 🏪 For Business Owners
- Combined onboarding form: business details + payout bank info + KYC documents in one step
- Tiered verification: **Basic** (NIN + bank-name match) → **Verified** (+CAC registration + address proof) — a recurring reminder nags incomplete verification, nothing is auto-hidden
- Product management (create/edit/delete, multi-image upload via Cloudinary)
- Vendor dashboard: **Waiting Orders** tab (confirm or reject transfer payments, mark orders sent out), earnings summary, points balance (withdrawable or usable toward subscription), **Reviews** tab (reply to customer reviews), **Disputes** tab (resolve disputes raised against you, with a refunded checkbox)
- Stock is taken off only when the vendor confirms the payment, so unpaid orders never lock inventory
- **Subscription-based visibility** — a platform-wide admin "kill switch" can require an active subscription for a store to appear in search/Explore (off by default); vendors get reminded before expiry, on expiry, and periodically if they've never subscribed at all
- Subscriptions are paid by **card through Paystack** (monthly, six-month or yearly), with optional **automatic renewal**. Points can cover part or all of a plan
- New order alerts via **email and WhatsApp** (Twilio)
- Google **login** for vendors who already have an account (it never creates one)
- A **Verified** badge shows next to approved Verified vendors on their store page and on vendor cards

### 🤝 For Marketers (Referral Partners)
- Separate marketer accounts with their own login and dashboard. Marketers sign up with a password; Google can be used to log in to an existing account, not to create one
- Custom short referral code, used to attribute vendor signups/subscriptions
- Commission is earned when a referred vendor pays real cash for a plan (at least ₦1,000), once per referral
- Payout requests and admin-run weekly payout batching. Changing the payout bank account needs the password again

### 🛠️ For Admins
- Full dashboard: Overview/Analytics, Businesses, Products, Orders, Users, **Customers** (separate from generic Users — order/spend/review/dispute stats, full detail drill-in, ban/delete/edit/manually-verify-email), Vendor Verification, Marketers, Payout Batches, Transactions, **Kill Switch** (subscription-visibility enforcement), Grandfather Exemptions, Tax Ledger
- Every data table is mobile-responsive (collapses to cards below 640px)
- Dispute oversight: view escalated disputes, resolve them, see which vendors are flagged for a high dispute rate (ban-candidate signal, never automatic)
- Points withdrawal review (mark paid, or reject and refund the points) and **email announcements** to users, sent in capped batches
- Transfer-order follow-up: the admin is flagged when a vendor leaves a bank-transfer order unanswered for too long

### 🔐 Security & Authentication
- Separate JWT-based auth for **customers**, **vendors**, **marketers**, and **admin** — kept in distinct controllers/routes, not shared. Sessions use cookies
- Password hashing with bcrypt, **8–72 characters**. Accounts that still have an older, shorter password are asked to reset it at login. Google-only accounts have no password at all
- Two-factor (an authenticator-app code) is mandatory for admin accounts
- Customer email verification required before guest orders link to an account (prevents someone registering your email to read your order history)
- **Money safety** — every movement of points or payouts is atomic: a points balance change and its ledger entry are written in one database transaction; points are taken when a subscription payment starts and returned if it fails or is abandoned; referral rewards and payout batches are claimed one at a time so a double click or retry can't pay twice
- Payout details are checked against the bank: the account holder's name comes from Paystack, never from the browser, and changing a payout account asks for the password again
- Paystack webhook signatures verified with HMAC-SHA512 + `crypto.timingSafeEqual`; the card amount is checked against the plan price before anything is activated
- Scheduled jobs authenticated via a shared `CRON_SECRET`, compared in constant time, fail-closed if unset
- Rate limits on login, payments, withdrawals, uploads and order lookups; requests carrying MongoDB operator keys (`$ne`, `$gt`, ...) are rejected outright
- Customer-supplied text is HTML-escaped in every email; uploaded logos/banners are checked as real images and hosted on Cloudinary; receipts are stored privately
- Server errors return a generic message to the browser and the details go to the server log only

---

## 🛠️ Tech Stack

### Frontend
- **React 18**, **React Router**, **Axios**, **Tailwind CSS**, **Framer Motion**

### Backend
- **Node.js** / **Express.js**, **MongoDB** / **Mongoose**, **JWT**, **bcryptjs**
- **Cloudinary** — image storage
- **Paystack** — subscription card payments (and the webhook for older card orders); bank-account name lookup for vendor and marketer payouts
- **Dojah** — NIN verification during vendor onboarding (skipped if the keys are not set)
- **Zoho SMTP** (via Nodemailer) — all transactional email
- **Twilio** — WhatsApp order alerts to vendors
- **Vercel Cron** — scheduled jobs (see below)
- **Node's built-in test runner** — backend tests (see Testing)

---

## 📁 Project Structure

```
OJA247/
├── backend/
│   ├── src/
│   │   ├── models/        Business, Product, Order, User, Vendor, Dispute,
│   │   │                  Review, Follow, Marketer, MarketerPayout,
│   │   │                  PointsLedger, ReferralAttribution,
│   │   │                  SubscriptionPayment, TaxLedger, PlatformSettings,
│   │   │                  EmailCampaign
│   │   ├── controllers/    One per domain — auth (admin/vendor, customer,
│   │   │                  marketer), business, product, direct (bank
│   │   │                  transfer) orders, fulfillment, dispute, review,
│   │   │                  follow, subscription, vendor, marketer, points,
│   │   │                  payout batch, analytics, campaigns, admin, plus
│   │   │                  one controller per scheduled job
│   │   ├── routes/         Mirrors controllers (see server.js for the mounts)
│   │   ├── services/       emailService, whatsappService, referralService,
│   │   │                  receiptStorage/receiptRetention, imageStorage,
│   │   │                  ninVerificationService, ownStoreCheck, stock,
│   │   │                  orderLinking, reviewEligibility, businessRating,
│   │   │                  fulfillment/unsubscribe tokens, and more
│   │   ├── middleware/     authMiddleware (protect + per-role guards),
│   │   │                  rateLimiters, rejectMongoOperators, sessionCookies
│   │   ├── utils/          transactions (all-or-nothing database work),
│   │   │                  cronAuth (scheduled-job secret check)
│   │   └── db.js
│   ├── test/               Node test-runner tests (npm test)
│   ├── scripts/            One-off maintenance scripts (see file headers)
│   ├── server.js
│   ├── vercel.json         # cron schedules live here
│   ├── env.example
│   └── package.json
│
└── oja247/ (frontend)
    ├── src/
    │   ├── pages/           Landing, Explore, Businesses, BusinessDetails,
    │   │                   BusinessForm, BusinessDashboard, Products,
    │   │                   ProductDetails, Cart, Checkout, PaymentStatus,
    │   │                   OrderHistory, ConfirmReceipt, ReportProblem,
    │   │                   customer/vendor/marketer login + register +
    │   │                   password pages, MarketerDashboard,
    │   │                   AdminDashboard, policy pages, About
    │   ├── components/      Navbar, Footer, VerifiedBadge, SubscriptionTab,
    │   │                   WaitingOrdersTab, Dispute/Review forms and tabs,
    │   │                   Admin tabs (customers, campaigns), ImageUpload,
    │   │                   ProtectedRoute, and more
    │   ├── context/         AuthContext (handles all 4 roles), CartContext
    │   ├── utils/           disputes, reviews, googleButton
    │   ├── App.jsx
    │   └── main.jsx
    └── package.json
```

---

## ⚙️ Installation & Setup

### Prerequisites
- Node.js v18+
- MongoDB **Atlas** (or any MongoDB replica set). The money code uses database transactions, which a plain single-server MongoDB does not support. The app always uses a database named `oja247`
- Accounts/API keys for: Cloudinary, Paystack, Zoho (SMTP), Twilio (WhatsApp), Google Cloud (OAuth client)

### 1️⃣ Clone
```bash
git clone https://github.com/MesoTheArtist/OJA247.git
cd OJA247
```

### 2️⃣ Backend
```bash
cd backend
npm install
```

Copy `backend/env.example` to `backend/.env` and fill in every value. At minimum you need:
```env
MONGO_URI=
JWT_SECRET=
PAYSTACK_SECRET_KEY=
CLOUDINARY_CLOUD_NAME=
CLOUDINARY_API_KEY=
CLOUDINARY_API_SECRET=
ZOHO_SMTP_USER=
ZOHO_SMTP_PASS=
GOOGLE_CLIENT_ID=
SITE_URL=              # used in every email link, e.g. https://oja247.store
CRON_SECRET=           # any long random string — required for scheduled jobs to run
FRONTEND_URL=          # e.g. https://oja247.store
```
NIN verification (Dojah), WhatsApp alerts (Twilio), email-sending limits and the order reminder timings are optional — see the full list and comments in `backend/env.example`.

```bash
npm start
```
✅ Backend running at `http://localhost:5000`

To create the first admin account, run `node createAdmin.js` once (edit the email and password in that file first).

### 3️⃣ Frontend
```bash
cd oja247
npm install
```

Copy `oja247/env.example` to `oja247/.env`:
```env
VITE_API_URL=http://localhost:5000
VITE_GOOGLE_CLIENT_ID=      # must match the backend's GOOGLE_CLIENT_ID exactly
VITE_PAYSTACK_PUBLIC_KEY=
```

```bash
npm run dev
```
✅ Frontend running at `http://localhost:5173`

---

## ⏰ Scheduled Jobs (Cron)

Seven jobs run on a schedule via Vercel Cron (defined in `backend/vercel.json`). Each is a `GET /api/cron/<name>` call protected by `CRON_SECRET` (`Authorization: Bearer <CRON_SECRET>`):

| Job | Schedule (UTC) | Does |
|---|---|---|
| `payout-batch` | Mondays 06:00 | Batches marketer commission for payout |
| `subscription-auto-renew` | Daily 06:00 | Charges saved cards for subscriptions set to renew |
| `subscription-expiry` | Daily 07:00 | Emails vendors whose subscription is expiring/expired/never started |
| `dispute-escalation` | Daily 08:00 | Auto-escalates disputes past the 7-day vendor self-resolve window |
| `verification-reminder` | Mondays 09:00 | Nags vendors below "Verified" tier, at most once a week each |
| `auto-receive` | Daily 10:00 | Reminds customers to confirm delivery, then marks old orders received |
| `transfer-follow-up` | Daily 11:00 | Reminds vendors about unanswered bank-transfer orders, flags the admin, and deletes receipt files past their retention period |

If deploying somewhere other than Vercel, these `/api/cron/*` endpoints need an external scheduler calling them instead — they do nothing on their own.

---

## 🔌 API Overview

The API surface is large (14 route files, 100+ endpoints) — rather than duplicate it here and let it drift out of date again, each route file lists its own endpoints clearly at the top of `backend/src/routes/`. A few starting points:

- **Customer auth:** `POST /api/customer-auth/register`, `/login`, `/google`, `/verify-email`, `/forgot-password`
- **Vendor/admin auth:** `POST /api/auth/register`, `/login`, `/google`, `/totp/*`
- **Marketers:** `POST /api/marketers/register`, `/login`, `/google` (login only), `PATCH /api/marketers/me/payout-details`
- **Businesses/products:** `GET /api/businesses`, `/api/products`, `/api/products/search`
- **Orders (bank transfer):** `GET /api/orders/payment-details/:businessId`, `POST /api/orders/direct`, `POST /api/orders/:reference/receipt`, `PATCH /api/orders/:reference/payment/confirm`, `GET /api/orders/my-orders`
- **Subscriptions:** `GET /api/subscriptions/plans`, `POST /api/subscriptions/initiate`, `POST /api/subscriptions/verify/:reference`, `POST /api/subscriptions/webhook` (Paystack)
- **Points:** `POST /api/businesses/:id/points/withdraw`
- **Disputes:** `POST /api/disputes`, `GET /api/disputes/business/:id` (vendor), `GET/PATCH /api/admin/disputes` (admin)
- **Reviews:** `POST /api/reviews`, `GET /api/reviews/business/:id`, `PATCH /api/reviews/:id/reply`
- **Follow:** `GET/POST/DELETE /api/follows/*`

---

## 🧪 Testing

Backend tests use Node's built-in test runner, so there is nothing extra to install:

```bash
cd backend
npm test
```

- **Unit tests** (always run): the own-store purchase check, scheduled-job secret check, password rules and image validation.
- **Database tests** (`backend/test/money.integration.test.js`): points reserved for subscriptions, withdrawals, rejected withdrawals and referral rewards, with Paystack faked so no real money moves. They are **skipped** unless you point them at a throwaway MongoDB that supports transactions (any Atlas cluster). The database name must contain `test`, and the tests refuse to run otherwise:

```powershell
$env:TEST_MONGODB_URI="mongodb+srv://USER:PASS@CLUSTER.mongodb.net/oja247-test"
npm test
```

There is no frontend test suite yet. For manual checks, go through each flow (customer, vendor, marketer, admin, orders, subscriptions, disputes, cron jobs) on a staging deployment before a release.

---

## 🌍 Deployment

Currently deployed as two separate **Vercel** projects:
- **Backend** — Node server (`backend/`), `vercel.json` also defines the four cron schedules
- **Frontend** — Vite build (`oja247/`)

**Database:** MongoDB Atlas (required for transactions). Set `MONGO_URI` on the backend project and redeploy after any change.

Before deploying to production, double-check:
- Every env var in both `env.example` files is set on the correct Vercel project, scoped to **Production** (not just Preview/Development — this has bitten the project before with `VITE_GOOGLE_CLIENT_ID`)
- `PAYSTACK_SECRET_KEY` / `VITE_PAYSTACK_PUBLIC_KEY` are the **live** keys, not test
- `CRON_SECRET` matches on the backend and is confirmed actually firing (Vercel's Cron Jobs tab shows run history for all seven jobs)
- No duplicate/stale env var entries left over from an earlier setup

---

## 🔒 Security Notes

- Passwords hashed with bcrypt, never stored plain; 8-character minimum
- JWT-based sessions, separate token namespaces per role
- Paystack webhooks verify HMAC-SHA512 signature with `crypto.timingSafeEqual`
- Guest-order-to-account linking requires a **verified** email, closing off a path where someone could register another person's email and read their order history
- Cron endpoints fail closed (reject) if `CRON_SECRET` is unset, rather than silently becoming public
- A vendor cannot place an order on their own store using their own email or phone (look-alike spellings of the same address are caught). This is a speed bump rather than a guarantee — someone using entirely unrelated details is not detectable
- Found a vulnerability? Please email support@oja247.com instead of opening a public issue

---

## 🗺️ Roadmap

Shipped since the last time this file was accurate: bank-transfer checkout with receipts and delivery confirmation, subscription payments with auto-renewal, customer accounts + email verification, reviews, follow + new-product emails, disputes (customer, guest, and vendor-facing), subscriptions + visibility enforcement, the marketer/referral system with points, the full admin dashboard, email announcements, WhatsApp order alerts, admin two-factor, the Verified badge, and a security hardening pass with automated tests.

Still open / under consideration:
- [ ] Payout dashboard with a plain-language earnings breakdown
- [ ] Vendor performance dashboard (views, conversion, top products) — note: a marketer-performance leaderboard already exists (admin-only, ranks referral activity), this would be a separate, vendor-facing one
- [ ] Non-discouraging public vendor leaderboard (top 10/20 visible, everyone else sees private rank + trend) with milestone badges
- [ ] Bulk inventory upload (spreadsheet, or WhatsApp photo+price)
- [ ] Vendor-refers-vendor referral system
- [ ] Category-specific verified badges (e.g. "Verified Fashion Vendor")
- [ ] PWA support, push notifications
- [ ] Frontend automated tests
- [ ] Tie orders to a customer login so own-store purchases can be blocked reliably

---

## 🤝 Contributing

1. Fork the repository
2. Create your feature branch (`git checkout -b feature/AmazingFeature`)
3. Commit your changes (`git commit -m 'Add some AmazingFeature'`)
4. Push to the branch (`git push origin feature/AmazingFeature`)
5. Open a Pull Request

---

## 📝 License

This project is licensed under the MIT License — see the [LICENSE](LICENSE) file for details.

---

## 👨‍💻 Authors

**OLanrewaju** — GitHub: [@lan647](https://github.com/lanre647)
**Ebenezer** — GitHub: [@MesoTheArtist](https://github.com/MesoTheArtist)

---

## 📞 Support & Contact

- 🐛 **Found a bug?** [Open an issue](https://github.com/MesoTheArtist/OJA247/issues)
- 💡 **Feature request?** [Start a discussion](https://github.com/MesoTheArtist/OJA247/discussions)
- 📧 **Email:** support@oja247.com

---

<div align="center">

**⭐ Star this repo if you find it helpful!**

Made with 💚 in Nigeria 🇳🇬

</div>