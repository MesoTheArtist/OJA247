import test from "node:test";
import assert from "node:assert/strict";
import User from "../src/models/User.js";
import Marketer from "../src/models/Marketer.js";

// Runs the model's own validation and returns the error for `password`, if any.
const passwordError = async (doc) => {
  try {
    await doc.validate();
    return undefined;
  } catch (err) {
    return err.errors?.password;
  }
};

test("user passwords: 8 to 72 characters", async () => {
  const make = (password) => passwordError(new User({ email: "a@b.com", role: "admin", password }));
  assert.ok(await make("1234567"), "7 characters must be rejected");
  assert.equal(await make("12345678"), undefined);
  assert.ok(await make("x".repeat(73)), "73 characters must be rejected (bcrypt ignores the rest)");
  assert.equal(await make("x".repeat(72)), undefined);
});

test("marketer passwords: 8 to 72 characters", async () => {
  const make = (password) =>
    passwordError(new Marketer({ name: "M", email: "m@b.com", referralCode: "ABC123", password }));
  assert.ok(await make("1234567"));
  assert.equal(await make("12345678"), undefined);
  assert.ok(await make("x".repeat(73)));
});