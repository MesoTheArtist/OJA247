import React, { useEffect, useRef, useState } from "react";
import { motion, useInView } from "framer-motion";
import {
  ArrowRight,
  CheckCircle2,
  Crown,
  ExternalLink,
  Globe,
  Mail,
  MessageCircle,
  Palette,
  Phone,
  Rocket,
  ShieldCheck,
  ShoppingBag,
  Sparkles,
  Wrench,
} from "lucide-react";

import OjaDemo from "../assets/website-demo-image/OJA247demo.png";

// ---- Contact -------------------------------------------------------------
// Every "talk to us" button opens WhatsApp with a message already typed, so
// the visitor only has to press send. The message changes with the button
// (a package name, a project type) so you know what they are asking about.
const WHATSAPP_NUMBER = "2347067953802";
const PHONE_DISPLAY = "+234 706 795 3802";
const SUPPORT_EMAIL = "support@oja247.store";

const waLink = (message) =>
  `https://wa.me/${WHATSAPP_NUMBER}?text=${encodeURIComponent(message)}`;

// ---- Content -------------------------------------------------------------

const steps = [
  {
    icon: MessageCircle,
    title: "Talk to us",
    body: "Tell us about your business and what you want your website to do.",
    color: "from-green-500 to-emerald-600",
  },
  {
    icon: Palette,
    title: "We build it",
    body: "We design and build your site, then send it to you for approval.",
    color: "from-yellow-400 to-orange-500",
  },
  {
    icon: Rocket,
    title: "You launch",
    body: "We set up your domain and business email, then take the site live.",
    color: "from-green-500 to-yellow-400",
  },
  {
    icon: ShieldCheck,
    title: "We look after it",
    body: "Hosting, updates, small edits and support are all taken care of.",
    color: "from-emerald-600 to-green-700",
  },
];

// "price" is the starting price in naira. "care" is the yearly care plan,
// which starts in year two (the first year is included in the build price).
const tiers = [
  {
    name: "Basic",
    price: "250,000",
    care: "80,000",
    blurb: "A clean, professional website for your business.",
    features: [
      "Up to 5 pages, designed for phones first",
      "Your own custom domain",
      "Hosting, security and updates",
      "2 small edits every month",
      "Reply within one working day",
    ],
  },
  {
    name: "Standard",
    price: "350,000",
    care: "100,000",
    popular: true,
    blurb: "Look established and get enquiries straight to WhatsApp.",
    features: [
      "Everything in Basic",
      "A business email on your own domain",
      "Contact form with WhatsApp alerts",
    ],
  },
  {
    name: "Premium",
    price: "500,000",
    care: "150,000",
    blurb: "Run your website yourself, right from your phone.",
    features: [
      "Everything in Standard",
      "Phone admin panel to edit your site",
      "Booking or appointment form",
      "2 business emails on your domain",
    ],
  },
];

const bigger = [
  {
    icon: ShoppingBag,
    name: "Online store",
    price: "600,000",
    blurb:
      "Your own store with products, cart and payments, plus an admin panel to manage orders and stock.",
    note: "Admin panel included",
  },
  {
    icon: Crown,
    name: "Fashion and luxury brands",
    price: "1,000,000",
    blurb:
      "A fully custom design that feels as exclusive as your brand, with everything you need to sell included.",
    note: "Designed around your brand",
  },
  {
    icon: Wrench,
    name: "Custom projects",
    price: "800,000",
    blurb:
      "Booking platforms, client portals, directories and membership sites, built around how your business works.",
    note: "Quoted after a short call",
  },
];

const careIncludes = [
  "Domain and hosting",
  "Security and updates",
  "2 small edits a month",
  "Reply within one working day",
];

const addOns = [
  { label: "Extra page", price: "20,000" },
  { label: "Booking or appointment form", price: "65,000" },
  { label: "Blog or news section", price: "40,000" },
  { label: "Extra business email", price: "25,000 / year" },
  { label: "Search engine setup", price: "30,000" },
  { label: "Google Business Profile", price: "20,000" },
  { label: "Logo or branding refresh", price: "60,000" },
  { label: "Phone admin panel (Basic and Standard)", price: "100,000" },
];

