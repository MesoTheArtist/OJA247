// How long payment receipts are kept before the FILE is deleted from storage.
// (The order record itself stays; only the receipt image or PDF goes.)
// The same numbers are described in oja247/src/content/legal/privacy.md, so
// change both together.
export const RETENTION = {
  // A confirmed order: delete this many days after the vendor confirmed it...
  confirmedReceiptDays: 180,
  // ...unless it ever had a dispute, then keep until this many days after the
  // dispute was last touched.
  withDisputeDays: 365,
  // Orders that were never paid (rejected or cancelled): delete this many days
  // after they were last updated.
  unpaidReceiptDays: 90,
  // Orders handled per daily run, so one run never takes too long. Anything
  // left over is picked up the next day.
  batchSize: 40,
};