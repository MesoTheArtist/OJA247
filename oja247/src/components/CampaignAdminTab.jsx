import React, { useEffect, useMemo, useRef, useState } from "react";
import { Mail, Send, RefreshCw, Users, Store, UserCog } from "lucide-react";
import axiosInstance from "../services/api";
import ImageUpload from "./ImageUpload";

// Ready-made starting points. {{name}} becomes each person's first name
// (or "there" if we don't have one), filled in per recipient when sent.
// __MONTH__, __YEAR__ and __CURYEAR__ are filled in with today's month /
// the coming New Year / this year the moment you pick the preset. Edit
// freely after picking one. Anything in [square brackets] is a blank for you
// to fill in, and the page warns you if any are left.
//
// "when" is only a hint shown in the list. The Muslim holidays (Eid-el-Fitr,
// Eid-el-Kabir, Eid-el-Maulud) are declared by the Federal Government after
// the moon is sighted, and Easter moves every year, so check the official
// announcement for the date.
const SHOP_URL = "https://oja247.store/explore";

const PRESETS = [
  { id: "custom", group: "", label: "Write my own", subject: "", body: "" },

  // --- Nigerian public holidays ---
  {
    id: "new-year",
    group: "Public holidays",
    label: "New Year's Day",
    when: "Jan 1",
    subject: "Happy New Year __YEAR__ from OJA247 🎉",
    body: "Hi {{name}},\n\nHappy New Year! Thank you for being part of OJA247. We're excited about what's coming in __YEAR__ and glad to have you with us.\n\nHere's to a great year ahead.",
  },
  {
    id: "good-friday",
    group: "Public holidays",
    label: "Good Friday",
    when: "Date varies (Mar/Apr)",
    subject: "Wishing you a peaceful Good Friday",
    body: "Hi {{name}},\n\nWishing you a quiet, reflective Good Friday. From all of us at OJA247, we hope you have a peaceful day with your loved ones.",
  },
  {
    id: "easter",
    group: "Public holidays",
    label: "Easter (Sunday & Monday)",
    when: "Date varies (Mar/Apr)",
    subject: "Happy Easter from OJA247 🐣",
    body: "Hi {{name}},\n\nHappy Easter from everyone at OJA247! We hope the weekend brings you joy, good food and time with the people you love.\n\nThank you for being part of our community.",
  },
  {
    id: "eid-fitr",
    group: "Public holidays",
    label: "Eid-el-Fitr",
    when: "Date varies (moon sighting)",
    subject: "Eid-el-Fitr Mubarak from OJA247 🌙",
    body: "Hi {{name}},\n\nEid Mubarak! We wish you and your loved ones a joyful Eid-el-Fitr filled with peace, blessings and good company.\n\nThank you for being part of OJA247.",
  },
  {
    id: "workers-day",
    group: "Public holidays",
    label: "Workers' Day",
    when: "May 1",
    subject: "Happy Workers' Day from OJA247",
    body: "Hi {{name}},\n\nHappy Workers' Day! Today we celebrate everyone who works hard, especially the business owners on OJA247 who keep this marketplace alive.\n\nEnjoy the public holiday and get some well-earned rest.",
  },
  {
    id: "democracy-day",
    group: "Public holidays",
    label: "Democracy Day",
    when: "Jun 12",
    subject: "Happy Democracy Day from OJA247 🇳🇬",
    body: "Hi {{name}},\n\nHappy Democracy Day! Today marks Nigeria's return to democratic rule, and we're proud to be part of this country and its people.\n\nWe wish you a restful public holiday.",
  },
  {
    id: "eid-kabir",
    group: "Public holidays",
    label: "Eid-el-Kabir",
    when: "Date varies (moon sighting)",
    subject: "Eid-el-Kabir Mubarak from OJA247 🐏",
    body: "Hi {{name}},\n\nEid-el-Kabir Mubarak! We wish you and your family a blessed celebration filled with peace, generosity and joy.\n\nThank you for being part of OJA247.",
  },
  {
    id: "maulud",
    group: "Public holidays",
    label: "Eid-el-Maulud (Prophet's birthday)",
    when: "Date varies (moon sighting)",
    subject: "Eid-el-Maulud greetings from OJA247",
    body: "Hi {{name}},\n\nWishing our Muslim community a peaceful and blessed Eid-el-Maulud. We hope the day brings you and your family joy and reflection.",
  },
  {
    id: "independence",
    group: "Public holidays",
    label: "Independence Day",
    when: "Oct 1",
    subject: "Happy Independence Day from OJA247 🇳🇬",
    body: "Hi {{name}},\n\nHappy Independence Day, Nigeria! We're proud to support Nigerian businesses and the people who shop with them, and thank you for being part of that.\n\nEnjoy the holiday.",
  },
  {
    id: "christmas",
    group: "Public holidays",
    label: "Christmas Day",
    when: "Dec 25",
    subject: "Merry Christmas from OJA247 🎄",
    body: "Hi {{name}},\n\nMerry Christmas from all of us at OJA247! Thank you for being part of our community this year.\n\nWe wish you and your family joy, rest and a wonderful festive season.",
  },
  {
    id: "boxing-day",
    group: "Public holidays",
    label: "Boxing Day",
    when: "Dec 26",
    subject: "Happy Boxing Day from OJA247",
    body: "Hi {{name}},\n\nWe hope your Christmas was a wonderful one. Enjoy the rest of the holiday with family and friends.\n\nFrom everyone at OJA247.",
  },

  // --- Other widely celebrated days ---
  {
    id: "new-month",
    group: "Celebrations & seasons",
    label: "Happy New Month",
    when: "1st of every month",
    subject: "Happy New Month! __MONTH__ is here 🎉",
    body: "Hi {{name}},\n\nHappy new month! May __MONTH__ bring you good sales, good health and good news.\n\nFrom all of us at OJA247.",
  },
  {
    id: "ramadan",
    group: "Celebrations & seasons",
    label: "Start of Ramadan",
    when: "Date varies (moon sighting)",
    subject: "Ramadan Kareem from OJA247 🌙",
    body: "Hi {{name}},\n\nWishing everyone observing Ramadan a blessed month of reflection, patience and peace. Ramadan Kareem from all of us at OJA247.",
  },
  {
    id: "valentines",
    group: "Celebrations & seasons",
    label: "Valentine's Day",
    when: "Feb 14",
    subject: "Happy Valentine's Day from OJA247 ❤️",
    body: "Hi {{name}},\n\nHappy Valentine's Day! Looking for something special for someone you love? You'll find gifts from local businesses across Nigeria on OJA247.",
    ctaLabel: "Browse gifts",
    ctaUrl: SHOP_URL,
  },
  {
    id: "childrens-day",
    group: "Celebrations & seasons",
    label: "Children's Day",
    when: "May 27",
    subject: "Happy Children's Day from OJA247 🎈",
    body: "Hi {{name}},\n\nHappy Children's Day! It's a good day to treat the little ones in your life. Browse stores across OJA247 for clothes, toys and treats.",
    ctaLabel: "Browse stores",
    ctaUrl: SHOP_URL,
  },
  {
    id: "mothers-day",
    group: "Celebrations & seasons",
    label: "Mother's Day",
    when: "Varies by year (May)",
    subject: "Happy Mother's Day from OJA247 💐",
    body: "Hi {{name}},\n\nHappy Mother's Day to all the mothers in our community! If you're looking for a thoughtful gift for the mother in your life, local businesses on OJA247 have plenty of ideas.",
    ctaLabel: "Find a gift",
    ctaUrl: SHOP_URL,
  },
  {
    id: "fathers-day",
    group: "Celebrations & seasons",
    label: "Father's Day",
    when: "Varies by year (June)",
    subject: "Happy Father's Day from OJA247 👔",
    body: "Hi {{name}},\n\nHappy Father's Day to all the fathers in our community! Looking for a gift for the dad in your life? Take a look at what local businesses on OJA247 have to offer.",
    ctaLabel: "Find a gift",
    ctaUrl: SHOP_URL,
  },
  {
    id: "black-friday",
    group: "Celebrations & seasons",
    label: "Black Friday",
    when: "Day after US Thanksgiving (Nov)",
    subject: "Black Friday weekend on OJA247",
    body: "Hi {{name}},\n\nIt's Black Friday weekend! Many stores on OJA247 run special offers around now, so it's a good time to browse and see what you find.",
    ctaLabel: "Start browsing",
    ctaUrl: SHOP_URL,
  },
  {
    id: "year-end",
    group: "Celebrations & seasons",
    label: "Year-end thank you",
    when: "Late December",
    subject: "Thank you for __CURYEAR__ from OJA247",
    body: "Hi {{name}},\n\nAs __CURYEAR__ comes to a close, we want to say thank you for being part of OJA247 this year. Whether you shopped, sold or shared us with a friend, you helped us grow.\n\nWe wish you a restful end to the year and a great start to the next.",
  },

  // --- Platform notices ---
  {
    id: "maintenance",
    group: "Platform notices",
    label: "Maintenance notice",
    subject: "Scheduled maintenance on OJA247",
    body: "Hi {{name}},\n\nOJA247 will be briefly unavailable for scheduled maintenance on [date] from [start time] to [end time].\n\nNothing you need to do. Orders and payments already in progress won't be affected. Thanks for your patience.",
  },
  {
    id: "feature",
    group: "Platform notices",
    label: "New feature",
    subject: "New on OJA247: [feature name]",
    body: "Hi {{name}},\n\nWe've just launched [feature name]. [One or two sentences on what it does and why it helps.]\n\nWe'd love to hear what you think.",
  },
  {
    id: "promo",
    group: "Platform notices",
    label: "Promotion / sale",
    subject: "[Offer] on OJA247 this week",
    body: "Hi {{name}},\n\n[Describe the offer, who it's for, and when it ends.]\n\nDon't miss it.",
  },
  {
    id: "thanks",
    group: "Platform notices",
    label: "General thank you",
    subject: "Thank you from OJA247",
    body: "Hi {{name}},\n\nJust a quick note to say thank you for being part of OJA247. Your support helps local businesses grow, and we're grateful for it.",
  },
];

