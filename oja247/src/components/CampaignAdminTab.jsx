import React, { useEffect, useMemo, useRef, useState } from "react";
import { Mail, Send, RefreshCw, Users, Store, UserCog } from "lucide-react";
import axiosInstance from "../services/api";

// Ready-made starting points. {{name}} becomes each person's first name
// (or "there" if we don't have one). Edit freely after picking one.
const PRESETS = [
  { id: "custom", label: "Write my own", subject: "", body: "" },
  {
    id: "christmas",
    label: "Christmas",
    subject: "Merry Christmas from OJA247 🎄",
    body: "Hi {{name}},\n\nMerry Christmas from all of us at OJA247! Thank you for being part of our community this year.\n\nWe wish you and your family joy, rest and a wonderful festive season.",
  },
  {
    id: "new-year",
    label: "New Year",
    subject: "Happy New Year from OJA247 🎉",
    body: "Hi {{name}},\n\nHappy New Year! Thank you for being part of OJA247. We're excited about what's coming and glad to have you with us.\n\nHere's to a great year ahead.",
  },
  {
    id: "eid",
    label: "Eid",
    subject: "Eid Mubarak from OJA247",
    body: "Hi {{name}},\n\nEid Mubarak from everyone at OJA247! We wish you and your loved ones peace, joy and blessings.",
  },
  {
    id: "independence",
    label: "Independence Day",
    subject: "Happy Independence Day from OJA247 🇳🇬",
    body: "Hi {{name}},\n\nHappy Independence Day! We're proud to support Nigerian businesses and the people who shop with them. Thank you for being part of that.",
  },
  {
    id: "maintenance",
    label: "Maintenance notice",
    subject: "Scheduled maintenance on OJA247",
    body: "Hi {{name}},\n\nOJA247 will be briefly unavailable for scheduled maintenance on [date] from [start time] to [end time].\n\nNothing you need to do. Orders and payments already in progress won't be affected. Thanks for your patience.",
  },
  {
    id: "feature",
    label: "New feature",
    subject: "New on OJA247: [feature name]",
    body: "Hi {{name}},\n\nWe've just launched [feature name]. [One or two sentences on what it does and why it helps.]\n\nWe'd love to hear what you think.",
  },
  {
    id: "promo",
    label: "Promotion / sale",
    subject: "[Offer] on OJA247 this week",
    body: "Hi {{name}},\n\n[Describe the offer, who it's for, and when it ends.]\n\nDon't miss it.",
  },
];

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
      setSubject(p.subject);
      setBody(p.body);
    }
  };

  const content = () => ({ subject, body, ctaLabel, ctaUrl });
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
          className="w-full sm:w-72 mb-4 px-3 py-2 text-sm border border-gray-200 rounded-xl focus:ring-2 focus:ring-green-500 focus:border-transparent"
        >
          {PRESETS.map((p) => (
            <option key={p.id} value={p.id}>
              {p.label}
            </option>
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