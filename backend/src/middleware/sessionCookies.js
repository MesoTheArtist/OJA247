import crypto from "crypto";

export const USER_SESSION_COOKIE = "oja247_session";
export const MARKETER_SESSION_COOKIE = "oja247_marketer_session";
const CSRF_COOKIE = "oja247_csrf";
const SESSION_MAX_AGE_SECONDS = 30 * 24 * 60 * 60;

function cookieOptions() {
  const productionDefault = process.env.NODE_ENV === "production" ? "none" : "lax";
  const configuredSameSite = String(process.env.AUTH_COOKIE_SAME_SITE || productionDefault).toLowerCase();
  const sameSite = ["strict", "lax", "none"].includes(configuredSameSite)
    ? configuredSameSite
    : "lax";
  return {
    sameSite,
    secure: process.env.NODE_ENV === "production" || sameSite === "none",
  };
}


// The Android app can't use cookies the way a browser does, so when a request
// comes from the app (it sends "X-Client-Platform: flutter") the freshly issued
// session token is also returned in an X-Session-Token response header. The
// app stores it and sends it back as "Authorization: Bearer ...", which
// protect()/protectMarketer() already accept (and which skips CSRF, since
// there is no cookie to forge). The website never sends that header, so
// nothing changes for browsers. "capacitor" is accepted too, for the earlier
// wrapper-style app.
export const APP_CLIENT_HEADER = "x-client-platform";
const APP_PLATFORMS = new Set(["flutter", "capacitor"]);

export function isAppRequest(req) {
  return APP_PLATFORMS.has(String(req?.headers?.[APP_CLIENT_HEADER] || "").toLowerCase());
}

function exposeTokenToApp(res, token) {
  if (isAppRequest(res.req)) res.setHeader("X-Session-Token", token);
}

function appendSetCookie(res, value) {
  const current = res.getHeader("Set-Cookie");
  res.setHeader("Set-Cookie", current ? [...[].concat(current), value] : value);
}

function setCookie(res, name, value, { httpOnly, maxAge = SESSION_MAX_AGE_SECONDS }) {
  const { sameSite, secure } = cookieOptions();
  appendSetCookie(
    res,
    `${name}=${encodeURIComponent(value)}; Path=/; Max-Age=${maxAge}; SameSite=${sameSite}${httpOnly ? "; HttpOnly" : ""}${secure ? "; Secure" : ""}`
  );
}

export function readCookie(req, name) {
  const cookies = String(req.headers.cookie || "").split(";");
  for (const cookie of cookies) {
    const separator = cookie.indexOf("=");
    if (separator < 0 || cookie.slice(0, separator).trim() !== name) continue;
    try {
      return decodeURIComponent(cookie.slice(separator + 1).trim());
    } catch {
      return null;
    }
  }
  return null;
}

export function setUserSessionCookie(res, token) {
  const csrfToken = crypto.randomBytes(32).toString("base64url");
  setCookie(res, USER_SESSION_COOKIE, token, { httpOnly: true });
  setCookie(res, CSRF_COOKIE, csrfToken, { httpOnly: false });
  res.setHeader("X-CSRF-Token", csrfToken);
  exposeTokenToApp(res, token);
}

export function setMarketerSessionCookie(res, token) {
  const csrfToken = crypto.randomBytes(32).toString("base64url");
  setCookie(res, MARKETER_SESSION_COOKIE, token, { httpOnly: true });
  setCookie(res, CSRF_COOKIE, csrfToken, { httpOnly: false });
  res.setHeader("X-CSRF-Token", csrfToken);
  exposeTokenToApp(res, token);
}

export function clearSessionCookies(res) {
  setCookie(res, USER_SESSION_COOKIE, "", { httpOnly: true, maxAge: 0 });
  setCookie(res, MARKETER_SESSION_COOKIE, "", { httpOnly: true, maxAge: 0 });
  setCookie(res, CSRF_COOKIE, "", { httpOnly: false, maxAge: 0 });
}

export function hasValidCsrfToken(req) {
  if (["GET", "HEAD", "OPTIONS"].includes(req.method)) return true;
  const cookieToken = readCookie(req, CSRF_COOKIE);
  const headerToken = req.headers["x-csrf-token"];
  if (typeof headerToken !== "string" || !cookieToken) return false;

  const cookieBuffer = Buffer.from(cookieToken);
  const headerBuffer = Buffer.from(headerToken);
  return cookieBuffer.length === headerBuffer.length && crypto.timingSafeEqual(cookieBuffer, headerBuffer);
}

export function addCsrfResponseHeader(req, res, next) {
  const token = readCookie(req, CSRF_COOKIE);
  if (token) res.setHeader("X-CSRF-Token", token);
  next();
}