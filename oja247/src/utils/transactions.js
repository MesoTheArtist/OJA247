    import mongoose from "mongoose";

// Runs `work(session)` as ONE all-or-nothing MongoDB transaction.
//
// Why this exists: several money movements here change a balance AND write a
// ledger line (withdraw points, spend points on a plan, credit a referral
// reward, refund a rejected withdrawal). Done as two separate writes, a crash
// or a failed second write leaves the balance changed with no record, or a
// record with no balance change. In a transaction either both happen or
// neither does.
//
// Every query inside `work` must be given the `session` it receives, e.g.
//   Business.findOneAndUpdate(filter, update, { new: true, session })
//   Model.create([doc], { session })        // create needs the array form
//
// MongoDB may call `work` again if it hits a transient error, so keep it free
// of side effects other than database writes (no emails in here).
//
// Throw from `work` to abort: nothing it wrote is kept and the error is
// re-thrown to the caller.
export async function runInTransaction(work) {
  const session = await mongoose.startSession();
  try {
    let result;
    await session.withTransaction(async () => {
      result = await work(session);
    });
    return result;
  } finally {
    await session.endSession();
  }
}

// A business rule that stopped a money movement (not a crash). Handlers turn
// this into a clear 4xx for the user instead of a generic 500.
export class MoneyRuleError extends Error {
  constructor(message, status = 400) {
    super(message);
    this.name = "MoneyRuleError";
    this.status = status;
  }
}