// ---- Sample sites ----------------------------------------------------------
// Each card shows the live site, shrunk into a thumbnail, and links to it.
// Fields:
//   name, type  shown under the preview
//   url         the live site (the card opens it in a new tab)
//   image       optional screenshot; if set it is shown instead of the live frame
//   preview     set to "off" if a site refuses to be shown inside another page
//               (the card then shows a clean browser-style box instead)
// To add a project, copy one of these lines. For a screenshot, put the file in
// public/samples and use image: "/samples/name.png".
const sampleSites = [
  {
    name: "Chef Headiez",
    type: "Chef and catering website",
    url: "https://chef-headiez.vercel.app/",
  },
  {
    name: "ASA Learns",
    type: "Tech training institute",
    url: "https://asa-learns-vx-1.vercel.app/",
  },
  {
    name: "Montero Designs",
    type: "Designer portfolio",
    url: "https://my-portfolio-vert-nine-33.vercel.app/",
  },
  {
    name: "OJA247",
    type: "Online marketplace, our own platform",
    url: "https://www.oja247.store",
    image: OjaDemo,
  },
];

// ---- Small pieces --------------------------------------------------------

const SectionHeading = ({ title, subtitle }) => (
  <motion.div
    initial={{ opacity: 0, y: 30 }}
    whileInView={{ opacity: 1, y: 0 }}
    viewport={{ once: true }}
    className="max-w-2xl mx-auto text-center mb-12"
  >
    <h2 className="text-3xl sm:text-4xl font-black text-gray-900 mb-3">{title}</h2>
    {subtitle && <p className="text-gray-600 text-base sm:text-lg">{subtitle}</p>}
  </motion.div>
);

const WhatsAppButton = ({ message, children, className = "" }) => (
  <a
    href={waLink(message)}
    target="_blank"
    rel="noopener noreferrer"
    className={`inline-flex items-center justify-center gap-2 font-bold rounded-2xl transition ${className}`}
  >
    <MessageCircle size={18} />
    {children}
  </a>
);

// The browser-style box used when there is nothing to preview.
const hostOf = (url) => {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return url;
  }
};

const PREVIEW_WIDTH = 1280;
const PREVIEW_HEIGHT = 800;

const BrowserBox = ({ site }) => (
  <div className="absolute inset-0 flex flex-col bg-white">
    <div className="flex items-center gap-1.5 px-3 py-2 bg-gray-100 border-b border-gray-200">
      <span className="w-2.5 h-2.5 rounded-full bg-red-300" />
      <span className="w-2.5 h-2.5 rounded-full bg-yellow-300" />
      <span className="w-2.5 h-2.5 rounded-full bg-green-300" />
      <span className="ml-2 text-xs text-gray-500 truncate">
        {site.url ? hostOf(site.url) : "your-website.com"}
      </span>
    </div>
    <div className="flex-1 flex flex-col items-center justify-center gap-2 text-gray-400">
      <Globe size={36} />
      <span className="text-sm font-semibold text-gray-500">{site.name}</span>
    </div>
  </div>
);

// Shows the live site scaled down to fit the card. The frame is only loaded
// once the card is near the screen, and it ignores taps, so tapping the card
// opens the real site instead of scrolling or clicking inside the preview.
const SitePreview = ({ site }) => {
  const boxRef = useRef(null);
  const inView = useInView(boxRef, { once: true, margin: "200px" });
  const [scale, setScale] = useState(0.3);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    const el = boxRef.current;
    if (!el) return undefined;
    const update = () => setScale(el.clientWidth / PREVIEW_WIDTH);
    update();
    const observer = new ResizeObserver(update);
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  const showFrame = site.url && site.preview !== "off" && !site.image;

  return (
    <div
      ref={boxRef}
      className="relative aspect-[16/10] w-full overflow-hidden bg-gray-100"
    >
      {site.image ? (
        <img
          src={site.image}
          alt={`${site.name} website preview`}
          loading="lazy"
          className="w-full h-full object-cover object-top"
        />
      ) : showFrame ? (
        <>
          {!loaded && <div className="absolute inset-0 animate-pulse bg-gray-200" />}
          {inView && (
            <iframe
              src={site.url}
              title={`${site.name} preview`}
              loading="lazy"
              tabIndex={-1}
              aria-hidden="true"
              sandbox="allow-scripts allow-same-origin"
              onLoad={() => setLoaded(true)}
              style={{
                width: PREVIEW_WIDTH,
                height: PREVIEW_HEIGHT,
                transform: `scale(${scale})`,
                transformOrigin: "top left",
                pointerEvents: "none",
                border: 0,
              }}
            />
          )}
        </>
      ) : (
        <BrowserBox site={site} />
      )}
    </div>
  );
};

