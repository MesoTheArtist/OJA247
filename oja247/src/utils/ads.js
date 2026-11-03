// Google AdSense helpers.
//
import { getPublicSettings } from "../services/api";

// Ads show for every visitor once VITE_ADSENSE_CLIENT is set and the admin
// master switch (Admin > Overview) is on
// (e.g. "ca-pub-1234567890123456"). The cookie notice only controls
// personalization: "granted" = personalized ads, anything else (including no
// choice yet) = non-personalized ads.

const CONSENT_KEY = "oja247_ad_consent"; // "granted" (personalized) | "denied" (limited)
const CONSENT_EVENT = "oja247:ad-consent";

export const ADSENSE_CLIENT = import.meta.env.VITE_ADSENSE_CLIENT || "";
export const adsConfigured = () => Boolean(ADSENSE_CLIENT);

export const getAdConsent = () => {
  try {
    return localStorage.getItem(CONSENT_KEY); // null = not chosen yet
  } catch {
    return null;
  }
};

export const setAdConsent = (value) => {
  try {
    localStorage.setItem(CONSENT_KEY, value);
  } catch {
    /* storage blocked: choice applies for this page view only */
  }
  window.dispatchEvent(new CustomEvent(CONSENT_EVENT, { detail: value }));
};

export const onAdConsentChange = (cb) => {
  const handler = (e) => cb(e.detail);
  window.addEventListener(CONSENT_EVENT, handler);
  return () => window.removeEventListener(CONSENT_EVENT, handler);
};

// Tells AdSense whether to serve non-personalized ads. Called before the script
// loads and before every ad request, so a changed choice applies to new ads.
export const applyPersonalization = () => {
  const queue = (window.adsbygoogle = window.adsbygoogle || []);
  queue.requestNonPersonalizedAds = getAdConsent() === "granted" ? 0 : 1;
};

let scriptPromise = null;

// Loads adsbygoogle.js once, on demand.
export const loadAdSense = () => {
  if (!adsConfigured()) return Promise.resolve(false);
  if (scriptPromise) return scriptPromise;

  applyPersonalization();
  scriptPromise = new Promise((resolve) => {
    const s = document.createElement("script");
    s.async = true;
    s.crossOrigin = "anonymous";
    s.src = `https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=${ADSENSE_CLIENT}`;
    s.onload = () => resolve(true);
    s.onerror = () => {
      scriptPromise = null; // allow a retry later (e.g. ad blocker, offline)
      resolve(false);
    };
    document.head.appendChild(s);
  });
  return scriptPromise;
};

// Ad unit IDs, created in AdSense (Ads > By ad unit) and set as env vars.
// A placement with no ID simply shows nothing.
export const AD_SLOTS = {
  home: import.meta.env.VITE_ADSENSE_SLOT_HOME || "",
  feed: import.meta.env.VITE_ADSENSE_SLOT_FEED || "",
  product: import.meta.env.VITE_ADSENSE_SLOT_PRODUCT || "",
};

let adsSwitchPromise = null;

// Reads the admin master switch once per page load. If the request fails the
// answer is "on", so a brief API hiccup does not silently remove ad revenue.
export const fetchAdsEnabled = () => {
  if (!adsSwitchPromise) {
    adsSwitchPromise = getPublicSettings()
      .then((res) => res.data?.adsEnabled !== false)
      .catch(() => true);
  }
  return adsSwitchPromise;
};
