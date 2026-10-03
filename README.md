# 🚀 OJA247 — Nigerian Multi-Vendor Marketplace

[![License](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)
[![GitHub stars](https://img.shields.io/github/stars/LaBoss999/OJA247?style=social)](https://github.com/LaBoss999/OJA247/stargazers)

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
- Optional **customer account**: password signup (email verification required) or **Google sign-in** (instant, no verification step)
- Guest orders retroactively link to an account once the email is verified
- **Order history**, with a guest-lookup flow (order reference + email) for anyone without an account
- **Follow** vendors — get emailed automatically when a followed vendor adds a new product
- **Reviews** — leave a star rating + comment on any vendor you've actually bought from (verified-purchase gated, one review per vendor per order, no time limit); vendors can post one public reply
- **Disputes** — file a dispute on a paid order (5-day window), as a signed-in customer or as a guest; vendor gets 7 days to self-resolve before it escalates to admin
- Payment via **Paystack**, with a clear payment-status page after checkout

### 🏪 For Business Owners
- Combined onboarding form: business details + payout bank info + KYC documents in one step
- Tiered verification: **Basic** (NIN + bank-name match) → **Verified** (+CAC registration + address proof) — a recurring reminder nags incomplete verification, nothing is auto-hidden
- Product management (create/edit/delete, multi-image upload via Cloudinary)
- Vendor dashboard: earnings summary, points balance (withdrawable or usable toward subscription), **Reviews** tab (reply to customer reviews), **Disputes** tab (resolve disputes raised against you, with a refunded checkbox)
- **Subscription-based visibility** — a platform-wide admin "kill switch" can require an active subscription for a store to appear in search/Explore (off by default); vendors get reminded before expiry, on expiry, and periodically if they've never subscribed at all
- New order alerts via **email and WhatsApp** (Twilio)
- Optional **TOTP two-factor authentication** on login
- Google sign-in supported alongside email/password

### 🤝 For Marketers (Referral Partners)
- Separate marketer accounts, own login/dashboard
- Custom short referral code, used to attribute vendor signups/subscriptions
- Points ledger, payout requests, admin-run weekly payout batching

### 🛠️ For Admins
- Full dashboard: Overview/Analytics, Businesses, Products, Orders, Users, **Customers** (separate from generic Users — order/spend/review/dispute stats, full detail drill-in, ban/delete/edit/manually-verify-email), Vendor Verification, Marketers, Payout Batches, Transactions, **Kill Switch** (subscription-visibility enforcement), Grandfather Exemptions, Tax Ledger
- Every data table is mobile-responsive (collapses to cards below 640px)
- Dispute oversight: view escalated disputes, resolve them, see which vendors are flagged for a high dispute rate (ban-candidate signal, never automatic)

### 🔐 Security & Authentication
- Separate JWT-based auth for **customers**, **vendors**, **marketers**, and **admin** — kept in distinct controllers/routes, not shared
- Password hashing with bcrypt; Google-only accounts have no password at all
- Customer email verification required before guest orders link to an account (prevents someone registering your email to read your order history)
- Paystack webhook signatures verified with HMAC-SHA512 + `crypto.timingSafeEqual`
- Scheduled jobs (see below) authenticated via a shared `CRON_SECRET`, fail-closed if unset

---

## 🛠️ Tech Stack

### Frontend
- **React 18**, **React Router**, **Axios**, **Tailwind CSS**, **Framer Motion**

### Backend
- **Node.js** / **Express.js**, **MongoDB** / **Mongoose**, **JWT**, **bcryptjs**
- **Cloudinary** — image storage
- **Paystack** — payments (orders) + subscriptions, including split payments across vendor subaccounts on multi-vendor orders
- **Zoho SMTP** (via Nodemailer) — all transactional email
- **Twilio** — WhatsApp order alerts to vendors
- **Vercel Cron** — scheduled jobs (see below)

---

## 📁 Project Structure

```
OJA247/
├── backend/
│   ├── src/
│   │   ├── models/        Business, Product, Order, User, Vendor, Dispute,
│   │   │                  Review, Follow, Marketer, MarketerPayout,
│   │   │                  PointsLedger, ReferralAttribution,
│   │   │                  SubscriptionPayment, TaxLedger, PlatformSettings
│   │   ├── controllers/    One per domain — auth (x4: admin/vendor,
│   │   │                  customer, marketer, shared), business, product,
│   │   │                  order, dispute (+ cron), review, follow,
│   │   │                  subscription (+ cron), vendor, marketer,
│   │   │                  points, payout batch, analytics, admin,
│   │   │                  verification-reminder cron
│   │   ├── routes/         Mirrors controllers — auth, customerAuth,
│   │   │                  marketer, business, product, order, dispute,
│   │   │                  review, follow, subscription, vendor, admin,
│   │   │                  upload, cron
│   │   ├── services/       emailService, whatsappService, orderLinking,
│   │   │                  disputeOrderStatus, reviewEligibility,
│   │   │                  businessRating, referralService, marketerApi
│   │   ├── middleware/     authMiddleware (protect + per-role guards)
│   │   └── db.js
│   ├── server.js
│   ├── vercel.json          # cron schedules live here
│   └── package.json
│
└── oja247/ (frontend)
    ├── src/
    │   ├── pages/           LandingPage, ExplorePage, Businesses,
    │   │                   BusinessDetails, BusinessForm, BusinessDashboard,
    │   │                   Products, ProductDetails, CartPage, Checkout,
    │   │                   PaymentStatusPage, OrderHistoryPage,
    │   │                   ReportProblemPage, CustomerAuthPage,
    │   │                   VerifyEmailPage, ForgotPasswordForm,
    │   │                   ResetPasswordForm, LoginPage,
    │   │                   MarketerLoginPage, MarketerRegisterForm,
    │   │                   MarketerDashboard, AdminDashboard, About
    │   ├── components/      DisputeForm/Modal, ReviewForm/Modal,
    │   │                   VendorDisputesTab, VendorReviewsTab,
    │   │                   CustomerAdminTab, CustomerDetailModal,
    │   │                   AccountAlertsPopup, ImageUpload,
    │   │                   ProtectedRoute, and more
    │   ├── context/         AuthContext (handles all 4 roles)
    │   ├── App.jsx
    │   └── main.jsx
    └── package.json
```

---

## ⚙️ Installation & Setup

### Prerequisites
- Node.js v18+
- MongoDB (local or Atlas)
- Accounts/API keys for: Cloudinary, Paystack, Zoho (SMTP), Twilio (WhatsApp), Google Cloud (OAuth client)

### 1️⃣ Clone
```bash
git clone https://github.com/LaBoss999/OJA247.git
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
```
Twilio WhatsApp alerts and full Paystack Multi-Split need a few more — see the full list and comments in `backend/env.example`.

```bash
node server.js
```
✅ Backend running at `http://localhost:5000`

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

Four jobs run on a schedule via Vercel Cron (defined in `backend/vercel.json`), each protected by `CRON_SECRET`:

| Job | Schedule | Does |
|---|---|---|
| `payout-batch` | Mondays 06:00 UTC | Batches marketer commission for payout |
| `subscription-expiry` | Daily 07:00 UTC | Emails vendors whose subscription is expiring/expired/never started |
| `dispute-escalation` | Daily 08:00 UTC | Auto-escalates disputes past the 7-day vendor self-resolve window |
| `verification-reminder` | Mondays 09:00 UTC | Nags vendors below "Verified" tier, at most once a week each |

If deploying somewhere other than Vercel, these four `/api/cron/*` endpoints need an external scheduler calling them instead — they do nothing on their own.

---

## 🔌 API Overview

The API surface is large (14 route files, 100+ endpoints) — rather than duplicate it here and let it drift out of date again, each route file lists its own endpoints clearly at the top of `backend/src/routes/`. A few starting points:

- **Customer auth:** `POST /api/customer-auth/register`, `/login`, `/google`, `/verify-email`, `/forgot-password`
- **Vendor/admin auth:** `POST /api/auth/register`, `/login`, `/google`, `/totp/*`
- **Marketer auth:** `POST /api/marketer-auth/register`, `/login`
- **Businesses/products:** `GET /api/businesses`, `/api/products`, `/api/products/search`
- **Orders:** `POST /api/orders`, `GET /api/orders/my-orders`, `POST /api/orders/webhook` (Paystack)
- **Disputes:** `POST /api/disputes`, `GET /api/disputes/business/:id` (vendor), `GET/PATCH /api/admin/disputes` (admin)
- **Reviews:** `POST /api/reviews`, `GET /api/reviews/business/:id`, `PATCH /api/reviews/:id/reply`
- **Follow:** `GET/POST/DELETE /api/follows/*`

---

## 🧪 Testing

There's a full, repo-scanned feature inventory and manual test checklist covering every area above — customer accounts, vendor accounts, marketer accounts, orders/payments, disputes, reviews, follow, subscriptions, admin, and all four cron jobs. Ask whoever maintains this repo for the current copy rather than relying on anything written here, since this section is the one most likely to drift.

---

## 🌍 Deployment

Currently deployed as two separate **Vercel** projects:
- **Backend** — Node server (`backend/`), `vercel.json` also defines the four cron schedules
- **Frontend** — Vite build (`oja247/`)

**Database:** MongoDB Atlas.

Before deploying to production, double-check:
- Every env var in both `env.example` files is set on the correct Vercel project, scoped to **Production** (not just Preview/Development — this has bitten the project before with `VITE_GOOGLE_CLIENT_ID`)
- `PAYSTACK_SECRET_KEY` / `VITE_PAYSTACK_PUBLIC_KEY` are the **live** keys, not test
- `CRON_SECRET` matches on the backend and is confirmed actually firing (Vercel's Cron Jobs tab shows run history)
- No duplicate/stale env var entries left over from an earlier setup

---

## 🔒 Security Notes

- Passwords hashed with bcrypt, never stored plain
- JWT-based sessions, separate token namespaces per role
- Paystack webhooks verify HMAC-SHA512 signature with `crypto.timingSafeEqual`
- Guest-order-to-account linking requires a **verified** email, closing off a path where someone could register another person's email and read their order history
- Cron endpoints fail closed (reject) if `CRON_SECRET` is unset, rather than silently becoming public

---

## 🗺️ Roadmap

Shipped since the last time this file was accurate: payments (Paystack + Multi-Split), customer accounts + email verification, reviews, follow + new-product emails, disputes (customer, guest, and vendor-facing), subscriptions + visibility enforcement, the marketer/referral system, the full admin dashboard, WhatsApp order alerts, and TOTP 2FA.

Still open / under consideration:
- [ ] Payout dashboard with a plain-language earnings breakdown
- [ ] Vendor performance dashboard (views, conversion, top products) — note: a marketer-performance leaderboard already exists (admin-only, ranks referral activity), this would be a separate, vendor-facing one
- [ ] Non-discouraging public vendor leaderboard (top 10/20 visible, everyone else sees private rank + trend) with milestone badges
- [ ] Bulk inventory upload (spreadsheet, or WhatsApp photo+price)
- [ ] Vendor-refers-vendor referral system
- [ ] Category-specific verified badges (e.g. "Verified Fashion Vendor")
- [ ] PWA support, push notifications

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

- 🐛 **Found a bug?** [Open an issue](https://github.com/LaBoss999/OJA247/issues)
- 💡 **Feature request?** [Start a discussion](https://github.com/MesoTheArtist/OJA247/discussions)
- 📧 **Email:** support@oja247.com

---

<div align="center">

**⭐ Star this repo if you find it helpful!**

Made with 💚 in Nigeria 🇳🇬

</div>