// Refuses any request that carries MongoDB operator keys ("$ne", "$gt",
// "$regex", ...) in its query string, URL parameters or JSON body.
//
// Why: Express turns ?reference[$ne]=x into { reference: { $ne: "x" } }, and
// several handlers pass request values straight into database lookups, so an
// attacker could send an operator where a plain string is expected and match
// records they should not be able to reach. No real request from this site
// contains a key that starts with "$", so rejecting them costs nothing.
function hasOperatorKey(value, depth = 0) {
  if (value === null || typeof value !== "object" || depth > 10) return false;
  for (const key of Object.keys(value)) {
    if (key.startsWith("$")) return true;
    if (hasOperatorKey(value[key], depth + 1)) return true;
  }
  return false;
}

export function rejectMongoOperators(req, res, next) {
  if (hasOperatorKey(req.query) || hasOperatorKey(req.params) || hasOperatorKey(req.body)) {
    return res.status(400).json({ message: "Invalid request." });
  }
  next();
}