import React, { useState, useEffect, useRef } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import { motion, AnimatePresence, useScroll, useMotionValueEvent } from "framer-motion";
import { Menu, X, User as UserIcon, ChevronDown } from "lucide-react";
import { useAuth } from "../context/AuthContext";
import Logo from "../assets/OJA247 VX1.png";

// Removed "Home" from the array
const Items = ["Vendors", "Products", "About"];

// Pages built around a form: the bar stays out of the way while typing and
// needs a longer, deliberate scroll up before it comes back.
const FORM_ROUTES =
  /^\/(login|business-form|register-marketer|marketer-login|forgot-password|marketer-forgot-password|customer-forgot-password|reset-password|account|checkout|report-problem)(\/|$)/;

// Dashboards have their own navigation, so the site bar only shows at the very
// top of those pages and never pops back over their content.
const OWN_NAV_ROUTES = /^\/(admin|dashboard\/)/;

// Fields you type into (not buttons, checkboxes, etc).
const isTypingTarget = (el) => {
  if (!el) return false;
  if (el.isContentEditable) return true;
  if (el.tagName === "TEXTAREA" || el.tagName === "SELECT") return true;
  if (el.tagName === "INPUT") {
    return !["button", "submit", "reset", "checkbox", "radio", "range", "file", "color", "image"].includes(el.type);
  }
  return false;
};

// Any open popup/dialog/full-screen overlay (the site's modals lock page
// scroll or use role="dialog" / a fixed full-screen layer).
const MODAL_SELECTOR = '[role="dialog"], [aria-modal="true"], .fixed.inset-0:not(.pointer-events-none)';

const routeFor = (item) => {
  switch (item) {
    case "Vendors":
      return "/explore";
    case "Products":
      return "/products";
    case "About":
      return "/about";
    default:
      return "/";
  }
};

