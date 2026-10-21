import test from "node:test";
import assert from "node:assert/strict";
import {
  buildMarketerReferrals,
  buildBusinessReferrals,
  describePayout,
  describeLedgerEntry,
} from "../src/services/referralBreakdown.js";

const attribution = {
  _id: "a1",
  createdAt: new Date("2026-10-01"),
  convertedAt: new Date("2026-10-14"),
  status: "converted",
  conversionPlanType: "monthly",
  conversionBaseAmount: 1999,
  conversionPaymentReference: "REF-1",
  referredBusinessId: { _id: "b1", name: "Ada's Store" },
};
const pendingAttribution = {
  _id: "a2",
  createdAt: new Date("2026-10-05"),
  convertedAt: null,
  status: "pending",
  referredBusinessId: { _id: "b2", name: "Bayo Foods" },
};
const payout = {
  _id: "p1",
  referralAttributionId: "a1",
  amount: 1000,
  commissionRate: 0.5,
  status: "paid",
  paidAt: new Date("2026-10-20"),
  planType: "monthly",
  conversionAmount: 1999,
  paymentReference: "REF-1",
};

test("marketer referral shows plan, amount paid and what it earned", () => {
  const [row] = buildMarketerReferrals([attribution], [payout]);
  assert.equal(row.businessName, "Ada's Store");
  assert.equal(row.planType, "monthly");
  assert.equal(row.amountPaid, 1999);
  assert.deepEqual(
    { kind: row.earning.kind, amount: row.earning.amount, rate: row.earning.rate, status: row.earning.status },
    { kind: "cash", amount: 1000, rate: 0.5, status: "paid" }
  );
});

test("a pending referral has no earning yet", () => {
  const [row] = buildMarketerReferrals([pendingAttribution], []);
  assert.equal(row.status, "pending");
  assert.equal(row.earning, null);
  assert.equal(row.planType, null);
});

test("vendor referral shows the points it earned", () => {
  const [row] = buildBusinessReferrals(
    [attribution],
    [{ referralAttributionId: "a1", points: 1000, createdAt: new Date("2026-10-14") }]
  );
  assert.equal(row.earning.kind, "points");
  assert.equal(row.earning.amount, 1000);
});

test("a payout row says which referral it came from", () => {
  const row = describePayout(payout, [attribution]);
  assert.equal(row.businessName, "Ada's Store");
  assert.equal(row.rate, 0.5);
  assert.equal(row.amountPaid, 1999);
  assert.equal(row.planType, "monthly");
});

test("a payout whose business was deleted still renders", () => {
  const row = describePayout(payout, []);
  assert.equal(row.businessName, "(business deleted)");
  assert.equal(row.amount, 1000);
});

test("points history explains earned and redeemed entries", () => {
  const earned = describeLedgerEntry(
    { _id: "l1", type: "earned", points: 1000, balanceAfter: 1000, status: "n/a", referralAttributionId: "a1", createdAt: new Date() },
    [attribution],
    new Map()
  );
  assert.equal(earned.detail.businessName, "Ada's Store");
  assert.equal(earned.detail.planType, "monthly");

  const redeemed = describeLedgerEntry(
    { _id: "l2", type: "redeemed_subscription", points: -1999, balanceAfter: 0, status: "n/a", subscriptionPaymentId: "s1", createdAt: new Date() },
    [attribution],
    new Map([["s1", { planType: "yearly", amount: 17999 }]])
  );
  assert.equal(redeemed.detail.planType, "yearly");
});