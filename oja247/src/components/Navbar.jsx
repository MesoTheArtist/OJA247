import React, { useState } from "react";
import { useNavigate } from "react-router-dom";
import { motion, useScroll, useMotionValueEvent } from "framer-motion";
import { Menu, X, User as UserIcon } from "lucide-react";
import { useAuth } from "../context/AuthContext";
import Logo from "../assets/OJA247 VX1.png";

// Removed "Home" from the array
const Items = ["Vendors", "Products", "About"];

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
  const [hidden, setHidden] = useState(false);
  const { isAuthenticated, isCustomer, business, user, logout } = useAuth();

  const { scrollY } = useScroll();

  useMotionValueEvent(scrollY, "change", (latest) => {
    const previous = scrollY.getPrevious() ?? 0;
    const diff = latest - previous;

    // Ignore tiny jitters (e.g. mobile bounce scroll) and keep the bar
    // pinned near the very top regardless of direction.
    if (latest < 80) {
      setHidden(false);
      return;
    }

    if (Math.abs(diff) < 4) return;

    if (diff > 0) {
      // scrolling down
      setHidden(true);
      setMobileMenuOpen(false); // don't leave the mobile menu open while hiding
    } else {
      // scrolling up
      setHidden(false);
    }
  });

  return (
    <motion.header
      initial={{ y: -100, opacity: 0 }}
      animate={hidden ? { y: -140, opacity: 0 } : { y: 0, opacity: 1 }}
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
                  onClick={() => business?._id && navigate(`/dashboard/${business._id}`)}
                  className="px-6 py-2 bg-green-500 text-white rounded-xl font-semibold shadow-lg hover:bg-green-600 transition"
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
                  onClick={() => business?._id && navigate(`/dashboard/${business._id}`)}
                  className="w-full px-6 py-3 bg-green-500 text-white rounded-xl font-semibold shadow-lg hover:bg-green-600 transition"
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
  );
};

export default Navbar;