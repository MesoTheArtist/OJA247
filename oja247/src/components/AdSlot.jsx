import React, { useEffect, useRef, useState } from "react";
import {
  ADSENSE_CLIENT,
  adsConfigured,
  applyPersonalization,
  fetchAdsEnabled,
  loadAdSense,
} from "../utils/ads";

// One Google ad unit.
//
// Props:
//   slot    - the ad unit ID from AdSense (Ads > By ad unit), required
//   format  - "auto" (responsive, default) or "fluid" for in-feed units
//   layoutKey - only for in-feed units (the data-ad-layout-key AdSense gives you)
//   className - wrapper classes, e.g. "col-span-full" inside a grid
//
// Renders nothing unless AdSense is configured, a slot ID was passed and the
// admin master switch is on, so it is safe to drop in anywhere. Everyone sees ads; the cookie notice only decides
// whether they are personalized.
const AdSlot = ({ slot, format = "auto", layoutKey, className = "" }) => {
  const pushed = useRef(false);
  const insRef = useRef(null);

  // null while the admin master switch is still being read, so nothing flashes.
  const [switchOn, setSwitchOn] = useState(null);

  useEffect(() => {
    if (!adsConfigured() || !slot) return;
    let cancelled = false;
    fetchAdsEnabled().then((on) => {
      if (!cancelled) setSwitchOn(on);
    });
    return () => {
      cancelled = true;
    };
  }, [slot]);

  const enabled = adsConfigured() && Boolean(slot) && switchOn === true;

  useEffect(() => {
    if (!enabled || pushed.current) return;
    let cancelled = false;
    loadAdSense().then((ok) => {
      if (!ok || cancelled || pushed.current || !insRef.current) return;
      try {
        applyPersonalization();
        window.adsbygoogle.push({});
        pushed.current = true;
      } catch {
        /* AdSense rejects duplicate pushes; nothing to do */
      }
    });
    return () => {
      cancelled = true;
    };
  }, [enabled]);

  if (!enabled) return null;

  return (
    <aside
      aria-label="Advertisement"
      className={`my-6 overflow-hidden rounded-2xl border border-gray-100 bg-white/60 p-2 text-center ${className}`}
    >
      <p className="mb-1 text-[10px] font-semibold uppercase tracking-widest text-gray-400">
        Advertisement
      </p>
      <ins
        ref={insRef}
        className="adsbygoogle"
        style={{ display: "block", minHeight: 100 }}
        data-ad-client={ADSENSE_CLIENT}
        data-ad-slot={slot}
        data-ad-format={format}
        {...(layoutKey ? { "data-ad-layout-key": layoutKey } : {})}
        data-full-width-responsive="true"
      />
    </aside>
  );
};

export default AdSlot;
