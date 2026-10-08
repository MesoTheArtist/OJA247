import { FaUsers } from "react-icons/fa";
import { motion } from "framer-motion";
import { useState, useEffect } from "react";

import EbenImage from "../assets/EBEN001.PNG";
import LanreImage from "../assets/LANRE001.PNG";
import TeamImage from "../assets/TEAM001.jpeg";
import Loader from "../components/Loader";
import useMinimumLoadingTime from "../hooks/useMinimumLoadingTime";

// ---- Reveal animation helpers ----------------------------------------

const lineVariants = {
  hidden: {},
  show: { transition: { staggerChildren: 0.1, delayChildren: 0.2 } },
};

const wordVariants = {
  hidden: { y: "110%" },
  show: { y: "0%", transition: { duration: 0.8, ease: [0.16, 1, 0.3, 1] } },
};

const letterVariants = {
  hidden: { y: 70, opacity: 0, rotate: 6 },
  show: {
    y: 0,
    opacity: 1,
    rotate: 0,
    transition: { duration: 0.7, ease: [0.34, 1.56, 0.64, 1] },
  },
};

const Word = ({ children }) => (
  <span className="inline-block overflow-hidden align-top pb-1">
    <motion.span variants={wordVariants} className="inline-block">
      {children}
    </motion.span>
  </span>
);

const GhostWord = ({ text }) => (
  <motion.span
    variants={lineVariants}
    initial="hidden"
    animate="show"
    className="inline-block select-none"
  >
    {text.split("").map((ch, i) => (
      <motion.span key={i} variants={letterVariants} className="inline-block">
        {ch === " " ? "\u00A0" : ch}
      </motion.span>
    ))}
  </motion.span>
);

// ---- Founder data -------------------------------------------------------

const founders = [
  {
    img: EbenImage,
    name: "Ndudim Ebenezer Nmesoma",
    short: "Ebenezer",
    role: "Frontend & Design Lead",
    accent: "#0B8F4D",
    skills: ["Frontend Development", "UI/UX Design", "Product Strategy"],
    rotate: -6,
  },
  {
    img: LanreImage,
    name: "Olanrewaju Williams Owolabi",
    short: "Williams",
    role: "Backend Lead",
    accent: "#F59E0B",
    skills: ["Backend Engineering", "API Development", "System Security"],
    rotate: 5,
  },
];

