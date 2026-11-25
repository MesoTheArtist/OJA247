// Small pure helpers for notifications: building the message Firebase wants,
// and spotting phone addresses that no longer work.

export function buildMulticastMessage(tokens, payload) {
  const { title, body, data } = payload || {};
  // Firebase only accepts text values in "data".
  const safeData = {};
  for (const [key, value] of Object.entries(data || {})) {
    if (value === undefined || value === null) continue;
    safeData[String(key)] = String(value);
  }
  return {
    tokens: [...tokens],
    notification: {
      title: String(title || "OJA247").slice(0, 100),
      body: String(body || "").slice(0, 300),
    },
    data: safeData,
    android: { priority: "high" },
  };
}

// Firebase answers per phone. These two codes mean the address is dead
// (the app was removed, or the address was replaced), so it is deleted.
const DEAD_CODES = new Set([
  "messaging/registration-token-not-registered",
  "messaging/invalid-registration-token",
]);

export function deadTokens(tokens, responses) {
  const dead = [];
  (responses || []).forEach((response, index) => {
    if (response && !response.success && response.error && DEAD_CODES.has(response.error.code)) {
      dead.push(tokens[index]);
    }
  });
  return dead;
}