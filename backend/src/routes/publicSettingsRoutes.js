import express from "express";
import PlatformSettings from "../models/PlatformSettings.js";

const router = express.Router();

// GET /api/settings/public
// The few global switches the public site needs to read. No login: it only
// ever returns non-sensitive booleans. Cached briefly so ad pages do not hit
// the database on every view; an admin change shows up within about a minute.
router.get("/public", async (req, res) => {
  try {
    const settings = await PlatformSettings.getSettings();
    res.set("Cache-Control", "public, max-age=60");
    res.json({ adsEnabled: settings.adsEnabled !== false });
  } catch (error) {
    console.error("Request failed:", error);
    res.status(500).json({ message: "Something went wrong. Please try again." });
  }
});

export default router;
