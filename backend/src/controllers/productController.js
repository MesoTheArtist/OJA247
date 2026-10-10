import mongoose from "mongoose";
import Product from "../models/Product.js";
import Business from "../models/Business.js";
import Follow from "../models/Follow.js";
import User from "../models/User.js";
import { sendNewProductFollowerEmail } from "../services/emailService.js";

function canManageBusiness(user, businessId) {
  return user.role === "admin" || user.businessId?.toString() === String(businessId);
}

// Get all products across all businesses
export const getAllProducts = async (req, res) => {
  try {
    const products = await Product.find()
      .populate("businessId", "name logo location deliveryFeeInState deliveryFeeOutState")
      .sort({ createdAt: -1 });
    res.json(products);
  } catch (error) {
    console.error("Get all products error:", error);
    res.status(500).json({ message: error.message });
  }
};

// Get all products for a specific business
export const getProductsByBusiness = async (req, res) => {
  try {
    const { businessId } = req.params;

    if (!mongoose.Types.ObjectId.isValid(businessId)) {
      return res.status(400).json({ message: "Invalid business ID" });
    }
    if (!canManageBusiness(req.user, businessId)) {
      return res.status(403).json({ message: "Not authorized to manage this business's products." });
    }

    const products = await Product.find({ businessId })
      .populate("businessId", "name logo location deliveryFeeInState deliveryFeeOutState")
      .sort({ createdAt: -1 });
    res.json(products);
  } catch (error) {
    console.error("Get products by business error:", error);
    res.status(500).json({ message: error.message });
  }
};

// Get single product
export const getProduct = async (req, res) => {
  try {
    const { id } = req.params;

    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({ message: "Invalid product ID" });
    }

    const product = await Product.findById(id).populate(
      "businessId",
      "name logo contact location deliveryFeeInState deliveryFeeOutState"
    );
    if (!product) {
      return res.status(404).json({ message: "Product not found" });
    }
    res.json(product);
  } catch (error) {
    console.error("Get product error:", error);
    res.status(500).json({ message: error.message });
  }
};

// Create new product
// Emails everyone following a business when it adds a new product. Fired
// without being awaited by createProduct below — the vendor shouldn't
// wait on however many follower emails there are just to get their
// "product created" response back. Fine at current scale (fires one
// email per follower with no batching/throttling); if a vendor's
// follower count grows large enough for this to matter, this is the
// place to add a queue instead of sending synchronously in a loop.
async function notifyFollowersOfNewProduct(business, product) {
  try {
    const follows = await Follow.find({ businessId: business._id }).select("customerId");
    if (follows.length === 0) return;

    const customerIds = follows.map((f) => f.customerId);
    const followers = await User.find({ _id: { $in: customerIds } }).select("email fullName");

    const storefrontUrl = `${process.env.SITE_URL || "https://oja247.store"}/business/${business.slug || business._id}`;

    await Promise.all(
      followers.map((follower) =>
        sendNewProductFollowerEmail({
          to: follower.email,
          customerName: follower.fullName,
          businessName: business.name,
          productName: product.name,
          productImage: product.images?.[0] || "",
          storefrontUrl,
        }).catch((err) => console.error(`New-product email failed for ${follower.email}:`, err))
      )
    );
  } catch (error) {
    // A notification failure should never be visible to the vendor as a
    // product-creation problem — the product itself already saved fine.
    console.error("notifyFollowersOfNewProduct error:", error);
  }
}

export const createProduct = async (req, res) => {
  try {
    const {
      businessId,
      name,
      description,
      price,
      category,
      images,
      stock,
      specifications,
      tags,
    } = req.body;

    if (!businessId) {
      return res.status(400).json({ message: "businessId is required" });
    }

    if (!mongoose.Types.ObjectId.isValid(businessId)) {
      return res.status(400).json({ message: "Invalid business ID" });
    }

    // Verify business exists
    const business = await Business.findById(businessId);
    if (!business) {
      return res.status(404).json({ message: "Business not found" });
    }

    const product = new Product({
      businessId,
      name,
      description,
      price,
      category,
      images: images || [],
      stock: stock || 0,
      inStock: stock > 0,
      specifications,
      tags,
    });

    const savedProduct = await product.save();
    // Not awaited — see notifyFollowersOfNewProduct's comment.
    notifyFollowersOfNewProduct(business, savedProduct);
    res.status(201).json(savedProduct);
  } catch (error) {
    console.error("Create product error:", error);
    res.status(400).json({ message: error.message });
  }
};

// Update product
export const updateProduct = async (req, res) => {
  try {
    const { id } = req.params;
    const updates = req.body || {};

    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({ message: "Invalid product ID" });
    }

    const product = await Product.findById(id).select("businessId");
    if (!product) {
      return res.status(404).json({ message: "Product not found" });
    }
    if (!canManageBusiness(req.user, product.businessId)) {
      return res.status(403).json({ message: "Not authorized to manage this product." });
    }

    const allowedFields = ["name", "description", "price", "category", "images", "stock", "specifications", "tags"];
    const sanitizedUpdates = Object.fromEntries(
      allowedFields
        .filter((field) => updates[field] !== undefined)
        .map((field) => [field, updates[field]])
    );
    if (sanitizedUpdates.stock !== undefined) {
      sanitizedUpdates.inStock = Number(sanitizedUpdates.stock) > 0;
    }
    if (Object.keys(sanitizedUpdates).length === 0) {
      return res.status(400).json({ message: "No editable product fields provided" });
    }

    const updatedProduct = await Product.findByIdAndUpdate(id, sanitizedUpdates, {
      new: true,
      runValidators: true,
    });

    if (!updatedProduct) {
      return res.status(404).json({ message: "Product not found" });
    }

    res.json(updatedProduct);
  } catch (error) {
    console.error("Update product error:", error);
    res.status(400).json({ message: error.message });
  }
};

// Delete product
export const deleteProduct = async (req, res) => {
  try {
    const { id } = req.params;

    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({ message: "Invalid product ID" });
    }

    const query = req.user.role === "admin"
      ? { _id: id }
      : { _id: id, businessId: req.user.businessId };
    const product = await Product.findOneAndDelete(query);
    if (!product) {
      return res.status(404).json({ message: "Product not found" });
    }
    res.json({ message: "Product deleted successfully" });
  } catch (error) {
    console.error("Delete product error:", error);
    res.status(500).json({ message: error.message });
  }
};

// Search products across all businesses
export const searchProducts = async (req, res) => {
  try {
    const { query, category, minPrice, maxPrice } = req.query;
    let filter = {};

    if (query) {
      filter.$text = { $search: query };
    }
    if (category) {
      filter.category = category;
    }
    if (minPrice || maxPrice) {
      filter.price = {};
      if (minPrice) filter.price.$gte = Number(minPrice);
      if (maxPrice) filter.price.$lte = Number(maxPrice);
    }

    const products = await Product.find(filter)
      .populate("businessId", "name logo location deliveryFeeInState deliveryFeeOutState")
      .sort({ createdAt: -1 });

    res.json(products);
  } catch (error) {
    console.error("Search products error:", error);
    res.status(500).json({ message: error.message });
  }
};

// Get featured products
export const getFeaturedProducts = async (req, res) => {
  try {
    const products = await Product.find({ featured: true })
      .populate("businessId", "name logo location deliveryFeeInState deliveryFeeOutState")
      .limit(12)
      .sort({ createdAt: -1 });

    res.json(products);
  } catch (error) {
    console.error("Get featured products error:", error);
    res.status(500).json({ message: error.message });
  }
};