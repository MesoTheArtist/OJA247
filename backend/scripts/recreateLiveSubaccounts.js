// One-time migration after switching Paystack from test keys to live keys.
//
// Paystack subaccounts are per-mode: a subaccount created while you were on
// sk_test_ keys does not exist under your sk_live_ key, so store orders for
// those vendors fail at checkout. Re-saving the payout form does NOT fix it
// (a resubmission reuses the stored subaccount code). This script checks every
// vendor's stored subaccount against Paystack LIVE and recreates the missing
// ones from the bank details already on the Vendor record.
//
// Run from your backend folder, with PAYSTACK_SECRET_KEY set to the LIVE key
// in backend/.env (or exported in your shell):
//   node scripts/recreateLiveSubaccounts.js           -> dry run: lists status per vendor, changes nothing
//   node scripts/recreateLiveSubaccounts.js --apply   -> creates live subaccounts and saves the new codes
//
// Safe to run more than once: vendors whose subaccount already exists in live
// are left alone. A vendor whose recreate fails (e.g. Paystack can't resolve
// the account number) is reported and skipped, and the rest carry on.

// Same DNS workaround as server.js / backfillSlugs.js for MongoDB Atlas SRV.
import dns from "node:dns";
dns.setServers(["8.8.8.8", "8.8.4.4"]);

import dotenv from "dotenv";
dotenv.config();

import axios from "axios";
import mongoose from "mongoose";
import { connectDB } from "../src/db.js";
import Vendor from "../src/models/Vendor.js";

const APPLY = process.argv.includes("--apply");
const KEY = process.env.PAYSTACK_SECRET_KEY || "";
const headers = { Authorization: `Bearer ${KEY}`, "Content-Type": "application/json" };

const run = async () => {
  if (!KEY.startsWith("sk_live_")) {
    console.error(
      "PAYSTACK_SECRET_KEY must be your LIVE key (sk_live_...). Found: " +
        (KEY ? KEY.slice(0, 8) + "..." : "nothing") +
        "\nPut the live key in backend/.env for this run, then try again."
    );
    process.exitCode = 1;
    return;
  }

  await connectDB();
  const vendors = await Vendor.find({}).select(
    "businessName bankCode accountNumber subaccountCode subaccountId"
  );
  console.log(`Checking ${vendors.length} vendor(s) against Paystack LIVE...\n`);

  const missing = [];
  let okCount = 0;

  for (const v of vendors) {
    try {
      await axios.get(`https://api.paystack.co/subaccount/${v.subaccountCode}`, { headers });
      okCount += 1;
      console.log(`  OK       ${v.businessName} (${v.subaccountCode})`);
    } catch (err) {
      const code = err.response?.status;
      if (code === 404) {
        missing.push(v);
        console.log(`  MISSING  ${v.businessName} (${v.subaccountCode}) — not found in live`);
      } else if (code === 401) {
        console.error("\nPaystack rejected the key (401). Stopping — nothing was changed.");
        process.exitCode = 1;
        return;
      } else {
        console.log(`  UNKNOWN  ${v.businessName} (${v.subaccountCode}) — ${code || err.message}, skipped`);
      }
    }
  }

  console.log(`\n${okCount} fine, ${missing.length} missing in live.`);
  if (missing.length === 0) return;

  if (!APPLY) {
    console.log("Dry run only — nothing changed. Re-run with --apply to recreate the missing ones.");
    return;
  }

  const percentage = process.env.PLATFORM_PERCENTAGE_CHARGE || 10;
  let fixed = 0;
  for (const v of missing) {
    try {
      const { data } = await axios.post(
        "https://api.paystack.co/subaccount",
        {
          business_name: v.businessName,
          bank_code: v.bankCode,
          account_number: v.accountNumber,
          percentage_charge: percentage,
        },
        { headers }
      );
      const created = data.data;
      await Vendor.updateOne(
        { _id: v._id },
        { subaccountCode: created.subaccount_code, subaccountId: created.id ? String(created.id) : "" }
      );
      fixed += 1;
      console.log(`  FIXED    ${v.businessName}: ${v.subaccountCode} -> ${created.subaccount_code}`);
    } catch (err) {
      console.log(
        `  FAILED   ${v.businessName}: ${err.response?.data?.message || err.message} (left unchanged)`
      );
    }
  }
  console.log(`\nDone. Recreated ${fixed} of ${missing.length}.`);
};

run()
  .catch((err) => {
    console.error("Script failed:", err);
    process.exitCode = 1;
  })
  .finally(() => mongoose.connection.close());