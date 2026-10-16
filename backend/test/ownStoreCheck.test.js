import test from "node:test";
import assert from "node:assert/strict";
import { canonicalEmail, isOwnStoreCustomer } from "../src/services/ownStoreCheck.js";

const vendor = { contactEmail: "shop@example.com", contactPhone: "0803 111 2222", contactWhatsapp: "+234 805 333 4444" };

test("canonicalEmail ignores +tags, Gmail dots and googlemail.com", () => {
  assert.equal(canonicalEmail("Me.Shop+promo@Gmail.com"), "meshop@gmail.com");
  assert.equal(canonicalEmail("m.e@googlemail.com"), "me@gmail.com");
  assert.equal(canonicalEmail("a.b+x@company.com"), "a.b@company.com"); // dots only matter for Gmail
});

test("blocks the store's own email, including look-alike spellings", () => {
  const own = (email) => isOwnStoreCustomer({ customer: { email }, vendor, ownerEmail: "owner.name@gmail.com" });
  assert.equal(own("owner.name@gmail.com"), true);
  assert.equal(own("OwnerName+test@gmail.com"), true);
  assert.equal(own("o.w.n.e.r.n.a.m.e@googlemail.com"), true);
  assert.equal(own("SHOP@example.com"), true);
  assert.equal(own("someone.else@gmail.com"), false);
});

test("blocks the store's own phone numbers in any format", () => {
  const own = (phone) => isOwnStoreCustomer({ customer: { email: "x@y.com", phone }, vendor });
  assert.equal(own("08031112222"), true);
  assert.equal(own("+234 803 111 2222"), true);
  assert.equal(own("2348053334444"), true); // the WhatsApp number
  assert.equal(own("08099990000"), false);
});

test("blocks a number written in the store's public contact line", () => {
  const own = (phone) =>
    isOwnStoreCustomer({ customer: { email: "x@y.com", phone }, vendor: {}, businessContact: "Call 0907-777-8888 or visit us" });
  assert.equal(own("09077778888"), true);
  assert.equal(own("09077770000"), false);
});

test("a genuine customer passes", () => {
  assert.equal(
    isOwnStoreCustomer({ customer: { email: "buyer@gmail.com", phone: "08123456789" }, vendor, ownerEmail: "owner@gmail.com" }),
    false
  );
});