import axios from "axios";

// NIN lookup through Dojah (a licensed NIMC data provider).
//
// Env vars (all server-side only — never expose the secret key to the frontend):
//   DOJAH_APP_ID      from Dojah dashboard > Developers > Configuration > My Apps
//   DOJAH_SECRET_KEY  same place
//   DOJAH_BASE_URL    https://sandbox.dojah.io while testing (the default is live:
//                     https://api.dojah.io, which bills your Dojah wallet per call)
//
// If DOJAH_APP_ID / DOJAH_SECRET_KEY aren't set the check is simply skipped, so
// this can be deployed before the keys exist without breaking vendor onboarding.

const DEFAULT_BASE_URL = "https://api.dojah.io";

export const isNinCheckEnabled = () => Boolean(process.env.DOJAH_APP_ID && process.env.DOJAH_SECRET_KEY);

const tokens = (s) =>
  String(s || "")
    .toLowerCase()
    .replace(/[^a-z\s]/g, " ")
    .split(/\s+/)
    .filter(Boolean);

// True when the NIN holder's first name AND surname both appear in the bank
// account name, in any order (banks print names as "SURNAME FIRST" or
// "FIRST MIDDLE SURNAME"). Returns null when we don't have a name to compare.
export function ninNameMatchesAccount({ firstName, lastName }, accountName) {
  const first = tokens(firstName)[0];
  const last = tokens(lastName)[0];
  if (!first || !last) return null;
  const account = new Set(tokens(accountName));
  return account.has(first) && account.has(last);
}

// Returns { status, firstName, lastName, middleName }
//   status "verified"    — NIN exists in the NIMC database
//   status "not_found"   — provider says no such NIN (reject the submission)
//   status "unavailable" — provider/keys/wallet/NIMC problem (don't block the vendor)
//   status "skipped"     — keys not configured
export async function verifyNin(nin) {
  if (!isNinCheckEnabled()) return { status: "skipped" };

  try {
    const response = await axios.get(`${process.env.DOJAH_BASE_URL || DEFAULT_BASE_URL}/api/v1/kyc/nin`, {
      params: { nin },
      headers: {
        AppId: process.env.DOJAH_APP_ID,
        Authorization: process.env.DOJAH_SECRET_KEY,
      },
      timeout: 10000,
    });

    const entity = response.data?.entity;
    if (!entity) return { status: "unavailable" };

    // Field names tolerated both ways until confirmed against your sandbox response.
    return {
      status: "verified",
      firstName: entity.firstname || entity.first_name || "",
      middleName: entity.middlename || entity.middle_name || "",
      lastName: entity.surname || entity.last_name || entity.lastname || "",
    };
  } catch (error) {
    const code = error.response?.status;
    if (code === 404) return { status: "not_found" };
    // 401 = wrong keys or sandbox/live mix-up, 402 = Dojah wallet empty,
    // 424 = NIMC down. None of these are the vendor's fault.
    console.error("NIN verification unavailable:", code, error.response?.data || error.message);
    return { status: "unavailable" };
  }
}