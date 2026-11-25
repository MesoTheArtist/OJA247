import test from "node:test";
import assert from "node:assert/strict";
import { buildMulticastMessage, deadTokens } from "../src/services/pushMessage.js";

test("builds a message for every phone with a title and body", () => {
  const message = buildMulticastMessage(["a", "b"], { title: "New order", body: "Ada ordered a dress" });
  assert.deepEqual(message.tokens, ["a", "b"]);
  assert.deepEqual(message.notification, { title: "New order", body: "Ada ordered a dress" });
  assert.equal(message.android.priority, "high");
});

test("falls back to OJA247 when there is no title", () => {
  assert.equal(buildMulticastMessage(["a"], { body: "x" }).notification.title, "OJA247");
  assert.equal(buildMulticastMessage(["a"]).notification.title, "OJA247");
});

test("makes every data value text and drops empty ones", () => {
  const message = buildMulticastMessage(["a"], { title: "t", body: "b", data: { orderId: 42, flag: true, skip: null, gone: undefined } });
  assert.deepEqual(message.data, { orderId: "42", flag: "true" });
});

test("keeps the title and body to a sensible length", () => {
  const message = buildMulticastMessage(["a"], { title: "t".repeat(500), body: "b".repeat(2000) });
  assert.equal(message.notification.title.length, 100);
  assert.equal(message.notification.body.length, 300);
});

test("does not change the list of phones it was given", () => {
  const tokens = ["a"];
  const message = buildMulticastMessage(tokens, { title: "t", body: "b" });
  message.tokens.push("b");
  assert.deepEqual(tokens, ["a"]);
});

test("picks out only the phones whose address is dead", () => {
  const tokens = ["a", "b", "c", "d"];
  const responses = [
    { success: true },
    { success: false, error: { code: "messaging/registration-token-not-registered" } },
    { success: false, error: { code: "messaging/internal-error" } },
    { success: false, error: { code: "messaging/invalid-registration-token" } },
  ];
  assert.deepEqual(deadTokens(tokens, responses), ["b", "d"]);
});

test("finds nothing dead when everything was delivered or the answer is missing", () => {
  assert.deepEqual(deadTokens(["a"], [{ success: true }]), []);
  assert.deepEqual(deadTokens(["a"], undefined), []);
});