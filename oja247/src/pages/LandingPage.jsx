import React, { useState, useEffect, useMemo, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { motion, useScroll, useTransform, useMotionValue } from "framer-motion";
import {
  Rocket,
  Store,
  Bike,
  Package,
  Search,
  TrendingUp,
  MapPin,
  Megaphone,
  Share2,
  Wallet,
  ArrowRight,
  ShieldCheck,
  CheckCircle2,
  Zap,
  Crown,
  Sparkles,
} from "lucide-react";
import { getAllBusinesses, getAllProducts } from "../services/api";
import axiosInstance from "../services/api";

// Reusable "premium" card wrapper — mouse-tracking 3D tilt with a shine
// that follows the cursor, plus a blur-to-focus staggered entrance. Its
// own component because useMotionValue/useTransform can't be called
// inside the .map() loops that render each card grid.
function TiltCard({ children, className, onClick, index = 0 }) {
  const cardRef = useRef(null);
  const mouseX = useMotionValue(0.5);
  const mouseY = useMotionValue(0.5);
  const rotateX = useTransform(mouseY, [0, 1], [7, -7]);
  const rotateY = useTransform(mouseX, [0, 1], [-7, 7]);
  const shineBackground = useTransform([mouseX, mouseY], ([mx, my]) =>
    `radial-gradient(circle at ${mx * 100}% ${my * 100}%, rgba(255,255,255,0.5), transparent 60%)`
  );

  const handleMouseMove = (e) => {
    const rect = cardRef.current?.getBoundingClientRect();
    if (!rect) return;
    mouseX.set((e.clientX - rect.left) / rect.width);
    mouseY.set((e.clientY - rect.top) / rect.height);
  };
  const handleMouseLeave = () => {
    mouseX.set(0.5);
    mouseY.set(0.5);
  };

  return (
    <motion.div
      ref={cardRef}
      onMouseMove={handleMouseMove}
      onMouseLeave={handleMouseLeave}
      onClick={onClick}
      initial={{ opacity: 0, y: 40, scale: 0.92, filter: "blur(6px)" }}
      whileInView={{ opacity: 1, y: 0, scale: 1, filter: "blur(0px)" }}
      viewport={{ once: true, margin: "-60px" }}
      transition={{ delay: index * 0.08, duration: 0.55, type: "spring", bounce: 0.25 }}
      whileHover={{ scale: 1.035 }}
      style={{ rotateX, rotateY, transformPerspective: 800 }}
      className={className}
    >
      {/* Cursor-following shine — sits above the card content, below nothing */}
      <motion.div
        className="pointer-events-none absolute inset-0 rounded-3xl opacity-0 group-hover:opacity-100 transition-opacity duration-300 z-20"
        style={{ background: shineBackground }}
      />
      {children}
    </motion.div>
  );
}

// Wraps a "Why vendors pick" card with real scroll-tied parallax — each
// card drifts at a slightly different depth as the section scrolls past,
// on top of the existing fade/scale-in. Split into two nested motion.divs
// because the outer's `y` is a pure scroll-bound MotionValue (via style)
// and the inner's `y` comes from whileHover — mixing both on one element
// would fight over the same transform.
function ScrollParallaxCard({ children, className, index = 0 }) {
  const ref = useRef(null);
  const { scrollYProgress } = useScroll({ target: ref, offset: ["start end", "end start"] });
  const depth = 30 + (index % 3) * 16;
  const parallaxY = useTransform(scrollYProgress, [0, 1], [depth, -depth]);

  return (
    <motion.div ref={ref} style={{ y: parallaxY }}>
      <motion.div
        initial={{ opacity: 0, scale: 0.85, rotate: index % 2 === 0 ? -3 : 3 }}
        whileInView={{ opacity: 1, scale: 1, rotate: 0 }}
        viewport={{ once: true, margin: "-60px" }}
        transition={{ delay: (index % 3) * 0.08, type: "spring", stiffness: 200, damping: 18 }}
        whileHover={{ y: -8, scale: 1.03 }}
        className={className}
      >
        {children}
      </motion.div>
    </motion.div>
  );
}

const LandingPage = () => {
  const navigate = useNavigate();
  const stepsRef = useRef(null);
  const { scrollYProgress: stepsProgress } = useScroll({
    target: stepsRef,
    offset: ["start 0.75", "end 0.35"],
  });
  const timelineHeight = useTransform(stepsProgress, [0, 1], ["0%", "100%"]);
  const [mousePosition, setMousePosition] = useState({ x: 0, y: 0 });
  const [businesses, setBusinesses] = useState([]);
  const [featuredProducts, setFeaturedProducts] = useState([]);
  const [searchQuery, setSearchQuery] = useState("");
  const [stats, setStats] = useState({
    businesses: 0,
    products: 0,
    categories: 0,
  });

  // Generate particle positions/timings once — previously these called
  // Math.random() directly in JSX, so ANY re-render (e.g. our new scroll-
  // linked step state updating) regenerated all 20 particles' positions,
  // causing them to visibly jump/reset. Memoizing with an empty dep array
  // fixes the jitter without changing the look.
  const particles = useMemo(
    () =>
      [...Array(20)].map(() => ({
        startX: Math.random() * (typeof window !== "undefined" ? window.innerWidth : 1200),
        startY: Math.random() * (typeof window !== "undefined" ? window.innerHeight : 800),
        driftY1: Math.random() * -500,
        driftY2: Math.random() * 500,
        driftX: Math.random() * 100 - 50,
        duration: Math.random() * 10 + 10,
      })),
    []
  );

  const { scrollY } = useScroll();
  // Fade only the heading/badge as the user scrolls — spread over a longer
  // distance, and never fully vanish, so it doesn't visibly shift the layout
  // out from under someone who's scrolling and then trying to type.
  const opacity = useTransform(scrollY, [0, 450], [1, 0.4]);
  const scale = useTransform(scrollY, [0, 450], [1, 0.94]);

  // "How it works" step cards and "Why vendors pick OJA247" cards — plain
  // data now. These used to drive a pinned/scroll-jacked sliding section;
  // simplified to regular whileInView reveals, same card styling kept.
  const storySteps = [
    {
      icon: Store,
      color: "from-green-500 to-emerald-500",
      title: "Your own storefront",
      body: "Every vendor gets a branded storefront with a shareable link — bring the customers you already have, no cold discovery needed.",
    },
    {
      icon: ShieldCheck,
      color: "from-yellow-400 to-orange-400",
      title: "Buyers always land on your storefront",
      body: "Browsing and search work across the whole marketplace, but every purchase — and our third-party disclaimer — happens on your storefront, where your branding and trust signals are visible.",
    },
    {
      icon: Share2,
      color: "from-orange-400 to-orange-600",
      title: "Live referral tracking",
      body: "Watch referrals move from signed-up to subscription-pending to paid, in real time — for both vendors and marketers.",
    },
    {
      icon: Wallet,
      color: "from-green-500 to-yellow-400",
      title: "Instant payouts",
      body: "Paystack splits your share automatically on every order — no holding period, no manual settlement.",
    },
  ];

  const hScrollCards = [
    {
      icon: Rocket,
      color: "from-green-500 to-emerald-500",
      title: "List in minutes",
      body: "Sign up, add your products, and you're live — no waiting on approval to start selling.",
    },
    {
      icon: TrendingUp,
      color: "from-yellow-400 to-orange-400",
      title: "Grow with insight",
      body: "See views, conversion, and your top products so you know what's actually working.",
    },
    {
      icon: Megaphone,
      color: "from-orange-400 to-orange-600",
      title: "Marketer network",
      body: "A built-in referral network of marketers can bring you new vendors and customers.",
    },
    {
      icon: MapPin,
      color: "from-green-500 to-yellow-400",
      title: "Built for Nigeria",
      body: "Paystack payouts, WhatsApp order alerts, and pricing that fits how Nigerian vendors actually sell.",
    },
    {
      icon: ShieldCheck,
      color: "from-emerald-500 to-green-600",
      title: "Verified trust badges",
      body: "CAC and ID verification earn vendors a visible badge, so buyers know who they're really buying from.",
    },
  ];

  useEffect(() => {
    const handleMouseMove = (e) => {
      setMousePosition({ x: e.clientX, y: e.clientY });
    };
    window.addEventListener("mousemove", handleMouseMove);
    return () => window.removeEventListener("mousemove", handleMouseMove);
  }, []);

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    try {
      const [businessRes, allProductsRes, featuredRes] = await Promise.all([
        getAllBusinesses(),
        getAllProducts(),
        axiosInstance.get("/api/products/featured"),
      ]);

      setBusinesses(businessRes.data.slice(0, 8));
      setFeaturedProducts(featuredRes.data.slice(0, 8));

      const categories = new Set(businessRes.data.map((b) => b.category));
      setStats({
        businesses: businessRes.data.length,
        products: allProductsRes.data.length,
        categories: categories.size,
      });
    } catch (error) {
      console.error("Error fetching data:", error);
    }
  };

  const handleSearch = (e) => {
    e.preventDefault();
    if (searchQuery.trim()) {
      navigate(`/explore?search=${searchQuery}`);
    }
  };

  const categories = [
    { name: "Food", icon: "🍔", color: "from-orange-400 to-red-500" },
    { name: "Fashion", icon: "👗", color: "from-pink-400 to-purple-500" },
    { name: "Tech", icon: "💻", color: "from-blue-400 to-indigo-500" },
    { name: "Beauty", icon: "💄", color: "from-purple-400 to-pink-500" },
    { name: "Fitness", icon: "💪", color: "from-green-400 to-teal-500" },
    { name: "Groceries", icon: "🛒", color: "from-yellow-400 to-orange-500" },
    { name: "Electronics", icon: "📱", color: "from-indigo-400 to-blue-500" },
    { name: "Other", icon: "🏪", color: "from-gray-400 to-gray-600" },
  ];

  const features = [
    {
      icon: Store,
      title: "Local Vendors",
      desc: "Discover amazing local businesses",
    },
    {
      icon: Bike,
      title: "Fast Delivery",
      desc: "Quick riders at your service",
    },
    {
      icon: Package,
      title: "Quality Products",
      desc: "Curated selection of goods",
    },
    { icon: Rocket, title: "24/7 Available", desc: "Shop anytime, anywhere" },
  ];

  return (
    <div className="relative min-h-screen bg-gradient-to-br from-white via-gray-50 to-white overflow-hidden">
      {/* Ambient blended background — spans the full page height (via
          `absolute` inside the page's own relative wrapper, not `fixed`
          to the viewport) so the same green/yellow/orange blend runs
          behind every section. Bumped up from the first pass: bigger
          blobs, higher opacity, more of them spread the length of the
          page, because at 10% opacity it barely registered. Sections
          below must stay transparent/translucent for this to read as one
          continuous background rather than cutting off partway down. */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none z-0">
        <motion.div
          className="absolute w-[30rem] h-[30rem] bg-green-400/25 rounded-full blur-3xl"
          animate={{ x: mousePosition.x / 20, y: mousePosition.y / 20 }}
          transition={{ type: "spring", damping: 30 }}
          style={{ left: "6%", top: "4%" }}
        />
        <motion.div
          className="absolute w-[30rem] h-[30rem] bg-yellow-400/25 rounded-full blur-3xl"
          animate={{ x: -mousePosition.x / 30, y: -mousePosition.y / 30 }}
          transition={{ type: "spring", damping: 30 }}
          style={{ right: "6%", top: "16%" }}
        />
        <motion.div
          className="absolute w-96 h-96 bg-orange-400/20 rounded-full blur-3xl"
          animate={{ x: mousePosition.x / 40, y: -mousePosition.y / 40 }}
          transition={{ type: "spring", damping: 30 }}
          style={{ left: "58%", top: "32%" }}
        />
        {/* Below-the-fold blobs — not mouse-linked (nobody's cursor
            reaches down here before scrolling), so they pulse gently on
            their own to keep the blend feeling alive rather than static
            once you've scrolled past the hero. Alternating warm/cool so
            no single stretch of the page reads as flat white. */}
        <motion.div
          className="absolute w-[26rem] h-[26rem] bg-emerald-400/20 rounded-full blur-3xl"
          animate={{ scale: [1, 1.18, 1], opacity: [0.6, 1, 0.6] }}
          transition={{ duration: 9, repeat: Infinity, ease: "easeInOut" }}
          style={{ left: "2%", top: "48%" }}
        />
        <motion.div
          className="absolute w-[26rem] h-[26rem] bg-orange-400/20 rounded-full blur-3xl"
          animate={{ scale: [1, 1.15, 1], opacity: [0.6, 1, 0.6] }}
          transition={{ duration: 10, repeat: Infinity, ease: "easeInOut", delay: 1.5 }}
          style={{ right: "4%", top: "60%" }}
        />
        <motion.div
          className="absolute w-[24rem] h-[24rem] bg-yellow-300/20 rounded-full blur-3xl"
          animate={{ scale: [1, 1.2, 1], opacity: [0.6, 1, 0.6] }}
          transition={{ duration: 11, repeat: Infinity, ease: "easeInOut", delay: 3 }}
          style={{ left: "12%", top: "74%" }}
        />
        <motion.div
          className="absolute w-[26rem] h-[26rem] bg-green-400/20 rounded-full blur-3xl"
          animate={{ scale: [1, 1.15, 1], opacity: [0.6, 1, 0.6] }}
          transition={{ duration: 9.5, repeat: Infinity, ease: "easeInOut", delay: 0.8 }}
          style={{ right: "10%", top: "84%" }}
        />
        <motion.div
          className="absolute w-96 h-96 bg-orange-300/20 rounded-full blur-3xl"
          animate={{ scale: [1, 1.2, 1], opacity: [0.6, 1, 0.6] }}
          transition={{ duration: 12, repeat: Infinity, ease: "easeInOut", delay: 2.2 }}
          style={{ left: "40%", top: "94%" }}
        />
      </div>

      {/* Floating Particles */}
      {particles.map((p, i) => (
        <motion.div
          key={i}
          className="absolute w-2 h-2 bg-green-400/20 rounded-full z-0"
          initial={{
            x: p.startX,
            y: p.startY,
          }}
          animate={{
            y: [null, p.driftY1, p.driftY2],
            x: [null, p.driftX],
            opacity: [0.1, 0.3, 0.1],
          }}
          transition={{
            duration: p.duration,
            repeat: Infinity,
            ease: "linear",
          }}
        />
      ))}

      {/* Hero Section */}
      <main className="relative z-10 min-h-screen flex flex-col items-center justify-center px-4 sm:px-6 pt-24 sm:pt-32 pb-12 sm:pb-20 text-center">
        {/* Only the badge/heading/subtext fade+scale on scroll now */}
        <motion.div style={{ opacity, scale }} className="relative z-10 w-full">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.2 }}
            className="inline-flex items-center gap-2 px-4 sm:px-6 py-2 sm:py-3 mb-6 sm:mb-8 backdrop-blur-xl bg-white/70 border border-green-200 rounded-full shadow-lg text-xs sm:text-sm"
          >
            <motion.span
              animate={{ rotate: 360 }}
              transition={{ duration: 2, repeat: Infinity, ease: "linear" }}
              className="text-base sm:text-xl"
            >
              🇳🇬
            </motion.span>
            <span className="text-gray-700 font-semibold">
              Proudly Nigerian. Built for Business
            </span>
          </motion.div>

          <motion.h1
            initial={{ opacity: 0, y: 50 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.8, delay: 0.3 }}
            className="text-4xl sm:text-6xl md:text-7xl lg:text-8xl font-black mb-4 sm:mb-6 leading-tight"
          >
            <span className="text-3xl sm:text-5xl md:text-6xl lg:text-8xl text-gray-900">
              Welcome to
            </span>
            <br />
            <motion.span
              initial={{ opacity: 0, scale: 0.5 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ delay: 0.6, type: "spring", stiffness: 200 }}
              className="bg-gradient-to-r from-green-400 via-yellow-400 to-orange-500 bg-clip-text text-transparent inline-block"
            >
              OJA247
            </motion.span>
          </motion.h1>

          <motion.p
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.8, duration: 0.8 }}
            className="text-base sm:text-xl md:text-2xl text-gray-600 mb-6 sm:mb-8 max-w-3xl mx-auto leading-relaxed font-light px-4"
          >
            Support local. Shop small. Grow together.
            <br />
            <span className="text-orange-600 font-semibold">
              Discover {stats.businesses}+ amazing vendors and businesses —
              24/7!
            </span>
          </motion.p>
        </motion.div>

        {/* Search bar + CTAs live OUTSIDE the fading wrapper so they stay
            fully opaque, full-size, and clickable/typeable no matter how
            far the page has scrolled. */}
        <motion.form
          onSubmit={handleSearch}
          initial={{ opacity: 0, y: 30 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 1 }}
          className="relative z-10 max-w-2xl mx-auto mb-6 sm:mb-8 px-4 w-full"
        >
          <div className="relative group">
            <motion.div
              whileHover={{ scale: 1.02 }}
              className="flex items-center backdrop-blur-xl bg-white/80 border-2 border-gray-200/50 rounded-full shadow-xl overflow-hidden group-hover:border-green-400 transition-colors"
            >
              <Search
                className="ml-4 sm:ml-6 text-gray-400 group-hover:text-green-500 transition-colors flex-shrink-0"
                size={20}
              />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search for products, businesses..."
                className="flex-1 px-3 sm:px-6 py-3 sm:py-5 bg-transparent text-gray-900 text-sm sm:text-lg focus:outline-none min-w-0"
              />
              <motion.button
                type="submit"
                whileHover={{ scale: 1.05 }}
                whileTap={{ scale: 0.95 }}
                className="m-1.5 sm:m-2 px-4 sm:px-8 py-2 sm:py-3 text-sm sm:text-base bg-gradient-to-r from-green-500 to-emerald-500 text-white font-bold rounded-full shadow-lg hover:shadow-xl transition flex-shrink-0"
              >
                Search
              </motion.button>
            </motion.div>
          </div>
        </motion.form>

        {/* CTA Buttons */}
        <motion.div
          className="relative z-10 flex flex-col sm:flex-row gap-4 sm:gap-6 justify-center px-4"
          initial={{ opacity: 0, y: 30 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 1.2 }}
        >
          <motion.button
            whileHover={{ scale: 1.05, y: -5 }}
            whileTap={{ scale: 0.95 }}
            onClick={() => navigate("/business-form")}
            className="group relative px-6 sm:px-10 py-3 sm:py-5 overflow-hidden rounded-2xl"
          >
            <div className="absolute inset-0 bg-gradient-to-r from-green-500 to-emerald-500 transition-transform group-hover:scale-110" />
            <span className="relative z-10 text-white font-bold text-sm sm:text-lg flex items-center gap-2 justify-center">
              <Rocket size={18} className="sm:w-6 sm:h-6" />
              <span className="whitespace-nowrap">
                Register Your Business
              </span>
            </span>
          </motion.button>

          <motion.button
            whileHover={{ scale: 1.05, y: -5 }}
            whileTap={{ scale: 0.95 }}
            onClick={() => navigate("/explore")}
            className="group relative px-6 sm:px-10 py-3 sm:py-5 bg-white border-2 border-orange-500 rounded-2xl overflow-hidden shadow-lg hover:shadow-2xl"
          >
            <span className="relative z-10 text-orange-600 font-bold text-sm sm:text-lg flex items-center gap-2 justify-center">
              <Store size={18} className="sm:w-6 sm:h-6" /> Explore Vendors
            </span>
          </motion.button>
        </motion.div>

        <motion.button
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 1.6 }}
          onClick={() => navigate("/join")}
          className="relative z-10 block mx-auto mt-5 text-sm text-gray-500 hover:text-gray-700 underline underline-offset-2 transition"
        >
          Not a business? Join OJA247
        </motion.button>

        {/* Stats */}
        <motion.div
          initial={{ opacity: 0, y: 50 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 1.4 }}
          className="mt-12 sm:mt-20 grid grid-cols-3 gap-3 sm:gap-8 max-w-3xl w-full px-4"
        >
          {[
            {
              value: stats.businesses,
              label: "Active Businesses",
              color: "from-green-500 to-emerald-500",
            },
            {
              value: stats.products,
              label: "Products Listed",
              color: "from-orange-500 to-yellow-500",
            },
            {
              value: stats.categories,
              label: "Categories",
              color: "from-purple-500 to-pink-500",
            },
          ].map((stat, i) => (
            <motion.div
              key={i}
              whileHover={{ y: -10, scale: 1.05 }}
              className="backdrop-blur-xl bg-white/60 border border-gray-200/50 rounded-2xl sm:rounded-3xl p-3 sm:p-6 shadow-lg"
            >
              <motion.div
                initial={{ opacity: 0, scale: 0 }}
                animate={{ opacity: 1, scale: 1 }}
                transition={{ delay: 1.6 + i * 0.1, type: "spring" }}
                className={`text-2xl sm:text-4xl font-black bg-gradient-to-r ${stat.color} bg-clip-text text-transparent mb-1 sm:mb-2`}
              >
                {stat.value}+
              </motion.div>
              <div className="text-xs sm:text-sm text-gray-600 font-medium">
                {stat.label}
              </div>
            </motion.div>
          ))}
        </motion.div>
      </main>

      {/* How OJA247 works for vendors — an alternating left/right timeline
          instead of a symmetric card grid, with a center line that draws
          itself in as you scroll through the section (tied to scroll
          progress via stepsProgress/timelineHeight, not just a one-shot
          reveal). No opaque bg here, so the ambient blend shows through. */}
      <section ref={stepsRef} className="relative z-10 py-20 px-6">
        <div className="max-w-6xl mx-auto">
          <motion.div
            initial={{ opacity: 0, y: 30 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            className="max-w-2xl mx-auto text-center mb-16"
          >
            <h2 className="text-3xl sm:text-4xl font-black text-gray-900 mb-3">
              How OJA247 works for vendors
            </h2>
            <p className="text-gray-600">Four steps from sign-up to getting paid.</p>
          </motion.div>

          <div className="relative max-w-4xl mx-auto mb-24">
            {/* Center line, desktop only — track in gray, fill draws in
                as the section scrolls through view */}
            <div className="hidden sm:block absolute left-1/2 top-2 bottom-2 w-0.5 -translate-x-1/2 bg-gray-200 rounded-full overflow-hidden">
              <motion.div
                style={{ height: timelineHeight }}
                className="w-full bg-gradient-to-b from-green-500 via-yellow-400 to-orange-500"
              />
            </div>

            <div className="space-y-10 sm:space-y-16">
              {storySteps.map((step, i) => {
                const Icon = step.icon;
                const isLeft = i % 2 === 0;
                return (
                  <div
                    key={step.title}
                    className="relative sm:grid sm:grid-cols-2 sm:gap-x-12 sm:items-center"
                  >
                    {/* Node on the center line */}
                    <div className="hidden sm:block absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 w-4 h-4 rounded-full bg-white border-4 border-green-500 shadow z-10" />

                    <motion.div
                      initial={{ opacity: 0, x: isLeft ? -50 : 50 }}
                      whileInView={{ opacity: 1, x: 0 }}
                      viewport={{ once: true, margin: "-80px" }}
                      transition={{ type: "spring", stiffness: 140, damping: 20 }}
                      whileHover={{ y: -6, scale: 1.02 }}
                      className={`group relative p-6 sm:p-7 rounded-3xl border border-gray-200/50 bg-white/70 backdrop-blur-xl shadow-lg hover:shadow-2xl transition-shadow ${
                        isLeft
                          ? "sm:col-start-1 sm:text-right"
                          : "sm:col-start-2 sm:row-start-1"
                      }`}
                    >
                      <motion.div
                        whileHover={{ rotate: 360, scale: 1.15 }}
                        transition={{ duration: 0.6 }}
                        className={`inline-flex w-14 h-14 rounded-2xl bg-gradient-to-br ${step.color} items-center justify-center shadow-md mb-4 ${
                          isLeft ? "sm:ml-auto" : ""
                        }`}
                      >
                        <Icon size={26} className="text-white" />
                      </motion.div>
                      <div className="text-xs font-bold uppercase tracking-wide text-gray-400 mb-1">
                        Step {i + 1}
                      </div>
                      <h3 className="text-xl sm:text-2xl font-black text-gray-900 mb-2">
                        {step.title}
                      </h3>
                      <p className="text-gray-600 leading-relaxed">{step.body}</p>
                    </motion.div>
                  </div>
                );
              })}
            </div>
          </div>

          <motion.div
            initial={{ opacity: 0, y: 30 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            className="max-w-2xl mx-auto text-center mb-14"
          >
            <h2 className="text-3xl sm:text-4xl font-black text-gray-900 mb-3">
              Why vendors pick OJA247
            </h2>
          </motion.div>

          {/* Each card now has real scroll-tied parallax (ScrollParallaxCard),
              so cards visibly drift at slightly different depths as you
              scroll the section past, not just a fade-in on first view. */}
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-6">
            {hScrollCards.map((card, i) => {
              const Icon = card.icon;
              return (
                <ScrollParallaxCard
                  key={card.title}
                  index={i}
                  className="group relative rounded-3xl border border-gray-200/50 bg-white/70 backdrop-blur-xl shadow-xl p-8 sm:p-10 flex flex-col gap-5 overflow-hidden"
                >
                  <div
                    className={`absolute inset-0 bg-gradient-to-br ${card.color} opacity-0 group-hover:opacity-[0.06] transition-opacity`}
                  />
                  <motion.div
                    whileHover={{ rotate: 360, scale: 1.15 }}
                    transition={{ duration: 0.6 }}
                    className={`relative w-16 h-16 rounded-2xl bg-gradient-to-br ${card.color} flex items-center justify-center shadow-md`}
                  >
                    <Icon size={30} className="text-white" />
                  </motion.div>
                  <h3 className="relative text-2xl font-black text-gray-900">{card.title}</h3>
                  <p className="relative text-gray-600 leading-relaxed">{card.body}</p>
                </ScrollParallaxCard>
              );
            })}
          </div>
        </div>
      </section>

      {/* Become a Marketer — moved up here (from after the pricing section)
          and given a real benefits list instead of a bare icon, so
          marketers get comparable weight to the vendor pitch above rather
          than reading as an afterthought near the bottom of the page. */}
      <section className="relative z-10 py-16 px-6">
        <div className="max-w-5xl mx-auto">
          <motion.div
            initial={{ opacity: 0, y: 40 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            className="relative overflow-hidden rounded-3xl border border-gray-200/50 bg-gradient-to-br from-green-600 to-emerald-600 shadow-xl p-8 sm:p-12"
          >
            <div className="absolute -top-10 -right-10 w-48 h-48 bg-white/10 rounded-full blur-2xl" />
            <div className="absolute -bottom-10 -left-10 w-48 h-48 bg-yellow-300/10 rounded-full blur-2xl" />

            <div className="relative grid grid-cols-1 md:grid-cols-3 gap-8 items-center">
              <div className="md:col-span-2">
                <span className="inline-flex items-center gap-2 bg-white/15 text-white text-xs font-bold px-3 py-1 rounded-full mb-4">
                  <Megaphone size={14} /> No storefront needed
                </span>
                <h2 className="text-2xl sm:text-3xl font-black text-white mb-3">
                  Don't sell anything? Earn by referring businesses instead.
                </h2>
                <p className="text-green-50 text-sm sm:text-base mb-6 max-w-xl">
                  Become an OJA247 Marketer, share your personal referral link with vendors, and get
                  paid in cash every time a business you refer subscribes — no inventory, no
                  storefront, just your network.
                </p>

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-6">
                  <div className="flex items-start gap-2">
                    <Share2 size={18} className="text-white shrink-0 mt-0.5" />
                    <p className="text-xs text-green-50">Share your unique referral link or code</p>
                  </div>
                  <div className="flex items-start gap-2">
                    <Store size={18} className="text-white shrink-0 mt-0.5" />
                    <p className="text-xs text-green-50">A business signs up and subscribes</p>
                  </div>
                  <div className="flex items-start gap-2">
                    <Wallet size={18} className="text-white shrink-0 mt-0.5" />
                    <p className="text-xs text-green-50">You get paid out weekly, straight to your bank</p>
                  </div>
                </div>

                <div className="flex flex-wrap items-center gap-4">
                  <motion.button
                    whileHover={{ scale: 1.05 }}
                    whileTap={{ scale: 0.95 }}
                    onClick={() => navigate("/register-marketer")}
                    className="inline-flex items-center gap-2 bg-white text-green-700 font-bold px-6 py-3 rounded-xl shadow-lg hover:shadow-xl transition"
                  >
                    Become a Marketer <ArrowRight size={18} />
                  </motion.button>

                  <button
                    onClick={() => navigate("/marketer-login")}
                    className="text-sm font-semibold text-white/90 hover:text-white underline underline-offset-4"
                  >
                    Already a marketer? Log in
                  </button>
                </div>
              </div>

              {/* Benefits list replacing the old bare megaphone-in-a-circle
                  graphic — this is the actual "more info on marketers"
                  content the section was missing. */}
              <div className="flex flex-col gap-3">
                {[
                  { icon: CheckCircle2, text: "Free to join — no inventory, no storefront to manage" },
                  { icon: TrendingUp, text: "Live dashboard tracks every referral in real time" },
                  { icon: Wallet, text: "Cash payouts, straight to your bank, weekly" },
                ].map((item, i) => {
                  const ItemIcon = item.icon;
                  return (
                    <motion.div
                      key={item.text}
                      initial={{ opacity: 0, x: 20 }}
                      whileInView={{ opacity: 1, x: 0 }}
                      viewport={{ once: true }}
                      transition={{ delay: i * 0.1 }}
                      className="flex items-center gap-3 bg-white/10 backdrop-blur-sm rounded-2xl px-4 py-3"
                    >
                      <ItemIcon size={18} className="text-yellow-300 shrink-0" />
                      <p className="text-xs sm:text-sm text-white font-medium">{item.text}</p>
                    </motion.div>
                  );
                })}
              </div>
            </div>
          </motion.div>
        </div>
      </section>

      {/* Categories Section */}
      <section className="relative z-10 py-20 px-6">
        <motion.div
          initial={{ opacity: 0, y: 50 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          className="max-w-7xl mx-auto"
        >
          <motion.h2
            initial={{ opacity: 0, x: -50 }}
            whileInView={{ opacity: 1, x: 0 }}
            viewport={{ once: true }}
            className="text-4xl md:text-5xl font-black text-center mb-12 bg-gradient-to-r from-gray-900 to-gray-600 bg-clip-text text-transparent"
          >
            Shop by Category
          </motion.h2>

          <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-8 gap-4">
            {categories.map((cat, i) => (
              <motion.button
                key={cat.name}
                initial={{ opacity: 0, scale: 0.5, rotate: -10 }}
                whileInView={{ opacity: 1, scale: 1, rotate: 0 }}
                viewport={{ once: true }}
                transition={{ delay: i * 0.05, type: "spring" }}
                whileHover={{ y: -10, rotate: 5, scale: 1.1 }}
                whileTap={{ scale: 0.9 }}
                onClick={() => navigate(`/explore?category=${cat.name}`)}
                className="relative group"
              >
                <div
                  className={`absolute inset-0 bg-gradient-to-br ${cat.color} blur-xl opacity-30 group-hover:opacity-60 transition-opacity rounded-2xl`}
                />
                <div className="relative backdrop-blur-xl bg-white/80 border border-gray-200/50 p-6 rounded-2xl hover:bg-white transition shadow-lg hover:shadow-2xl">
                  <div className="text-4xl mb-2">{cat.icon}</div>
                  <div className="font-bold text-sm text-gray-900">
                    {cat.name}
                  </div>
                </div>
              </motion.button>
            ))}
          </div>
        </motion.div>
      </section>

      {/* Featured Businesses */}
      {businesses.length > 0 && (
        <section className="relative z-10 py-20 px-6">
          <div className="max-w-7xl mx-auto">
            <motion.div
              initial={{ opacity: 0 }}
              whileInView={{ opacity: 1 }}
              viewport={{ once: true }}
              className="flex justify-between items-center mb-12"
            >
              <h2 className="text-4xl md:text-5xl font-black bg-gradient-to-r from-gray-900 to-gray-600 bg-clip-text text-transparent">
                Featured Businesses
              </h2>
              <motion.button
                whileHover={{ x: 10 }}
                onClick={() => navigate("/explore")}
                className="text-green-600 font-bold flex items-center gap-2 hover:gap-4 transition-all"
              >
                View All <TrendingUp />
              </motion.button>
            </motion.div>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
              {businesses.map((business, i) => (
                <TiltCard
                  key={business._id}
                  index={i}
                  onClick={() => navigate(`/business/${business.slug || business._id}`, { state: { internalNav: true } })}
                  className="group relative cursor-pointer"
                >
                  <div className="absolute inset-0 bg-gradient-to-br from-green-400/20 to-yellow-400/20 blur-xl opacity-0 group-hover:opacity-100 transition-opacity rounded-3xl" />
                  <div className="relative backdrop-blur-xl bg-white/80 border border-gray-200/50 rounded-3xl overflow-hidden shadow-lg hover:shadow-2xl transition">
                    <div
                      className="h-32 bg-gradient-to-r from-gray-300 to-gray-400"
                      style={{
                        backgroundImage: business.banner
                          ? `url(${business.banner})`
                          : "",
                        backgroundSize: "cover",
                        backgroundPosition: "center",
                      }}
                    />
                    <div className="p-4 -mt-10">
                      <motion.img
                        whileHover={{ rotate: 360, scale: 1.1 }}
                        transition={{ duration: 0.6 }}
                        src={business.logo || "https://via.placeholder.com/80"}
                        alt={business.name}
                        className="w-20 h-20 rounded-full border-4 border-white shadow-lg mb-3 object-cover"
                      />
                      <h3 className="font-bold text-lg mb-1 truncate">
                        {business.name}
                      </h3>
                      <p className="text-sm text-gray-600 mb-2 line-clamp-2 h-10">
                        {business.description}
                      </p>
                      <div className="flex items-center gap-2 text-xs text-gray-500">
                        <span className="bg-gradient-to-r from-green-400 to-emerald-400 text-white px-2 py-1 rounded-full">
                          {business.category}
                        </span>
                        <MapPin size={12} />
                        <span className="truncate">{business.location}</span>
                      </div>
                    </div>
                  </div>
                </TiltCard>
              ))}
            </div>
          </div>
        </section>
      )}

      {/* Trending Products */}
      {featuredProducts.length > 0 && (
        <section className="relative z-10 py-20 px-6">
          <div className="max-w-7xl mx-auto">
            <motion.div
              initial={{ opacity: 0 }}
              whileInView={{ opacity: 1 }}
              viewport={{ once: true }}
              className="flex justify-between items-center mb-12"
            >
              <h2 className="text-4xl md:text-5xl font-black bg-gradient-to-r from-gray-900 to-gray-600 bg-clip-text text-transparent">
                Trending Products
              </h2>
              <motion.button
                whileHover={{ x: 10 }}
                onClick={() => navigate("/products")}
                className="text-green-600 font-bold flex items-center gap-2 hover:gap-4 transition-all"
              >
                View All <TrendingUp />
              </motion.button>
            </motion.div>

            <div className="grid grid-cols-2 sm:grid-cols-2 lg:grid-cols-4 gap-6">
              {featuredProducts.map((product, i) => (
                <TiltCard
                  key={product._id}
                  index={i}
                  onClick={() => navigate(`/product/${product._id}`)}
                  className="group relative cursor-pointer"
                >
                  <div className="absolute inset-0 bg-gradient-to-br from-green-400/20 to-yellow-400/20 blur-xl opacity-0 group-hover:opacity-100 transition-opacity rounded-3xl" />
                  <div className="relative backdrop-blur-xl bg-white/80 border border-gray-200/50 rounded-3xl overflow-hidden shadow-lg hover:shadow-2xl transition flex flex-col">
                    <div className="relative aspect-square bg-gray-100 overflow-hidden">
                      {product.images && product.images[0] ? (
                        <img
                          src={product.images[0]}
                          alt={product.name}
                          className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                        />
                      ) : (
                        <div className="w-full h-full flex items-center justify-center">
                          <Package className="text-gray-300" size={48} />
                        </div>
                      )}
                      <span
                        className={`absolute top-2 left-2 text-[11px] font-semibold px-2 py-1 rounded-full shadow-sm ${
                          product.inStock
                            ? "bg-green-100 text-green-800"
                            : "bg-red-100 text-red-800"
                        }`}
                      >
                        {product.inStock ? "In Stock" : "Out of Stock"}
                      </span>
                    </div>

                    <div className="p-4">
                      {product.businessId?.name && (
                        <p className="text-xs text-gray-400 mb-1 truncate">
                          {product.businessId.name}
                        </p>
                      )}
                      <h3 className="font-bold text-sm sm:text-lg mb-1 truncate">
                        {product.name}
                      </h3>
                      <span className="text-lg sm:text-2xl font-black text-green-600">
                        ₦{product.price.toLocaleString()}
                      </span>
                    </div>
                  </div>
                </TiltCard>
              ))}
            </div>
          </div>
        </section>
      )}

      {/* Pricing / List Your Business */}
      <section className="relative z-10 py-20 px-6">
        <div className="max-w-6xl mx-auto">
          <motion.div
            initial={{ opacity: 0, y: 50 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            className="text-center mb-12"
          >
            <h2 className="text-4xl md:text-5xl font-black mb-4 bg-gradient-to-r from-gray-900 to-gray-600 bg-clip-text text-transparent">
              List Your Business on OJA247
            </h2>
            <p className="text-gray-600 text-base sm:text-lg max-w-2xl mx-auto">
              Get your own storefront, reach thousands of local buyers, and get paid
              straight to your bank — pick the plan that fits.
            </p>
          </motion.div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-6">
            {[
              {
                label: "Monthly",
                price: "1,999",
                cadence: "/month",
                blurb: "Billed every month",
                icon: Zap,
                accent: "from-gray-700 to-gray-900",
                features: ["Full storefront & listings", "Order + payout dashboard", "Email & WhatsApp order alerts"],
              },
              {
                label: "6 Months",
                price: "9,999",
                cadence: "one-time",
                blurb: "≈ ₦1,666/month — save ~17%",
                icon: Sparkles,
                accent: "from-orange-500 to-yellow-500",
                features: ["Everything in Monthly", "Priority listing placement", "Referral points earn faster"],
              },
              {
                label: "Yearly",
                price: "17,999",
                cadence: "one-time",
                blurb: "≈ ₦1,500/month — save ~25%",
                recommended: true,
                icon: Crown,
                accent: "from-green-500 to-emerald-500",
                features: ["Everything in 6 Months", "Verified badge eligibility", "Best price locked in for 12 months"],
              },
            ].map((plan, i) => {
              const PlanIcon = plan.icon;
              return (
              <motion.div
                key={plan.label}
                initial={{ opacity: 0, y: 50 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ delay: i * 0.1, type: "spring", stiffness: 200, damping: 20 }}
                whileHover={{ y: -12, scale: 1.03 }}
                className={`group relative p-8 rounded-3xl border-2 backdrop-blur-xl shadow-lg hover:shadow-2xl transition-all duration-300 overflow-hidden ${
                  plan.recommended
                    ? "border-green-500 bg-white/90 sm:scale-105 shadow-green-100"
                    : "border-gray-200/50 bg-white/70"
                }`}
              >
                {/* Recommended plans get a subtle animated glow sweep */}
                {plan.recommended && (
                  <motion.div
                    className="pointer-events-none absolute inset-0 bg-gradient-to-br from-green-400/10 via-transparent to-yellow-300/10"
                    animate={{ opacity: [0.4, 0.8, 0.4] }}
                    transition={{ duration: 3, repeat: Infinity, ease: "easeInOut" }}
                  />
                )}
                {plan.recommended && (
                  <span className="absolute -top-3 left-1/2 -translate-x-1/2 bg-gradient-to-r from-green-500 to-emerald-500 text-white text-xs font-bold px-4 py-1 rounded-full shadow-md whitespace-nowrap z-10">
                    Best Value
                  </span>
                )}
                <div className="relative">
                  <div
                    className={`w-12 h-12 rounded-xl bg-gradient-to-br ${plan.accent} flex items-center justify-center shadow-md mb-4 transition-transform duration-300 group-hover:scale-110 group-hover:rotate-6`}
                  >
                    <PlanIcon size={22} className="text-white" />
                  </div>
                  <p className="text-gray-500 font-semibold mb-2">{plan.label}</p>
                  <p className="text-4xl font-black text-gray-900 mb-1">
                    ₦{plan.price}
                    <span className="text-base font-medium text-gray-400"> {plan.cadence}</span>
                  </p>
                  <p className="text-sm text-gray-500 mb-6">{plan.blurb}</p>

                  <ul className="space-y-2 mb-6">
                    {plan.features.map((feature) => (
                      <li key={feature} className="flex items-start gap-2 text-sm text-gray-700">
                        <CheckCircle2
                          size={16}
                          className={`mt-0.5 shrink-0 ${plan.recommended ? "text-green-500" : "text-gray-400"}`}
                        />
                        {feature}
                      </li>
                    ))}
                  </ul>

                  <motion.button
                    whileHover={{ scale: 1.05 }}
                    whileTap={{ scale: 0.95 }}
                    onClick={() => navigate("/business-form")}
                    className={`w-full py-3 rounded-xl font-bold transition ${
                      plan.recommended
                        ? "bg-gradient-to-r from-green-500 to-emerald-500 text-white shadow-lg hover:shadow-xl"
                        : "bg-gray-100 text-gray-800 hover:bg-gray-200"
                    }`}
                  >
                    Get Started
                  </motion.button>
                </div>
              </motion.div>
              );
            })}
          </div>

         
        </div>
      </section>

      {/* Features Grid */}
      <section className="relative z-10 py-20 px-6">
        <div className="max-w-6xl mx-auto grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
          {features.map((feature, i) => (
            <motion.div
              key={i}
              initial={{ opacity: 0, y: 50 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ delay: i * 0.1 }}
              whileHover={{ y: -10, scale: 1.05 }}
              className="group relative p-8 backdrop-blur-xl bg-white/60 border border-gray-200/50 rounded-3xl hover:bg-white/80 transition-all shadow-lg hover:shadow-2xl"
            >
              <div className="absolute inset-0 bg-gradient-to-br from-green-500/5 to-yellow-500/5 rounded-3xl opacity-0 group-hover:opacity-100 transition-opacity" />
              <div className="relative">
                <motion.div
                  whileHover={{ rotate: 360, scale: 1.2 }}
                  transition={{ duration: 0.6 }}
                  className="inline-flex p-4 bg-gradient-to-br from-green-500 to-yellow-500 rounded-2xl mb-4 shadow-md"
                >
                  <feature.icon className="text-white text-3xl" />
                </motion.div>
                <h3 className="text-gray-900 font-bold text-xl mb-2">
                  {feature.title}
                </h3>
                <p className="text-gray-600 text-sm">{feature.desc}</p>
              </div>
            </motion.div>
          ))}
        </div>
      </section>
    </div>
  );
};

export default LandingPage;