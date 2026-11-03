import React, { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { adsConfigured, getAdConsent, setAdConsent } from "../utils/ads";

const STORAGE_KEY = "oja247_cookie_notice_seen";

// A small notice saying what the site stores and where to read more.
//
// When ads are switched on (VITE_ADSENSE_CLIENT is set) everyone sees ads; the
// visitor only chooses whether they are personalized ("Accept") or limited to
// non-personalized ("Limit personalization"). Until they choose, ads are
// non-personalized. Visitors who saw the old notice are asked once more because
// the choice is new. If ads are not configured it behaves exactly as before:
// one button that dismisses the notice.
const CookieNotice = () => {
  const adsOn = adsConfigured();
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    try {
      if (adsOn) setVisible(getAdConsent() === null);
      else setVisible(!localStorage.getItem(STORAGE_KEY));
    } catch {
      setVisible(true);
    }
  }, [adsOn]);

  if (!visible) return null;

  const dismiss = () => {
    try {
      localStorage.setItem(STORAGE_KEY, "1");
    } catch {
      /* storage blocked: it will just show again next time */
    }
    setVisible(false);
  };

  const choose = (value) => {
    setAdConsent(value);
    dismiss();
  };

  return (
    <div
      role="region"
      aria-label="Cookie notice"
      className="fixed bottom-0 inset-x-0 z-[90] p-3 sm:p-4"
    >
      <div className="mx-auto max-w-3xl rounded-2xl border border-gray-200 bg-white p-4 shadow-xl sm:flex sm:items-center sm:gap-4">
        <p className="text-sm text-gray-700 leading-relaxed">
          {adsOn ? (
            <>
              OJA247 shows ads from Google, and we use cookies the site needs to work, such as keeping you
              signed in and remembering your cart. Google and its partners use cookies to show and measure
              ads. Accept to see personalized ads, or limit personalization to see ads that aren't based on
              your browsing.{" "}
            </>
          ) : (
            <>
              We use cookies and similar storage that the site needs to work, such as keeping you signed
              in and remembering your cart. We don't use advertising or tracking cookies.{" "}
            </>
          )}
          <Link to="/privacy" className="font-semibold text-green-700 underline">
            Read more
          </Link>
        </p>
        {adsOn ? (
          <div className="mt-3 flex shrink-0 gap-2 sm:mt-0">
            <button
              type="button"
              onClick={() => choose("denied")}
              className="min-h-11 flex-1 rounded-lg border border-gray-300 px-4 py-2.5 text-sm font-semibold text-gray-700 hover:bg-gray-50 sm:flex-none"
            >
              Limit personalization
            </button>
            <button
              type="button"
              onClick={() => choose("granted")}
              className="min-h-11 flex-1 rounded-lg bg-green-600 px-5 py-2.5 text-sm font-semibold text-white hover:bg-green-700 sm:flex-none"
            >
              Accept
            </button>
          </div>
        ) : (
          <button
            type="button"
            onClick={dismiss}
            className="mt-3 w-full shrink-0 min-h-11 rounded-lg bg-green-600 px-5 py-2.5 text-sm font-semibold text-white hover:bg-green-700 sm:mt-0 sm:w-auto"
          >
            Got it
          </button>
        )}
      </div>
    </div>
  );
};

export default CookieNotice;
