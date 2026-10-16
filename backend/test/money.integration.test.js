// Tests for the money paths: points reserved for subscriptions, withdrawals,
// rejected withdrawals and referral rewards. They need a REAL MongoDB with
// transactions (any Atlas cluster works) and are skipped unless you set:
//
//   TEST_MONGODB_URI="mongodb+srv://user:pass@cluster.mongodb.net/oja247-test"
//
// Use a throwaway database: the name must contain "test", and each test
// creates and removes only its own records. Paystack is faked, so no real
// money moves. Run with:  npm test
import { describe, test, before, after } from "node:test";
import assert from "node:assert/strict";
import mongoose from "mongoose";

const URI = process.env.TEST_MONGODB_URI;
const skip = URI ? false : "set TEST_MONGODB_URI to a throwaway MongoDB (name must contain 'test') to run these";

describe("money flows (real database)", { skip }, () => {
  let M; // models + controllers, loaded after the environment is set up
  const realFetch = globalThis.fetch;
  const created = { businesses: [], users: [], vendors: [], ledgerOwners: [] };
  let paystackVerifyStatus = "failed";
  const uid = () => Math.random().toString(36).slice(2, 10);

  const fakeRes = () => ({
    statusCode: 200,
    body: null,
    status(code) { this.statusCode = code; return this; },
    json(body) { this.body = body; return this; },
  });

  before(async () => {
    const dbName = new URL(URI).pathname.replace("/", "");
    if (!dbName.toLowerCase().includes("test")) {
      throw new Error(`Refusing to run: database "${dbName}" does not look like a test database (its name must contain "test").`);
    }
    process.env.PAYSTACK_SECRET_KEY = "sk_test_fake";
    process.env.JWT_SECRET = process.env.JWT_SECRET || "test-secret";

    // Fake Paystack: starting a payment succeeds, and verifying reports whatever the test sets.
    globalThis.fetch = async (url, options) => {
      const target = String(url);
      if (target.includes("/transaction/initialize")) {
        return { ok: true, status: 200, json: async () => ({ status: true, data: { access_code: "AC_TEST" } }) };
      }
      if (target.includes("/transaction/verify/")) {
        return { ok: true, status: 200, json: async () => ({ status: true, data: { status: paystackVerifyStatus, amount: 0 } }) };
      }
      return realFetch(url, options);
    };

    await mongoose.connect(URI);
    M = {
      Business: (await import("../src/models/Business.js")).default,
      User: (await import("../src/models/User.js")).default,
      Vendor: (await import("../src/models/Vendor.js")).default,
      PointsLedger: (await import("../src/models/PointsLedger.js")).default,
      ReferralAttribution: (await import("../src/models/ReferralAttribution.js")).default,
      SubscriptionPayment: (await import("../src/models/SubscriptionPayment.js")),
      subscription: await import("../src/controllers/subscriptionController.js"),
      points: await import("../src/controllers/pointsController.js"),
      admin: await import("../src/controllers/adminController.js"),
      referral: await import("../src/services/referralService.js"),
    };
  });

  after(async () => {
    globalThis.fetch = realFetch;
    if (M) {
      const ids = created.businesses;
      await M.SubscriptionPayment.default.deleteMany({ businessId: { $in: ids } });
      await M.PointsLedger.deleteMany({ businessId: { $in: ids } });
      await M.ReferralAttribution.deleteMany({ $or: [{ referredBusinessId: { $in: ids } }, { referrerId: { $in: ids } }] });
      await M.Vendor.deleteMany({ _id: { $in: created.vendors } });
      await M.User.deleteMany({ _id: { $in: created.users } });
      await M.Business.deleteMany({ _id: { $in: ids } });
    }
    await mongoose.disconnect();
  });

  async function makeBusiness({ points = 0, vendor = false, payoutHold = false } = {}) {
    const business = await M.Business.create({ name: `Test Store ${uid()}`, pointsBalance: points });
    const user = await M.User.create({
      email: `owner-${uid()}@example.test`, password: "password123", role: "owner", businessId: business._id,
    });
    created.businesses.push(business._id);
    created.users.push(user._id);
    if (vendor) {
      const v = await M.Vendor.create({
        businessId: business._id, businessName: business.name, contactEmail: user.email, contactPhone: "08031112222",
        bankCode: "058", bankName: "Test Bank", accountNumber: "0123456789", accountName: "Test Owner",
        nin: "12345678901", payoutHold,
      });
      created.vendors.push(v._id);
    }
    return { business, user, asOwner: { _id: user._id, role: "owner", businessId: business._id } };
  }

  const balanceOf = async (id) => (await M.Business.findById(id).select("pointsBalance")).pointsBalance;
  // Runs the controller with a fake request and returns the response it produced.
  async function initiate(store, body) {
    const res = fakeRes();
    await M.subscription.initiateSubscription(
      { user: store.asOwner, body: { businessId: String(store.business._id), planType: "monthly", ...body } },
      res
    );
    return res;
  }

  test("two payments started at once cannot spend the same points", async () => {
    const store = await makeBusiness({ points: 1500 });
    const [a, b] = await Promise.all([initiate(store, { pointsToApply: 1000 }), initiate(store, { pointsToApply: 1000 })]);

    assert.deepEqual([a.statusCode, b.statusCode].sort(), [201, 409]);
    assert.equal(await balanceOf(store.business._id), 500);
    const held = await M.SubscriptionPayment.default.find({ businessId: store.business._id, pointsReserved: true });
    assert.equal(held.length, 1);
    assert.equal(await M.PointsLedger.countDocuments({ businessId: store.business._id, type: "redeemed_subscription" }), 1);
  });

  test("a card payment returns the access code the popup needs", async () => {
    const store = await makeBusiness({ points: 0 });
    const res = await initiate(store, {});
    assert.equal(res.statusCode, 201);
    assert.equal(res.body.accessCode, "AC_TEST");
    assert.equal(res.body.fullyPaidWithPoints, false);
  });

  test("points come back when Paystack says the payment failed", async () => {
    const store = await makeBusiness({ points: 1500 });
    const started = await initiate(store, { pointsToApply: 1000 });
    assert.equal(started.statusCode, 201);
    assert.equal(await balanceOf(store.business._id), 500);

    paystackVerifyStatus = "failed";
    const verify = fakeRes();
    await M.subscription.verifySubscriptionPayment({ user: store.asOwner, params: { reference: started.body.reference } }, verify);

    assert.equal(verify.statusCode, 400);
    assert.equal(await balanceOf(store.business._id), 1500);
    const payment = await M.SubscriptionPayment.default.findOne({ paystackReference: started.body.reference });
    assert.equal(payment.status, "failed");
    assert.equal(payment.pointsReserved, false);
    assert.equal(await M.PointsLedger.countDocuments({ businessId: store.business._id, type: "redemption_refunded" }), 1);
  });

  test("an abandoned payment's points are freed when the next one starts", async () => {
    const store = await makeBusiness({ points: 1500 });
    const first = await initiate(store, { pointsToApply: 1000 });
    assert.equal(await balanceOf(store.business._id), 500);

    // Make it look a few minutes old, and have Paystack report it was abandoned.
    await M.SubscriptionPayment.default.collection.updateOne(
      { paystackReference: first.body.reference }, { $set: { createdAt: new Date(Date.now() - 5 * 60 * 1000) } }
    );
    paystackVerifyStatus = "abandoned";

    const second = await initiate(store, { pointsToApply: 1000 });
    assert.equal(second.statusCode, 201);
    assert.equal(await balanceOf(store.business._id), 500, "points held once, not twice");
    const old = await M.SubscriptionPayment.default.findOne({ paystackReference: first.body.reference });
    assert.equal(old.status, "failed");
    assert.equal(old.pointsReserved, false);
  });

  test("a plan fully covered by points activates and spends exactly the plan price", async () => {
    const price = M.SubscriptionPayment.PLAN_PRICES.monthly;
    const store = await makeBusiness({ points: price + 1000 });
    const res = await initiate(store, { pointsToApply: price + 1000 });

    assert.equal(res.statusCode, 201);
    assert.equal(res.body.fullyPaidWithPoints, true);
    assert.equal(await balanceOf(store.business._id), 1000);
    const business = await M.Business.findById(store.business._id);
    assert.equal(business.subscriptionStatus, "active");
  });

  test("two withdrawals of the same points: only one goes through", async () => {
    const store = await makeBusiness({ points: 1000, vendor: true });
    const withdraw = async () => {
      const res = fakeRes();
      await M.points.withdrawPoints({ user: store.asOwner, params: { id: String(store.business._id) }, body: { amount: 800 } }, res);
      return res;
    };
    const [a, b] = await Promise.all([withdraw(), withdraw()]);

    assert.deepEqual([a.statusCode, b.statusCode].sort(), [200, 400]);
    assert.equal(await balanceOf(store.business._id), 200);
    assert.equal(await M.PointsLedger.countDocuments({ businessId: store.business._id, type: "withdrawn_cash" }), 1);
  });

  test("withdrawals are blocked while the payout account is on hold", async () => {
    const store = await makeBusiness({ points: 1000, vendor: true, payoutHold: true });
    const res = fakeRes();
    await M.points.withdrawPoints({ user: store.asOwner, params: { id: String(store.business._id) }, body: { amount: 500 } }, res);
    assert.equal(res.statusCode, 403);
    assert.equal(await balanceOf(store.business._id), 1000);
  });

  test("rejecting a withdrawal refunds the points exactly once", async () => {
    const store = await makeBusiness({ points: 1000, vendor: true });
    const made = fakeRes();
    await M.points.withdrawPoints({ user: store.asOwner, params: { id: String(store.business._id) }, body: { amount: 600 } }, made);
    assert.equal(await balanceOf(store.business._id), 400);

    const reject = async () => {
      const res = fakeRes();
      await M.admin.rejectPointsWithdrawal(
        { user: { _id: new mongoose.Types.ObjectId(), role: "admin" }, params: { id: String(made.body.entry._id) }, body: { reason: "test" } }, res
      );
      return res;
    };
    const [a, b] = await Promise.all([reject(), reject()]);

    assert.deepEqual([a.statusCode, b.statusCode].sort(), [200, 404]);
    assert.equal(await balanceOf(store.business._id), 1000);
    assert.equal(await M.PointsLedger.countDocuments({ businessId: store.business._id, type: "withdrawal_refunded" }), 1);
  });

  test("a referral reward is paid once, and only for real cash", async () => {
    const referrer = await makeBusiness({ points: 0 });
    const referred = await makeBusiness({ points: 0 });
    await M.ReferralAttribution.create({
      referrerType: "business", referrerId: referrer.business._id, referrerModel: "Business",
      referralCode: "TESTCODE1", referredBusinessId: referred.business._id,
    });
    const convert = (amountPaid) =>
      M.referral.handleSubscriptionConversion({
        businessId: referred.business._id, amountPaid, planType: "monthly", paymentId: null, paymentReference: `ref-${uid()}`,
      });

    // Too little real cash: nothing is paid and the referral stays pending.
    assert.equal(await convert(500), null);
    assert.equal(await balanceOf(referrer.business._id), 0);
    assert.equal((await M.ReferralAttribution.findOne({ referredBusinessId: referred.business._id })).status, "pending");

    // Real cash, two payments landing at once: one reward.
    await Promise.all([convert(1999), convert(1999)]);
    const earned = await M.PointsLedger.find({ businessId: referrer.business._id, type: "earned" });
    assert.equal(earned.length, 1);
    assert.equal(await balanceOf(referrer.business._id), earned[0].points);
    assert.equal((await M.ReferralAttribution.findOne({ referredBusinessId: referred.business._id })).status, "converted");
  });
});