const SampleCard = ({ site, index }) => {
  const inner = (
    <>
      <SitePreview site={site} />
      <div className="p-5 flex items-center justify-between gap-3">
        <div>
          <h3 className="font-bold text-gray-900">{site.name}</h3>
          <p className="text-sm text-gray-500">{site.type}</p>
        </div>
        {site.url && <ExternalLink size={18} className="text-green-600 shrink-0" />}
      </div>
    </>
  );

  const base =
    "block rounded-3xl border border-gray-200/60 bg-white/80 backdrop-blur-xl shadow-lg overflow-hidden";

  return (
    <motion.div
      initial={{ opacity: 0, y: 30 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true }}
      transition={{ delay: index * 0.1 }}
      whileHover={site.url ? { y: -6 } : undefined}
    >
      {site.url ? (
        <a
          href={site.url}
          target="_blank"
          rel="noopener noreferrer"
          className={`${base} hover:shadow-2xl transition-shadow`}
        >
          {inner}
        </a>
      ) : (
        <div className={`${base} opacity-90`}>{inner}</div>
      )}
    </motion.div>
  );
};

// ---- Page ----------------------------------------------------------------

const CustomWebsitesPage = () => {
  useEffect(() => {
    document.title = "Custom Websites | OJA247";
  }, []);

  return (
    <div className="relative min-h-screen overflow-hidden bg-gradient-to-br from-white via-gray-50 to-white">
      {/* Soft glows, same colours as the rest of the site */}
      <div className="pointer-events-none absolute -top-24 -right-24 w-96 h-96 bg-green-400/20 rounded-full blur-3xl" />
      <div className="pointer-events-none absolute top-1/3 -left-24 w-96 h-96 bg-yellow-300/20 rounded-full blur-3xl" />

      {/* Hero */}
      <section className="relative z-10 px-6 pt-6 pb-16 sm:pb-24">
        <div className="max-w-4xl mx-auto text-center">
          <motion.span
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="inline-flex items-center gap-2 bg-green-100 text-green-700 text-xs font-bold px-3 py-1 rounded-full mb-5"
          >
            <Sparkles size={14} /> Custom websites by OJA247
          </motion.span>
          <motion.h1
            initial={{ opacity: 0, y: 30 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.1 }}
            className="text-4xl sm:text-6xl font-black text-gray-900 mb-5"
          >
            Ready for your own{" "}
            <span className="bg-gradient-to-r from-green-600 to-yellow-500 bg-clip-text text-transparent">
              website?
            </span>
          </motion.h1>
          <motion.p
            initial={{ opacity: 0, y: 30 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.2 }}
            className="text-gray-600 text-lg sm:text-xl max-w-2xl mx-auto mb-8"
          >
            We design it, set it up and look after it, so you can focus on your
            business. Perfect for service providers, brands and growing
            businesses.
          </motion.p>
          <motion.div
            initial={{ opacity: 0, y: 30 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.3 }}
            className="flex flex-col sm:flex-row gap-3 justify-center"
          >
            <WhatsAppButton
              message="Hi OJA247, I'd like to get a website for my business."
              className="px-8 py-4 bg-green-600 text-white shadow-lg hover:bg-green-700"
            >
              Chat with us on WhatsApp
            </WhatsAppButton>
            <a
              href="#packages"
              className="inline-flex items-center justify-center gap-2 px-8 py-4 rounded-2xl font-bold text-gray-700 border border-gray-300 bg-white/70 hover:bg-white transition"
            >
              See packages <ArrowRight size={18} />
            </a>
          </motion.div>
        </div>
      </section>

      {/* How it works */}
      <section className="relative z-10 px-6 py-16">
        <div className="max-w-6xl mx-auto">
          <SectionHeading
            title="How it works"
            subtitle="Four simple steps. You never have to think about domains or hosting."
          />
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
            {steps.map((step, i) => {
              const Icon = step.icon;
              return (
                <motion.div
                  key={step.title}
                  initial={{ opacity: 0, y: 30 }}
                  whileInView={{ opacity: 1, y: 0 }}
                  viewport={{ once: true }}
                  transition={{ delay: i * 0.1 }}
                  className="rounded-3xl border border-gray-200/50 bg-white/70 backdrop-blur-xl shadow-lg p-6"
                >
                  <div
                    className={`w-14 h-14 rounded-2xl bg-gradient-to-br ${step.color} flex items-center justify-center shadow-md mb-4`}
                  >
                    <Icon size={26} className="text-white" />
                  </div>
                  <div className="text-xs font-bold uppercase tracking-wide text-gray-400 mb-1">
                    Step {i + 1}
                  </div>
                  <h3 className="text-xl font-black text-gray-900 mb-2">{step.title}</h3>
                  <p className="text-gray-600 leading-relaxed">{step.body}</p>
                </motion.div>
              );
            })}
          </div>
        </div>
      </section>

      {/* Packages */}
      <section id="packages" className="relative z-10 px-6 py-16 scroll-mt-28">
        <div className="max-w-6xl mx-auto">
          <SectionHeading
            title="Packages for service providers and businesses"
            subtitle="Prices start from the amounts below. The first year of care is included, so you only pay the care plan from year two."
          />
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {tiers.map((tier, i) => (
              <motion.div
                key={tier.name}
                initial={{ opacity: 0, y: 40 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ delay: i * 0.1 }}
                className={`relative flex flex-col rounded-3xl bg-white/80 backdrop-blur-xl shadow-xl p-8 ${
                  tier.popular
                    ? "border-2 border-green-500"
                    : "border border-gray-200/60"
                }`}
              >
                {tier.popular && (
                  <span className="absolute -top-3 left-1/2 -translate-x-1/2 bg-green-600 text-white text-xs font-bold px-4 py-1 rounded-full">
                    Most popular
                  </span>
                )}
                <h3 className="text-2xl font-black text-gray-900">{tier.name}</h3>
                <p className="text-gray-600 mt-1 mb-5">{tier.blurb}</p>
                <div className="mb-1">
                  <span className="text-sm text-gray-500">from </span>
                  <span className="text-4xl font-black text-gray-900">
                    ₦{tier.price}
                  </span>
                </div>
                <p className="text-sm text-gray-500 mb-6">
                  Care plan from year two: ₦{tier.care} a year
                </p>
                <ul className="space-y-3 mb-8 flex-1">
                  {tier.features.map((feature) => (
                    <li key={feature} className="flex items-start gap-2 text-gray-700">
                      <CheckCircle2 size={18} className="text-green-600 mt-0.5 shrink-0" />
                      <span>{feature}</span>
                    </li>
                  ))}
                </ul>
                <WhatsAppButton
                  message={`Hi OJA247, I'm interested in the ${tier.name} website package.`}
                  className={`w-full px-6 py-3 ${
                    tier.popular
                      ? "bg-green-600 text-white hover:bg-green-700"
                      : "bg-gray-900 text-white hover:bg-gray-800"
                  }`}
                >
                  Get {tier.name}
                </WhatsAppButton>
              </motion.div>
            ))}
          </div>

          {/* What the care plan covers */}
          <motion.div
            initial={{ opacity: 0, y: 30 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            className="mt-10 rounded-3xl border border-green-200 bg-green-50/70 p-6 sm:p-8 text-center"
          >
            <h3 className="text-xl font-black text-gray-900 mb-1">
              The care plan keeps everything running
            </h3>
            <p className="text-gray-600 mb-4">
              Your site stays online, secure and up to date without you lifting a finger.
            </p>
            <div className="flex flex-wrap justify-center gap-2">
              {careIncludes.map((item) => (
                <span
                  key={item}
                  className="inline-flex items-center gap-1.5 bg-white border border-green-200 text-green-700 text-sm font-semibold px-3 py-1.5 rounded-full"
                >
                  <CheckCircle2 size={14} /> {item}
                </span>
              ))}
            </div>
          </motion.div>
        </div>
      </section>

      {/* Bigger projects */}
      <section className="relative z-10 px-6 py-16">
        <div className="max-w-6xl mx-auto">
          <SectionHeading
            title="Bigger projects"
            subtitle="Online stores, brand sites and custom builds. We start with a quick chat to get the details right."
          />
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {bigger.map((item, i) => {
              const Icon = item.icon;
              return (
                <motion.div
                  key={item.name}
                  initial={{ opacity: 0, y: 40 }}
                  whileInView={{ opacity: 1, y: 0 }}
                  viewport={{ once: true }}
                  transition={{ delay: i * 0.1 }}
                  className="flex flex-col rounded-3xl border border-gray-200/60 bg-white/80 backdrop-blur-xl shadow-xl p-8"
                >
                  <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-gray-800 to-gray-950 flex items-center justify-center shadow-md mb-5">
                    <Icon size={26} className="text-yellow-400" />
                  </div>
                  <h3 className="text-xl font-black text-gray-900 mb-2">{item.name}</h3>
                  <p className="text-gray-600 leading-relaxed mb-5 flex-1">{item.blurb}</p>
                  <div className="mb-1">
                    <span className="text-sm text-gray-500">from </span>
                    <span className="text-3xl font-black text-gray-900">₦{item.price}</span>
                  </div>
                  <p className="text-sm text-green-700 font-semibold mb-5">{item.note}</p>
                  <WhatsAppButton
                    message={`Hi OJA247, I'd like to talk about a ${item.name.toLowerCase()} project.`}
                    className="w-full px-6 py-3 border border-gray-300 text-gray-800 hover:bg-gray-50"
                  >
                    Talk to us
                  </WhatsAppButton>
                </motion.div>
              );
            })}
          </div>
        </div>
      </section>

      {/* Add-ons */}
      <section className="relative z-10 px-6 py-16">
        <div className="max-w-4xl mx-auto">
          <SectionHeading
            title="Add what you need"
            subtitle="Start with a package, then add extras whenever your business needs them."
          />
          <motion.div
            initial={{ opacity: 0, y: 30 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            className="rounded-3xl border border-gray-200/60 bg-white/80 backdrop-blur-xl shadow-lg divide-y divide-gray-100"
          >
            {addOns.map((addOn) => (
              <div
                key={addOn.label}
                className="flex items-center justify-between gap-4 px-6 py-4"
              >
                <span className="text-gray-800 font-medium">{addOn.label}</span>
                <span className="font-bold text-gray-900 whitespace-nowrap">
                  ₦{addOn.price}
                </span>
              </div>
            ))}
          </motion.div>
        </div>
      </section>

      {/* Sample sites */}
      <section id="samples" className="relative z-10 px-6 py-16 scroll-mt-28">
        <div className="max-w-6xl mx-auto">
          <SectionHeading
            title="Sites we've built"
            subtitle="A look at our work. Tap a site to open it."
          />
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
            {sampleSites.map((site, i) => (
              <SampleCard key={`${site.name}-${i}`} site={site} index={i} />
            ))}
          </div>
        </div>
      </section>

      {/* Free quote */}
      <section id="quote" className="relative z-10 px-6 py-16 scroll-mt-28">
        <div className="max-w-5xl mx-auto">
          <motion.div
            initial={{ opacity: 0, y: 40 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-green-600 to-emerald-600 shadow-xl p-8 sm:p-12 text-center"
          >
            <div className="absolute -top-10 -right-10 w-48 h-48 bg-white/10 rounded-full blur-2xl" />
            <div className="absolute -bottom-10 -left-10 w-48 h-48 bg-yellow-300/10 rounded-full blur-2xl" />
            <div className="relative">
              <h2 className="text-3xl sm:text-4xl font-black text-white mb-3">
                Get a free quote
              </h2>
              <p className="text-white/90 text-lg max-w-2xl mx-auto mb-8">
                Tell us about your website vision. We reply within one working day.
              </p>
              <WhatsAppButton
                message="Hi OJA247, I'd like a free quote for a website."
                className="px-8 py-4 bg-white text-green-700 shadow-lg hover:bg-green-50"
              >
                Chat with us on WhatsApp
              </WhatsAppButton>
              <div className="mt-6 flex flex-col sm:flex-row gap-3 sm:gap-8 justify-center text-white/90 text-sm">
                <a
                  href={`tel:+${WHATSAPP_NUMBER}`}
                  className="inline-flex items-center justify-center gap-2 hover:text-white"
                >
                  <Phone size={16} /> {PHONE_DISPLAY}
                </a>
                <a
                  href={`mailto:${SUPPORT_EMAIL}`}
                  className="inline-flex items-center justify-center gap-2 hover:text-white"
                >
                  <Mail size={16} /> {SUPPORT_EMAIL}
                </a>
              </div>
            </div>
          </motion.div>

          {/* Growth path for existing vendors */}
          <p className="text-center text-gray-600 mt-8 max-w-2xl mx-auto">
            Already selling on OJA247? When your business outgrows its storefront,
            we build your own website and keep looking after it.
          </p>
        </div>
      </section>
    </div>
  );
};

export default CustomWebsitesPage;