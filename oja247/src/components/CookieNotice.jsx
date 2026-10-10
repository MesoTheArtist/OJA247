import React, { useEffect, useState } from "react";
import { Link } from "react-router-dom";

const STORAGE_KEY = "oja247_cookie_notice_seen";

// A small notice, shown once per browser, saying what the site stores and
// where to read more. It only describes storage the site needs to work (login,
// cart, and remembering this notice), so there is nothing to opt out of: the
// button just dismisses it. If browser storage is blocked it still works, it
// simply shows again on the next visit.
const CookieNotice = () => {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    try {
      if (!localStorage.getItem(STORAGE_KEY)) setVisible(true);
    } catch {
      setVisible(true);
    }
  }, []);

  if (!visible) return null;

  const dismiss = () => {
    try {
      localStorage.setItem(STORAGE_KEY, "1");
    } catch {
      /* storage blocked: it will just show again next time */
    }
    setVisible(false);
  };

  return (
    <div
      role="region"
      aria-label="Cookie notice"
      className="fixed bottom-0 inset-x-0 z-[90] p-3 sm:p-4"
    >
      <div className="mx-auto max-w-3xl rounded-2xl border border-gray-200 bg-white p-4 shadow-xl sm:flex sm:items-center sm:gap-4">
        <p className="text-sm text-gray-700 leading-relaxed">
          We use cookies and similar storage that the site needs to work, such as keeping you signed in and
          remembering your cart. We don't use advertising or tracking cookies.{" "}
          <Link to="/privacy" className="font-semibold text-green-700 underline">
            Read more
          </Link>
        </p>
        <button
          type="button"
          onClick={dismiss}
          className="mt-3 w-full shrink-0 min-h-11 rounded-lg bg-green-600 px-5 py-2.5 text-sm font-semibold text-white hover:bg-green-700 sm:mt-0 sm:w-auto"
        >
          Got it
        </button>
      </div>
    </div>
  );
};

export default CookieNotice;