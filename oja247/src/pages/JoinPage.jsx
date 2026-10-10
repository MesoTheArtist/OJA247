import React from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { motion } from "framer-motion";
import { Store, Megaphone, ArrowRight, ShoppingBag } from "lucide-react";

// Landing spot for anyone who isn't sure which door to walk through. Only
// two real choices here — a business owner already has their own clearly
// labeled "Register Your Business" button elsewhere, so this page covers
// everyone else: shoppers and marketers. The quiet link at the bottom
// catches anyone who lands here by mistake wanting the business form.
const OPTIONS = [
  {
    id: "customer",
    icon: ShoppingBag,
    title: "Shop as a customer",
    description: "Browse vendors and buy — no account needed to start, and you can check out as a guest.",
    cta: "Start shopping",
    path: "/explore",
    accent: "from-green-500 to-emerald-500",
  },
  {
    id: "marketer",
    icon: Megaphone,
    title: "Become a marketer",
    description: "Share your referral link with businesses and get paid in cash every time one subscribes.",
    cta: "Register as a marketer",
    path: "/register-marketer",
    accent: "from-orange-500 to-amber-500",
  },
];

const JoinPage = () => {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  // Defensive carry-through — nothing currently links here with a ref code
  // (referral links go straight to /business-form), but if one ever does,
  // it isn't lost.
  const ref = searchParams.get("ref");
  const withRef = (path) => (ref ? `${path}?ref=${encodeURIComponent(ref)}` : path);

  return (
    <div className="min-h-screen bg-gradient-to-br from-white via-gray-50 to-white px-4 sm:px-6 pt-28 pb-16">
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="max-w-3xl mx-auto text-center"
      >
        <h1 className="text-3xl sm:text-4xl font-black text-gray-900 mb-3">Join OJA247</h1>
        <p className="text-gray-600 mb-10 max-w-md mx-auto">What brings you here?</p>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
          {OPTIONS.map((opt) => {
            const Icon = opt.icon;
            return (
              <motion.button
                key={opt.id}
                whileHover={{ scale: 1.02, y: -3 }}
                whileTap={{ scale: 0.98 }}
                onClick={() => navigate(withRef(opt.path))}
                className="text-left bg-white border border-gray-100 rounded-2xl p-6 shadow-sm hover:shadow-xl transition-shadow"
              >
                <div className={`w-12 h-12 rounded-xl bg-gradient-to-br ${opt.accent} flex items-center justify-center mb-4`}>
                  <Icon className="text-white" size={22} />
                </div>
                <h2 className="text-lg font-bold text-gray-900 mb-1.5">{opt.title}</h2>
                <p className="text-sm text-gray-500 mb-5">{opt.description}</p>
                <span className="inline-flex items-center gap-1.5 text-sm font-semibold text-green-700">
                  {opt.cta} <ArrowRight size={15} />
                </span>
              </motion.button>
            );
          })}
        </div>

        <button
          onClick={() => navigate(withRef("/business-form"))}
          className="mt-7 py-3 inline-flex items-center gap-1.5 text-sm text-gray-400 hover:text-gray-600 transition"
        >
          <Store size={14} /> Actually, I want to register a business
        </button>
      </motion.div>
    </div>
  );
};

export default JoinPage;