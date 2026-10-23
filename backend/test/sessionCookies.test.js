import test from "node:test";
import assert from "node:assert/strict";
import { setUserSessionCookie, setMarketerSessionCookie, isAppRequest } from "../src/middleware/sessionCookies.js";

// Minimal stand-in for an Express response: records headers and carries the
// request (Express exposes it as res.req) so we can check the app-only header.
function fakeRes(requestHeaders = {}) {
  const headers = {};
  return {
    req: { headers: requestHeaders },
    getHeader: (name) => headers[name.toLowerCase()],
    setHeader: (name, value) => {
      headers[name.toLowerCase()] = value;
    },
    headers,
  };
}

test("website login: no session token is exposed in a header", () => {
  const res = fakeRes();
  setUserSessionCookie(res, "jwt-abc");
  assert.equal(res.headers["x-session-token"], undefined);
  assert.ok(String(res.headers["set-cookie"]).includes("oja247_session=jwt-abc"));
});

test("app login: token is also returned in X-Session-Token", () => {
  const res = fakeRes({ "x-client-platform": "flutter" });
  setUserSessionCookie(res, "jwt-abc");
  assert.equal(res.headers["x-session-token"], "jwt-abc");
});

test("app marketer login: token is also returned in X-Session-Token", () => {
  const res = fakeRes({ "x-client-platform": "flutter" });
  setMarketerSessionCookie(res, "jwt-marketer");
  assert.equal(res.headers["x-session-token"], "jwt-marketer");
});

test("an unrecognised client platform value gets no token header", () => {
  const res = fakeRes({ "x-client-platform": "something-else" });
  setUserSessionCookie(res, "jwt-abc");
  assert.equal(res.headers["x-session-token"], undefined);
});

test("isAppRequest recognises the app and ignores everything else", () => {
  assert.equal(isAppRequest({ headers: { "x-client-platform": "flutter" } }), true);
  assert.equal(isAppRequest({ headers: { "x-client-platform": "Capacitor" } }), true);
  assert.equal(isAppRequest({ headers: {} }), false);
  assert.equal(isAppRequest(undefined), false);
});