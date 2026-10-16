import test from "node:test";
import assert from "node:assert/strict";
import { isValidCronRequest } from "../src/utils/cronAuth.js";

test("accepts only the exact bearer secret", () => {
  process.env.CRON_SECRET = "s3cret-value";
  assert.equal(isValidCronRequest("Bearer s3cret-value"), true);
  assert.equal(isValidCronRequest("Bearer s3cret-valuf"), false);
  assert.equal(isValidCronRequest("s3cret-value"), false);
  assert.equal(isValidCronRequest(""), false);
  assert.equal(isValidCronRequest(undefined), false);
});

test("rejects everything when no secret is configured (fails closed)", () => {
  delete process.env.CRON_SECRET;
  assert.equal(isValidCronRequest("Bearer undefined"), false);
  assert.equal(isValidCronRequest("Bearer "), false);
});