// Fills the date-based blanks the moment a preset is picked, so the text
// reads correctly today (e.g. the right month for "Happy New Month").
function fillDateTokens(text) {
  const now = new Date();
  const month = now.toLocaleString("en-NG", { month: "long" });
  // In December the "New Year" message is for the year about to start.
  const newYear = now.getMonth() === 11 ? now.getFullYear() + 1 : now.getFullYear();
  return String(text)
    .replace(/__MONTH__/g, month)
    .replace(/__YEAR__/g, String(newYear))
    .replace(/__CURYEAR__/g, String(now.getFullYear()));
}

const PRESET_GROUPS = ["Public holidays", "Celebrations & seasons", "Platform notices"];

const AUDIENCE_OPTIONS = [
  { id: "customers", label: "Customers", icon: Users },
  { id: "vendors", label: "Vendors", icon: Store },
  { id: "marketers", label: "Marketers", icon: UserCog },
];

const STATUS_STYLES = {
  draft: "bg-gray-100 text-gray-600",
  sending: "bg-blue-100 text-blue-700",
  paused: "bg-yellow-100 text-yellow-700",
  sent: "bg-green-100 text-green-700",
};

const errMsg = (err, fallback) => err?.response?.data?.message || fallback;

// Admin's Emails tab: write an announcement for an occasion, check it with
// a test email, and send it to customers / vendors / marketers. Sending
// happens a few recipients at a time (the backend caps each batch and the
// day's total), and this page keeps asking for the next batch until done.
const CampaignAdminTab = ({ showToast }) => {
  const [audience, setAudience] = useState({ customers: true, vendors: false, marketers: false });
  const [counts, setCounts] = useState(null);
  const [preset, setPreset] = useState("custom");
  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");
  const [ctaLabel, setCtaLabel] = useState("");
  const [ctaUrl, setCtaUrl] = useState("");
  const [imageUrl, setImageUrl] = useState("");
  const [history, setHistory] = useState([]);
  const [testing, setTesting] = useState(false);
  const [running, setRunning] = useState(null); // { id, subject, sent, failed, total, status }
  const cancelRef = useRef(false);

  const selected = useMemo(() => Object.keys(audience).filter((k) => audience[k]), [audience]);
  const recipientEstimate = useMemo(
    () => (counts ? selected.reduce((sum, k) => sum + (counts[k] || 0), 0) : 0),
    [counts, selected]
  );

  const loadCounts = async () => {
    try {
      const res = await axiosInstance.get("/api/admin/campaigns/audience");
      setCounts(res.data);
    } catch (err) {
      showToast(errMsg(err, "Couldn't load audience sizes."), "error");
    }
  };
  const loadHistory = async () => {
    try {
      const res = await axiosInstance.get("/api/admin/campaigns");
      setHistory(res.data.campaigns || []);
    } catch (err) {
      showToast(errMsg(err, "Couldn't load past emails."), "error");
    }
  };

  useEffect(() => {
    loadCounts();
    loadHistory();
    return () => {
      cancelRef.current = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const applyPreset = (id) => {
    setPreset(id);
    const p = PRESETS.find((x) => x.id === id);
    if (p && id !== "custom") {
      setSubject(fillDateTokens(p.subject));
      setBody(fillDateTokens(p.body));
      // Shopping-themed presets bring a button; everything else clears it
      // so a previous preset's button never rides along by accident.
      setCtaLabel(p.ctaLabel || "");
      setCtaUrl(p.ctaUrl || "");
      // No preset defines a flyer image today, so switching presets always
      // clears whatever image was attached — same reasoning as the CTA
      // button just above: a leftover image from a different occasion
      // shouldn't silently ride along.
      setImageUrl(p.imageUrl || "");
    }
  };

  const content = () => ({ subject, body, ctaLabel, ctaUrl, imageUrl });
  const contentProblem = () => {
    if (!subject.trim()) return "Add a subject.";
    if (!body.trim()) return "Write the message.";
    if (ctaUrl && !/^https:\/\//i.test(ctaUrl)) return "The button link must start with https://";
    if (ctaUrl && !ctaLabel.trim()) return "Add a label for the button, or clear the link.";
    return null;
  };
  const leftoverPlaceholders = /\[[^\]]+\]/.test(subject + body);

  const sendTest = async () => {
    const problem = contentProblem();
    if (problem) return showToast(problem, "error");
    setTesting(true);
    try {
      const res = await axiosInstance.post("/api/admin/campaigns/test", content());
      showToast(`Test email sent to ${res.data.sentTo}.`);
    } catch (err) {
      showToast(errMsg(err, "Couldn't send the test email."), "error");
    } finally {
      setTesting(false);
    }
  };

  // Keeps requesting batches until the campaign finishes, pauses at the
  // daily cap, or the admin leaves the page.
  const drive = async (id, subjectLabel) => {
    cancelRef.current = false;
    setRunning({ id, subject: subjectLabel, sent: 0, failed: 0, total: 0, status: "sending" });
    try {
      // eslint-disable-next-line no-constant-condition
      while (true) {
        if (cancelRef.current) return;
        const res = await axiosInstance.post(`/api/admin/campaigns/${id}/send-batch`);
        const c = res.data.campaign;
        setRunning({ id, subject: subjectLabel, sent: c.sentCount, failed: c.failedCount, total: c.totalRecipients, status: c.status });
        if (res.data.done) {
          showToast(`Sent to ${c.sentCount} of ${c.totalRecipients} people.`);
          break;
        }
        if (res.data.paused) {
          showToast("Paused at today's sending limit. Press Continue tomorrow.", "error");
          break;
        }
      }
    } catch (err) {
      showToast(errMsg(err, "Sending stopped. You can continue it from the list below."), "error");
    } finally {
      setRunning(null);
      loadHistory();
      loadCounts();
    }
  };

  const startCampaign = async () => {
    const problem = contentProblem();
    if (problem) return showToast(problem, "error");
    if (selected.length === 0) return showToast("Pick at least one audience.", "error");

    const ok = window.confirm(
      `Send "${subject}" to about ${recipientEstimate} ${recipientEstimate === 1 ? "person" : "people"}?\n\nThis can't be undone once it starts.`
    );
    if (!ok) return;

    try {
      const res = await axiosInstance.post("/api/admin/campaigns", {
        occasion: preset === "custom" ? "" : PRESETS.find((p) => p.id === preset)?.label,
        ...content(),
        audiences: selected,
      });
      const c = res.data.campaign;
      await drive(c._id, c.subject);
    } catch (err) {
      showToast(errMsg(err, "Couldn't start the send."), "error");
    }
  };

  const continueCampaign = (c) => drive(c._id, c.subject);

  const retryFailed = async (c) => {
    try {
      const res = await axiosInstance.post(`/api/admin/campaigns/${c._id}/retry`);
      if (res.data.requeued === 0) return showToast("Nothing to retry.");
      await drive(c._id, c.subject);
    } catch (err) {
      showToast(errMsg(err, "Couldn't retry."), "error");
    }
  };

  const sampleName = "Ada";
  const previewParas = body
    .replace(/\{\{\s*name\s*\}\}/gi, sampleName)
    .split(/\n{2,}/)
    .map((x) => x.trim())
    .filter(Boolean);

  const pct = running && running.total > 0 ? Math.round(((running.sent + running.failed) / running.total) * 100) : 0;

  return (
    <div className="space-y-6">
      <div className="rounded-2xl border border-gray-200 bg-white p-4 sm:p-6">
        <div className="flex flex-wrap items-center justify-between gap-2 mb-4">
          <h2 className="text-lg font-bold text-gray-900 flex items-center gap-2">
            <Mail size={18} /> Send an announcement
          </h2>
          {counts && (
            <span className="text-xs text-gray-500">
              Sent today: {counts.sentToday} / {counts.dailyCap} daily limit
            </span>
          )}
        </div>

        <p className="text-sm font-semibold text-gray-700 mb-2">Who should get it?</p>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 mb-5">
          {AUDIENCE_OPTIONS.map(({ id, label, icon: Icon }) => (
            <label
              key={id}
              className={`flex items-center gap-3 rounded-xl border px-4 py-3 cursor-pointer transition ${
                audience[id] ? "border-green-500 bg-green-50" : "border-gray-200 hover:bg-gray-50"
              }`}
            >
              <input
                type="checkbox"
                checked={audience[id]}
                onChange={(e) => setAudience((a) => ({ ...a, [id]: e.target.checked }))}
                className="accent-green-600"
              />
              <Icon size={16} className="text-gray-500 shrink-0" />
              <span className="text-sm font-medium text-gray-800">{label}</span>
              <span className="ml-auto text-xs text-gray-500">{counts ? counts[id] : "…"}</span>
            </label>
          ))}
        </div>
        <p className="text-xs text-gray-400 -mt-3 mb-5">
          Counts only include people who can be emailed: not banned, haven't unsubscribed, and (for customers) a
          confirmed email address. Someone in two groups gets one email.
        </p>

        <label className="block text-sm font-semibold text-gray-700 mb-1">Occasion</label>
        <select
          value={preset}
          onChange={(e) => applyPreset(e.target.value)}
          className="w-full sm:w-96 max-w-full mb-4 px-3 py-2 text-sm border border-gray-200 rounded-xl focus:ring-2 focus:ring-green-500 focus:border-transparent"
        >
          <option value="custom">Write my own</option>
          {PRESET_GROUPS.map((group) => (
            <optgroup key={group} label={group}>
              {PRESETS.filter((p) => p.group === group).map((p) => (
                <option key={p.id} value={p.id}>
                  {p.label}
                  {p.when ? ` · ${p.when}` : ""}
                </option>
              ))}
            </optgroup>
          ))}
        </select>

        <label className="block text-sm font-semibold text-gray-700 mb-1">Subject</label>
        <input
          value={subject}
          onChange={(e) => setSubject(e.target.value)}
          maxLength={150}
          placeholder="e.g. Merry Christmas from OJA247"
          className="w-full mb-4 px-3 py-2 text-sm border border-gray-200 rounded-xl focus:ring-2 focus:ring-green-500 focus:border-transparent"
        />

        <label className="block text-sm font-semibold text-gray-700 mb-1">Message</label>
        <textarea
          value={body}
          onChange={(e) => setBody(e.target.value)}
          rows={8}
          maxLength={5000}
          placeholder={"Hi {{name}},\n\nYour message here. Leave a blank line between paragraphs."}
          className="w-full px-3 py-2 text-sm border border-gray-200 rounded-xl focus:ring-2 focus:ring-green-500 focus:border-transparent"
        />
        <p className="text-xs text-gray-400 mt-1 mb-4">
          <code>{"{{name}}"}</code> becomes each person's first name. Plain text only, so formatting codes show as typed.
        </p>

        <div className="mb-4">
          <label className="block text-sm font-semibold text-gray-700 mb-1">
            Flyer image <span className="font-normal text-gray-400">(optional)</span>
          </label>
          {imageUrl ? (
            <div className="relative inline-block">
              <img src={imageUrl} alt="" className="max-h-40 rounded-xl border border-gray-200" />
              <button
                type="button"
                onClick={() => setImageUrl("")}
                aria-label="Remove image"
                className="absolute -top-2 -right-2 w-6 h-6 rounded-full bg-gray-800 text-white text-sm leading-none"
              >
                ×
              </button>
            </div>
          ) : (
            <ImageUpload onImagesUploaded={(urls) => setImageUrl(urls[0] || "")} />
          )}
          <p className="text-xs text-gray-400 mt-1">Shown at the top of the email, above the message.</p>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-4">
          <div>
            <label className="block text-sm font-semibold text-gray-700 mb-1">
              Button label <span className="font-normal text-gray-400">(optional)</span>
            </label>
            <input
              value={ctaLabel}
              onChange={(e) => setCtaLabel(e.target.value)}
              maxLength={40}
              placeholder="e.g. Shop now"
              className="w-full px-3 py-2 text-sm border border-gray-200 rounded-xl focus:ring-2 focus:ring-green-500 focus:border-transparent"
            />
          </div>
          <div>
            <label className="block text-sm font-semibold text-gray-700 mb-1">
              Button link <span className="font-normal text-gray-400">(optional)</span>
            </label>
            <input
              value={ctaUrl}
              onChange={(e) => setCtaUrl(e.target.value)}
              placeholder="https://oja247.store/explore"
              className="w-full px-3 py-2 text-sm border border-gray-200 rounded-xl focus:ring-2 focus:ring-green-500 focus:border-transparent"
            />
          </div>
        </div>

        {leftoverPlaceholders && (
          <p className="mb-4 text-sm rounded-xl border border-yellow-200 bg-yellow-50 text-yellow-800 px-3 py-2">
            There are still [bracketed placeholders] in the subject or message. Fill them in before sending.
          </p>
        )}

        {(subject || body) && (
          <div className="mb-5 rounded-xl border border-gray-100 bg-gray-50 p-4">
            <p className="text-xs uppercase tracking-wide text-gray-400 mb-2">Preview for “{sampleName}”</p>
            {imageUrl && <img src={imageUrl} alt="" className="max-h-48 rounded-xl mb-3" />}
            <p className="font-semibold text-gray-900 mb-3 break-words">{subject.replace(/\{\{\s*name\s*\}\}/gi, sampleName)}</p>
            {previewParas.map((para, i) => (
              <p key={i} className="text-sm text-gray-600 mb-2 whitespace-pre-line break-words">
                {para}
              </p>
            ))}
            {ctaLabel && ctaUrl && (
              <span className="inline-block mt-2 px-4 py-2 rounded-lg bg-green-600 text-white text-sm font-semibold">{ctaLabel}</span>
            )}
          </div>
        )}

        <div className="flex flex-col sm:flex-row gap-3">
          <button
            onClick={sendTest}
            disabled={testing || !!running}
            className="w-full sm:w-auto px-5 py-2.5 rounded-xl border border-gray-300 text-gray-700 font-medium hover:bg-gray-50 disabled:opacity-60"
          >
            {testing ? "Sending test…" : "Send a test to me"}
          </button>
          <button
            onClick={startCampaign}
            disabled={!!running || recipientEstimate === 0}
            className="w-full sm:w-auto inline-flex items-center justify-center gap-2 px-5 py-2.5 rounded-xl bg-green-600 hover:bg-green-700 text-white font-semibold disabled:opacity-60"
          >
            <Send size={16} />
            {running ? "Sending…" : `Send to ${recipientEstimate} ${recipientEstimate === 1 ? "person" : "people"}`}
          </button>
        </div>

        {running && (
          <div className="mt-5">
            <div className="flex justify-between text-xs text-gray-500 mb-1">
              <span className="truncate pr-2">{running.subject}</span>
              <span className="shrink-0">
                {running.sent} sent{running.failed ? `, ${running.failed} failed` : ""}
                {running.total ? ` of ${running.total}` : ""}
              </span>
            </div>
            <div className="h-2 rounded-full bg-gray-100 overflow-hidden">
              <div className="h-full bg-green-500 transition-all" style={{ width: `${pct}%` }} />
            </div>
            <p className="text-xs text-gray-400 mt-2">Keep this page open while it sends. If you close it, continue from the list below.</p>
          </div>
        )}
      </div>

      <div className="rounded-2xl border border-gray-200 bg-white">
        <div className="flex items-center justify-between px-4 sm:px-6 py-4 border-b border-gray-100">
          <h3 className="font-bold text-gray-900">Past announcements</h3>
          <button onClick={loadHistory} className="text-gray-400 hover:text-gray-600" aria-label="Refresh">
            <RefreshCw size={16} />
          </button>
        </div>
        {history.length === 0 ? (
          <p className="p-6 text-sm text-gray-500">Nothing sent yet.</p>
        ) : (
          <ul className="divide-y divide-gray-100">
            {history.map((c) => (
              <li key={c._id} className="px-4 sm:px-6 py-4 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                <div className="min-w-0">
                  <p className="font-semibold text-gray-900 break-words">{c.subject}</p>
                  <p className="text-xs text-gray-500 mt-0.5">
                    {c.audiences.join(", ")} · {c.sentCount}/{c.totalRecipients} sent
                    {c.failedCount ? ` · ${c.failedCount} failed` : ""} · {new Date(c.createdAt).toLocaleDateString("en-NG", { day: "numeric", month: "short", year: "numeric" })}
                  </p>
                  {c.status === "paused" && c.pausedReason && <p className="text-xs text-yellow-700 mt-1">{c.pausedReason}</p>}
                </div>
                <div className="flex flex-wrap items-center gap-2 shrink-0">
                  <span className={`text-xs font-bold px-3 py-1 rounded-full ${STATUS_STYLES[c.status] || "bg-gray-100 text-gray-600"}`}>{c.status}</span>
                  {(c.status === "sending" || c.status === "paused") && (
                    <button
                      onClick={() => continueCampaign(c)}
                      disabled={!!running}
                      className="text-xs font-semibold px-3 py-1.5 rounded-lg bg-green-600 hover:bg-green-700 text-white disabled:opacity-60"
                    >
                      Continue
                    </button>
                  )}
                  {c.failedCount > 0 && (
                    <button
                      onClick={() => retryFailed(c)}
                      disabled={!!running}
                      className="text-xs font-semibold px-3 py-1.5 rounded-lg border border-gray-300 text-gray-700 hover:bg-gray-50 disabled:opacity-60"
                    >
                      Retry failed
                    </button>
                  )}
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
};

export default CampaignAdminTab;