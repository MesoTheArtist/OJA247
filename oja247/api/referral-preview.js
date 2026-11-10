// /business-form?ref=CODE -> the normal app, with a preview that sells the
// sign-up: "Open your online store on OJA247" and, when a referral code is in
// the link and the admin has a free trial switched on, how many days are free.
import { SITE, FALLBACK_IMAGE, fetchJson, loadShell, hostOf, applyPreview, sendHtml, sendUnavailable } from "./_lib/preview.js";

export default async function handler(req, res) {
  let shell;
  try {
    shell = await loadShell(hostOf(req));
  } catch {
    return sendUnavailable(res);
  }

  const rawRef = String(req.query.ref || "").trim();
  const ref = /^[\w-]{1,40}$/.test(rawRef) ? rawRef : "";

  // Only promise free days when the link carries a code AND the trial is on.
  const settings = ref ? await fetchJson("/api/settings/public") : null;
  const days = Number(settings?.referralTrialDays) || 0;
  const free = ref && days > 0;

  const html = applyPreview(shell, {
    title: free
      ? `Open your online store on OJA247 - ${days} day${days === 1 ? "" : "s"} free`
      : "Open your online store on OJA247",
    description: free
      ? `Sign up with this referral link and get ${days} day${days === 1 ? "" : "s"} free, no payment needed. Set up your store in minutes and start selling to customers across Nigeria.`
      : "Set up your store in minutes and start selling to customers across Nigeria. OJA247 handles the setup and the upkeep.",
    url: `${SITE}/business-form${ref ? `?ref=${encodeURIComponent(ref)}` : ""}`,
    image: { url: FALLBACK_IMAGE, padded: false },
    extra: [`<meta property="og:type" content="website" />`],
  });
  return sendHtml(res, html, { cache: free ? "public, s-maxage=300, stale-while-revalidate=600" : "public, s-maxage=3600" });
}
