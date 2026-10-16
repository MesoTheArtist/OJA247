import test from "node:test";
import assert from "node:assert/strict";
import { normalizeProfileImage } from "../src/services/imageStorage.js";

test("empty means no image", async () => {
  assert.deepEqual(await normalizeProfileImage(""), { value: "" });
  assert.deepEqual(await normalizeProfileImage(undefined), { value: "" });
  assert.deepEqual(await normalizeProfileImage(null), { value: "" });
});

test("normal web addresses are kept", async () => {
  assert.deepEqual(await normalizeProfileImage("https://res.cloudinary.com/x/y.png"), {
    value: "https://res.cloudinary.com/x/y.png",
  });
});

test("rejects scripts, SVG, non-images and junk", async () => {
  for (const bad of [
    "javascript:alert(1)",
    "data:image/svg+xml;base64,PHN2Zz48L3N2Zz4=",
    "data:image/png;base64," + Buffer.from("this is not a picture").toString("base64"),
    "not an image at all",
    { logo: "object" },
    12345,
  ]) {
    const result = await normalizeProfileImage(bad);
    assert.ok(result.error, `should reject ${JSON.stringify(bad)?.slice(0, 40)}`);
  }
});

test("rejects over-long web addresses and oversized uploads", async () => {
  assert.ok((await normalizeProfileImage("https://x.com/" + "a".repeat(2100))).error);
  assert.ok((await normalizeProfileImage("data:image/png;base64," + "A".repeat(6 * 1024 * 1024))).error);
});zzz