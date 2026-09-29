import mongoose from "mongoose";
import Business from "../models/Business.js";
import Review from "../models/Review.js";

// Recomputes Business.rating/reviewCount for one vendor from its current
// reviews. Called after a review is created — replies don't change the
// number, so they don't call this. Business.rating is stored rounded to one
// decimal (matches the storefront's toFixed(1) display); Review.rating stays
// exact in case finer aggregation is ever needed.
export async function recomputeBusinessRating(businessId) {
  const [agg] = await Review.aggregate([
    { $match: { businessId } },
    { $group: { _id: null, avg: { $avg: "$rating" }, count: { $sum: 1 } } },
  ]);

  await Business.updateOne(
    { _id: new mongoose.Types.ObjectId(businessId) },
    {
      rating: agg ? Math.round(agg.avg * 10) / 10 : null,
      reviewCount: agg ? agg.count : 0,
    }
  );
}