const Navbar = () => {
  const navigate = useNavigate();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const { pathname } = useLocation();
  const [hidden, setHidden] = useState(false);
  const [typing, setTyping] = useState(false); // a form field has focus
  // Tucked away automatically on arrival at a form page or dashboard, so the
  // user doesn't have to tap the page first. A small tab brings it back.
  const [collapsed, setCollapsed] = useState(() => FORM_ROUTES.test(pathname) || OWN_NAV_ROUTES.test(pathname));
  const [modalOpen, setModalOpen] = useState(false); // a popup is covering the page
  const upDistance = useRef(0); // how far the user has scrolled up since last going down
  const mobileMenuOpenRef = useRef(false);
  const { isAuthenticated, isCustomer, business, user, loading, logout } = useAuth();

  // The signed-in flag turns on straight from the saved session, but the
  // business details arrive a moment later from the server (and admin accounts
  // have no business at all). The button used to do nothing in that gap, which
  // looked like it was randomly unresponsive. Now it waits for the details,
  // and sends admins to the admin page.
  const goToDashboard = () => {
    setMobileMenuOpen(false);
    if (loading) return;
    if (business?._id) navigate(`/dashboard/${business._id}`);
    else if (user?.role === "admin") navigate("/admin");
  };

  const { scrollY } = useScroll();

  useEffect(() => {
    mobileMenuOpenRef.current = mobileMenuOpen;
  }, [mobileMenuOpen]);

  // New page: start fresh (bar visible, nothing focused, menu closed). Done
  // while rendering, React's recommended way to reset state when a value
  // (here the route) changes.
  const [lastPath, setLastPath] = useState(pathname);
  if (lastPath !== pathname) {
    setLastPath(pathname);
    setHidden(false);
    setTyping(false);
    setMobileMenuOpen(false);
    // Collapse straight away on form pages and dashboards (no tap needed).
    setCollapsed(FORM_ROUTES.test(pathname) || OWN_NAV_ROUTES.test(pathname));
  }

  useMotionValueEvent(scrollY, "change", (latest) => {
    const previous = scrollY.getPrevious() ?? 0;
    const diff = latest - previous;

    // Keep the bar pinned near the very top regardless of direction.
    if (latest < 80) {
      setHidden(false);
      upDistance.current = 0;
      return;
    }

    // Dashboards have their own navigation: never pop back over them.
    if (OWN_NAV_ROUTES.test(pathname)) {
      setHidden(true);
      setMobileMenuOpen(false);
      return;
    }

    // Ignore tiny jitters (e.g. mobile bounce scroll, or the keyboard nudging
    // the page).
    if (Math.abs(diff) < 4) return;

    if (diff > 0) {
      // scrolling down
      upDistance.current = 0;
      setHidden(true);
      setMobileMenuOpen(false); // don't leave the mobile menu open while hiding
    } else {
      // scrolling up: only come back after a deliberate scroll, not a nudge
      upDistance.current += -diff;
      const needed = FORM_ROUTES.test(pathname) ? 60 : 24;
      if (upDistance.current >= needed) {
        setHidden(false);
        setCollapsed(false);
      }
    }
  });

  // Get out of the way while the user is typing in a form field.
  useEffect(() => {
    let blurTimer;
    const onFocusIn = (event) => {
      clearTimeout(blurTimer);
      if (!isTypingTarget(event.target)) return;
      setTyping(true);
      setHidden(true);
      setMobileMenuOpen(false);
      upDistance.current = 0;
    };
    const onFocusOut = () => {
      clearTimeout(blurTimer);
      // Wait a beat: focus often just moves to the next field.
      blurTimer = setTimeout(() => {
        if (isTypingTarget(document.activeElement)) return;
        setTyping(false);
        if (window.scrollY < 80) setHidden(false);
      }, 150);
    };
    document.addEventListener("focusin", onFocusIn);
    document.addEventListener("focusout", onFocusOut);
    return () => {
      clearTimeout(blurTimer);
      document.removeEventListener("focusin", onFocusIn);
      document.removeEventListener("focusout", onFocusOut);
    };
  }, []);

  // Get out of the way while a popup/dialog is open.
  useEffect(() => {
    let frame = 0;
    const check = () => {
      frame = 0;
      const locked = document.body.style.overflow === "hidden" && !mobileMenuOpenRef.current;
      setModalOpen(locked || Boolean(document.querySelector(MODAL_SELECTOR)));
    };
    const schedule = () => {
      if (!frame) frame = requestAnimationFrame(check);
    };
    check();
    const observer = new MutationObserver(schedule);
    observer.observe(document.body, { childList: true, subtree: true, attributes: true, attributeFilter: ["style", "class"] });
    return () => {
      observer.disconnect();
      if (frame) cancelAnimationFrame(frame);
    };
  }, [pathname]);

  const shouldHide = hidden || typing || modalOpen || collapsed;
  // The "show menu" tab is for when the bar is tucked away, not while a popup is up.
  const showHandle = shouldHide && !modalOpen && (collapsed || typing);

  const revealBar = () => {
    setCollapsed(false);
    setHidden(false);
    setTyping(false);
    if (document.activeElement && isTypingTarget(document.activeElement)) document.activeElement.blur();
  };

  return (
    <>
      <AnimatePresence>
        {showHandle && (
          <motion.button
            key="show-menu"
            type="button"
            onClick={revealBar}
            aria-label="Show menu"
            initial={{ y: -40, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: -40, opacity: 0 }}
            transition={{ type: "spring", stiffness: 300, damping: 30 }}
            className="fixed top-2 left-1/2 -translate-x-1/2 z-50 flex items-center gap-1 px-4 py-1.5 rounded-full bg-white/80 backdrop-blur-xl border border-gray-200/60 shadow-lg text-xs font-semibold text-gray-600 hover:text-gray-900"
          >
            Menu <ChevronDown size={14} />
          </motion.button>
        )}
      </AnimatePresence>
    <motion.header
      initial={{ y: -100, opacity: 0 }}
      animate={shouldHide ? { y: -140, opacity: 0 } : { y: 0, opacity: 1 }}
      transition={{ type: "spring", stiffness: 300, damping: 30 }}
      className="fixed top-4 left-1/2 -translate-x-1/2 z-50 w-[95%] max-w-6xl pointer-events-none"
    >
      <div className="pointer-events-auto">
        <div className="backdrop-blur-xl bg-white/70 border border-gray-200/50 rounded-3xl shadow-2xl px-6 py-4">
          <div className="flex items-center justify-between">
            {/* Logo linked to Home */}
            <motion.div
              whileHover={{ scale: 1.05, rotate: 5 }}
              whileTap={{ scale: 0.95 }}
              onClick={() => navigate("/")}
              className="cursor-pointer"
            >
              <img src={Logo} alt="OJA247" className="w-[78px] object-contain" />
            </motion.div>

            {/* Desktop  */}
            <div className="hidden md:flex items-center gap-2">
              {Items.map((item, i) => (
                <motion.button
                  key={item}
                  initial={{ opacity: 0, y: -20 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: i * 0.1 }}
                  whileHover={{ scale: 1.1, y: -2 }}
                  onClick={() => navigate(routeFor(item))}
                  className="px-6 py-2.5 text-gray-700 font-medium hover:text-gray-900 transition relative group"
                >
                  {item}
                  <motion.div className="absolute bottom-0 left-0 right-0 h-0.5 bg-gradient-to-r from-green-500 to-yellow-500 opacity-0 group-hover:opacity-100 transition-opacity" />
                </motion.button>
              ))}

              {/* Vendor/admin session and customer session are mutually
                  exclusive (one token per browser — see AuthContext's
                  authRole comment), so this only ever shows one of the
                  three states below, never a mix. */}
              {isAuthenticated && !isCustomer ? (
                <motion.button
                  whileHover={{ scale: 1.1 }}
                  onClick={goToDashboard}
                  disabled={loading}
                  className="px-6 py-2 bg-green-500 text-white rounded-xl font-semibold shadow-lg hover:bg-green-600 transition disabled:opacity-60"
                >
                  My Dashboard
                </motion.button>
              ) : isAuthenticated && isCustomer ? (
                <div className="flex items-center gap-3">
                  <button
                    onClick={() => navigate("/orders")}
                    className="text-sm text-gray-700 hover:text-green-600 font-semibold transition"
                  >
                    Hi, {user?.fullName?.split(" ")[0] || "there"}
                  </button>
                  <button
                    onClick={logout}
                    className="text-sm text-gray-500 hover:text-gray-700 font-medium transition"
                  >
                    Log out
                  </button>
                </div>
              ) : (
                <div className="flex items-center gap-2">
                  <motion.button
                    whileHover={{ scale: 1.1 }}
                    onClick={() => navigate("/login")}
                    className="px-6 py-2 bg-green-600 text-white rounded-xl font-semibold shadow-lg hover:bg-green-700 transition"
                  >
                    Login
                  </motion.button>
                  {/* Separate, smaller entry point for buyers — distinct
                      from the vendor Login button above, which is
                      specifically the vendor/admin login. */}
                  <motion.button
                    whileHover={{ scale: 1.1 }}
                    onClick={() => navigate("/account")}
                    title="Sign in to your account"
                    className="p-2.5 text-gray-500 hover:text-gray-800 hover:bg-gray-100 rounded-xl transition"
                  >
                    <UserIcon size={20} />
                  </motion.button>
                </div>
              )}
            </div>

            {/* Mobile Menu Button */}
            <motion.button
              whileHover={{ scale: 1.1 }}
              whileTap={{ scale: 0.9 }}
              onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
              aria-label={mobileMenuOpen ? "Close menu" : "Open menu"}
              className="md:hidden p-2.5 text-gray-900 backdrop-blur-md bg-gray-100/70 rounded-xl"
            >
              {mobileMenuOpen ? <X size={24} /> : <Menu size={24} />}
            </motion.button>
          </div>
        </div>

        {/* Mobile Menu */}
        {mobileMenuOpen && (
          <motion.div
            initial={{ opacity: 0, y: -20, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            className="mt-4 backdrop-blur-xl bg-white/70 border border-gray-200/50 rounded-3xl shadow-2xl overflow-hidden"
          >
            {Items.map((item, i) => (
              <motion.button
                key={item}
                initial={{ opacity: 0, x: -20 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: i * 0.1 }}
                className="block w-full text-left px-8 py-4 text-gray-700 font-medium hover:bg-green-50 transition"
                onClick={() => {
                  setMobileMenuOpen(false);
                  navigate(routeFor(item));
                }}
              >
                {item}
              </motion.button>
            ))}

            <div className="p-4 border-t border-gray-200 bg-white/80 space-y-2">
              {isAuthenticated && !isCustomer ? (
                <button
                  onClick={goToDashboard}
                  disabled={loading}
                  className="w-full px-6 py-3 bg-green-500 text-white rounded-xl font-semibold shadow-lg hover:bg-green-600 transition disabled:opacity-60"
                >
                  My Dashboard
                </button>
              ) : isAuthenticated && isCustomer ? (
                <div className="flex items-center justify-between px-2">
                  <button
                    onClick={() => { navigate("/orders"); setMobileMenuOpen(false); }}
                    className="text-sm text-gray-700 hover:text-green-600 font-semibold"
                  >
                    Hi, {user?.fullName?.split(" ")[0] || "there"}
                  </button>
                  <button onClick={() => { logout(); setMobileMenuOpen(false); }} className="text-sm text-gray-500 hover:text-gray-700 font-medium">
                    Log out
                  </button>
                </div>
              ) : (
                <>
                  <button
                    onClick={() => navigate("/login")}
                    className="w-full px-6 py-3 bg-green-600 text-white rounded-xl font-semibold shadow-lg hover:bg-green-700 transition"
                  >
                    Login
                  </button>
                  <button
                    onClick={() => navigate("/account")}
                    className="w-full flex items-center justify-center gap-2 px-6 py-3 text-gray-600 border border-gray-200 rounded-xl font-medium hover:bg-gray-50 transition"
                  >
                    <UserIcon size={18} /> Sign in to your account
                  </button>
                </>
              )}
            </div>
          </motion.div>
        )}
      </div>
    </motion.header>
    </>
  );
};

export default Navbar;