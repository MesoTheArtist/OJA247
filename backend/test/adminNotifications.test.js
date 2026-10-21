import test from "node:test";
import assert from "node:assert/strict";
import { referralLine } from "../src/services/adminNotificationService.js";
import AdminNotification, { ADMIN_NOTIFICATION_TYPES } from "../src/models/AdminNotification.js";

test("referralLine says so when no code was used", () => {
  assert.equal(referralLine({ code: null }), "No referral code used.");
});

test("referralLine names the owner of a valid code", () => {
  const line = referralLine({ code: "MKT-AB12CD", valid: true, ownerType: "marketer", ownerName: "Ada Obi" });
  assert.match(line, /MKT-AB12CD/);
  assert.match(line, /marketer Ada Obi/);
});

test("referralLine still shows a code that matched nobody", () => {
  const line = referralLine({ code: "WRONG12", valid: false });
  assert.match(line, /WRONG12/);
  assert.match(line, /no match/);
});

test("notification model accepts every declared type and rejects others", () => {
  for (const type of ADMIN_NOTIFICATION_TYPES) {
    const doc = new AdminNotification({ type, title: "x" });
    assert.equal(doc.validateSync(), undefined, type);
  }
  const bad = new AdminNotification({ type: "something_else", title: "x" });
  assert.ok(bad.validateSync());
});
test("notification history window is 50 days", async () => {
  const { NOTIFICATION_HISTORY_DAYS } = await import("../src/models/AdminNotification.js");
  assert.equal(NOTIFICATION_HISTORY_DAYS, 50);
});