const About = () => {
  const [mousePosition, setMousePosition] = useState({ x: 0, y: 0 });
  const [loading, setLoading] = useState(true);
  const showLoader = useMinimumLoadingTime(loading);

  useEffect(() => {
    setLoading(false);
  }, []);

  useEffect(() => {
    const handleMouseMove = (e) => {
      setMousePosition({ x: e.clientX, y: e.clientY });
    };
    window.addEventListener("mousemove", handleMouseMove);
    return () => window.removeEventListener("mousemove", handleMouseMove);
  }, []);

  if (showLoader) {
    return <Loader text="Loading..." />;
  }

  return (
    <div className="relative bg-gray-50 min-h-screen overflow-hidden">
      {/* Ambient glow field */}
      <motion.div
        className="absolute w-96 h-96 bg-[#0B8F4D]/10 rounded-full blur-3xl pointer-events-none"
        animate={{ x: mousePosition.x / 20, y: mousePosition.y / 20 }}
        transition={{ type: "spring", damping: 30 }}
        style={{ left: "8%", top: "18%" }}
      />
      <motion.div
        className="absolute w-96 h-96 bg-[#F59E0B]/10 rounded-full blur-3xl pointer-events-none"
        animate={{ x: -mousePosition.x / 30, y: -mousePosition.y / 30 }}
        transition={{ type: "spring", damping: 30 }}
        style={{ right: "8%", bottom: "18%" }}
      />

      {/* ================= HERO ================= */}
      <section className="relative pt-28 pb-20 px-6 text-center overflow-hidden">
        <motion.p
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="text-[#0B8F4D] font-bold tracking-widest mb-5"
        >
          ABOUT OJA247
        </motion.p>

        <motion.h1
          variants={lineVariants}
          initial="hidden"
          animate="show"
          className="font-black text-gray-900 text-4xl md:text-5xl leading-none tracking-tight"
        >
          <Word>Two</Word> <Word>developers,</Word>
        </motion.h1>

        {/* Giant ghost headline, novabrew-style */}
        <div className="relative w-full mt-1 flex justify-center">
          <div className="italic font-black leading-[0.85] text-[16vw] md:text-[9vw] text-gray-200 whitespace-nowrap">
            <GhostWord text="one vision" />
          </div>
        </div>

        {/* Floating founder cards */}
        <div className="relative h-64 md:h-80 -mt-6 md:-mt-12 pointer-events-none">
          {founders.map((f, i) => (
            <motion.div
              key={f.short}
              className="pointer-events-auto absolute rounded-3xl overflow-hidden cursor-pointer"
              style={{
                width: 170,
                height: 220,
                left: i === 0 ? "26%" : "58%",
                top: i === 0 ? 30 : 0,
                background: `linear-gradient(180deg, ${f.accent} 0%, #0B8F4D22 100%)`,
                boxShadow: `0 30px 50px -18px ${f.accent}66, inset 0 2px 0 rgba(255,255,255,.35)`,
              }}
              initial={{ y: -400, opacity: 0, rotate: f.rotate + 20, scale: 0.7 }}
              animate={{
                x: (mousePosition.x - window.innerWidth / 2) / (i === 0 ? 26 : 34),
                y: 0,
                opacity: 1,
                rotate: f.rotate,
                scale: 1,
              }}
              transition={{ duration: 1, delay: 0.9 + i * 0.15, ease: [0.34, 1.56, 0.64, 1] }}
              whileHover={{ scale: 1.08, rotate: 0, zIndex: 10 }}
            >
              <img
                src={f.img}
                alt={f.name}
                className="w-full h-full object-cover object-top"
              />
              <div className="absolute inset-x-0 bottom-0 bg-black/60 backdrop-blur-sm px-3 py-2">
                <p className="text-white text-sm font-bold">{f.short}</p>
                <p className="text-white/70 text-[11px]">{f.role}</p>
              </div>
            </motion.div>
          ))}
        </div>

        <motion.p
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 1.4 }}
          className="max-w-2xl mx-auto mt-6 text-lg text-gray-600 leading-8"
        >
          OJA247 is a Nigerian marketplace platform built to help small
          businesses create online storefronts, manage orders, accept
          payments, and grow digitally.
        </motion.p>

        <motion.div
          initial={{ opacity: 0, scale: 0.85 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ delay: 1.6 }}
          className="mt-6 inline-flex items-center gap-2 bg-gray-900 text-white text-sm font-semibold px-5 py-3 rounded-full shadow-lg"
        >
          Built for Sellers.{" "}
          <span className="text-[#F59E0B]">Made for Buyers.</span>
        </motion.div>
      </section>

      {/* ================= MISSION ================= */}
      <section className="max-w-6xl mx-auto px-6 py-16">
        <motion.div
          initial={{ opacity: 0, y: 40 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          className="bg-white rounded-3xl border border-gray-200 shadow-sm p-10 md:p-14"
        >
          <h2 className="text-3xl font-bold text-[#0B8F4D] mb-6">
            Our Mission
          </h2>
          <p className="text-gray-700 text-lg leading-8">
            OJA247 was created by two Software Engineering students at
            APTECH who saw the difficulties Nigerian entrepreneurs face when
            trying to establish an online presence.
          </p>
          <p className="mt-5 text-gray-700 text-lg leading-8">
            Our goal is to make online selling simple, affordable, and
            accessible by giving businesses professional digital tools
            without complexity.
          </p>
        </motion.div>
      </section>

      {/* ================= FOUNDERS ================= */}
      <section className="relative max-w-6xl mx-auto px-6 py-16">
        <motion.div
          initial={{ opacity: 0, y: 30 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          className="text-center mb-14 relative"
        >
          <p className="text-[#0B8F4D] font-bold tracking-widest text-sm mb-3">
            THE PEOPLE BEHIND IT
          </p>
          <h2 className="text-4xl font-black text-gray-900">
            Meet The Founders
          </h2>
        </motion.div>

        {/* Two large tilt cards, side by side — no grid needed for two people */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
          {founders.map((f, i) => (
            <motion.div
              key={f.name}
              initial={{ opacity: 0, y: 50, rotate: f.rotate }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ duration: 0.7, delay: i * 0.15 }}
              whileHover={{ y: -10, rotate: i === 0 ? -1.5 : 1.5 }}
              className="relative bg-gray-900 rounded-[2rem] p-8 overflow-hidden shadow-2xl group"
            >
              <div
                className="absolute -top-20 -right-20 w-64 h-64 rounded-full blur-3xl pointer-events-none transition-opacity duration-500 opacity-20 group-hover:opacity-40"
                style={{ background: f.accent }}
              />

              <div className="relative flex items-center gap-6">
                <img
                  src={f.img}
                  alt={f.name}
                  className="w-24 h-24 md:w-28 md:h-28 rounded-full object-cover border-4 shrink-0"
                  style={{ borderColor: f.accent }}
                />
                <div>
                  <p className="text-white font-black text-2xl leading-tight">
                    {f.name}
                  </p>
                  <p
                    className="font-bold uppercase tracking-wide text-sm mt-1"
                    style={{ color: f.accent }}
                  >
                    {f.role}
                  </p>
                </div>
              </div>

              <div className="relative flex flex-wrap gap-2 mt-7">
                {f.skills.map((skill) => (
                  <span
                    key={skill}
                    className="px-3 py-1.5 rounded-full text-xs font-semibold"
                    style={{
                      background: `${f.accent}22`,
                      color: f.accent,
                    }}
                  >
                    {skill}
                  </span>
                ))}
              </div>
            </motion.div>
          ))}
        </div>

        <motion.p
          initial={{ opacity: 0 }}
          whileInView={{ opacity: 1 }}
          viewport={{ once: true }}
          className="text-center text-gray-600 mt-10 max-w-2xl mx-auto leading-7"
        >
          Two Software Engineering students at APTECH, pairing frontend
          craft with backend engineering to build one cohesive product from
          the ground up.
        </motion.p>

        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          className="flex flex-col items-center mt-12"
        >
          <img
            src={TeamImage}
            alt="The OJA247 Team"
            className="w-24 h-24 rounded-full object-cover border-4 border-white shadow-md"
          />
          <p className="mt-4 font-semibold text-gray-900">The OJA247 Team</p>
          <p className="text-sm text-gray-500">
            Software Engineering Students @ APTECH
          </p>
        </motion.div>
      </section>

      {/* ================= STATS ================= */}
      <section className="px-6 pb-16">
        <motion.div
          initial={{ opacity: 0, y: 40 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          className="max-w-6xl mx-auto bg-gray-900 rounded-[2.5rem] px-8 py-14 md:px-16 md:py-16 text-white relative overflow-hidden"
        >
          <div className="absolute -top-40 -right-20 w-96 h-96 rounded-full bg-[#0B8F4D]/25 blur-3xl pointer-events-none" />
          <div className="absolute -bottom-32 left-1/4 w-72 h-72 rounded-full bg-[#F59E0B]/20 blur-3xl pointer-events-none" />

          <div className="relative grid grid-cols-1 sm:grid-cols-3 gap-10 items-end">
            <h3 className="text-3xl md:text-4xl font-bold leading-tight sm:col-span-3 md:col-span-1">
              Two founders.
              <br />
              <em className="italic font-black text-transparent bg-clip-text bg-gradient-to-r from-[#0B8F4D] to-[#F59E0B]">
                Zero shortcuts.
              </em>
            </h3>

            <Counter target={2} label="Co-Founders" />
            <Counter target={100} suffix="%" label="Built by Students" />
          </div>
        </motion.div>
      </section>

      {/* ================= CLOSING ================= */}
      <section className="relative bg-[#0B8F4D] text-white py-20 px-6 text-center overflow-hidden">
        <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
          {[0, 1, 2, 3].map((i) => (
            <motion.span
              key={i}
              className="absolute rounded-full border-2"
              style={{
                borderColor: i % 2 === 0 ? "#F59E0B" : "#ffffff",
                opacity: 0.35,
              }}
              initial={{ width: 0, height: 0, opacity: 0.6 }}
              animate={{ width: 900, height: 900, opacity: 0 }}
              transition={{
                duration: 4,
                repeat: Infinity,
                ease: "easeOut",
                delay: i,
              }}
            />
          ))}
        </div>

        <motion.div
          initial={{ opacity: 0, y: 30 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          className="relative"
        >
          <motion.div whileHover={{ scale: 1.15 }} className="relative inline-block mb-5">
            <span className="absolute inset-0 flex items-center justify-center pointer-events-none">
              {[0, 1, 2].map((i) => (
                <motion.span
                  key={i}
                  className="absolute rounded-full border-2"
                  style={{ borderColor: "#F59E0B" }}
                  initial={{ width: 0, height: 0, opacity: 0 }}
                  whileHover={{ width: 120, height: 120, opacity: [0.7, 0] }}
                  transition={{
                    duration: 1.2,
                    repeat: Infinity,
                    ease: "easeOut",
                    delay: i * 0.3,
                  }}
                />
              ))}
            </span>
            <FaUsers className="relative text-5xl" />
          </motion.div>

          <h2 className="text-4xl font-black">
            Two Developers.
            <br />
            One Vision.
          </h2>

          <p className="max-w-3xl mx-auto mt-6 text-lg opacity-90 leading-8">
            By combining frontend development, backend engineering, design,
            and product strategy, OJA247 is being built to help Nigerian
            businesses sell smarter.
          </p>
        </motion.div>
      </section>
    </div>
  );
};

// ---- Animated counter, novabrew-style ---------------------------------

const Counter = ({ target, suffix = "", label }) => {
  const [value, setValue] = useState(0);

  const handleEnter = () => {
    const duration = 1200;
    const start = performance.now();
    const tick = (now) => {
      const progress = Math.min((now - start) / duration, 1);
      setValue(Math.floor(progress * target));
      if (progress < 1) requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  };

  return (
    <motion.div onViewportEnter={handleEnter} viewport={{ once: true }}>
      <div className="text-5xl md:text-6xl font-bold tracking-tight">
        {value}
        {suffix}
      </div>
      <div className="text-xs uppercase tracking-widest text-gray-400 mt-3 pt-3 border-t border-white/10">
        {label}
      </div>
    </motion.div>
  );
};

export default About;