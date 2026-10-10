import Product from "../models/Product.js";

// Takes an order's quantities off the products' stock. Called once, when the
// vendor confirms the payment (never when the order is placed, so unpaid orders
// can't lock stock).
//
// - A product whose stock is 0 is left alone: it is either already sold out or
//   the vendor doesn't track a count for it.
// - If the vendor sold more than they had left, stock goes to 0 (never negative)
//   and a warning comes back so the vendor can sort it out with the customer.
//
// Returns: [{ name, wanted, hadLeft }] for each product that was oversold.
export async function reduceStockForOrder(order) {
  const warnings = [];

  for (const item of order.items || []) {
    const qty = Number(item.quantity) || 0;
    if (!item.productId || qty <= 0) continue;

    const product = await Product.findById(item.productId).select("name stock");
    if (!product || !(product.stock > 0)) continue;

    // Atomic: only subtracts if enough is left, so two confirmations at once
    // can't take stock below zero.
    const took = await Product.updateOne(
      { _id: product._id, stock: { $gte: qty } },
      { $inc: { stock: -qty } }
    );

    if (took.modifiedCount === 0) {
      warnings.push({ name: product.name, wanted: qty, hadLeft: product.stock });
      await Product.updateOne({ _id: product._id }, { $set: { stock: 0 } });
    }

    // Reached zero: mark it sold out so it can't be ordered again.
    await Product.updateOne({ _id: product._id, stock: 0 }, { $set: { inStock: false } });
  }

  return warnings;
}