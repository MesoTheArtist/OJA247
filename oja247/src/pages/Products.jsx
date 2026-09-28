import { useEffect, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { getAllProducts } from "../services/api";
import { useCart } from "../context/CartContext";
import Loader from "../components/Loader";
import useMinimumLoadingTime from "../hooks/useMinimumLoadingTime";
import { SlidersHorizontal, X } from "lucide-react";

function Products() {
  const { itemCount } = useCart();
  const [searchParams, setSearchParams] = useSearchParams();
  const [products, setProducts] = useState([]);
  const [searchTerm, setSearchTerm] = useState("");
  const [categoryFilter, setCategoryFilter] = useState(
    searchParams.get("category") || "All"
  );
  const [minPrice, setMinPrice] = useState("");
  const [maxPrice, setMaxPrice] = useState("");
  const [inStockOnly, setInStockOnly] = useState(false);
  const [sortBy, setSortBy] = useState("newest");
  const [showFilters, setShowFilters] = useState(false);
  const [loading, setLoading] = useState(true);

  const showLoader = useMinimumLoadingTime(loading);

  useEffect(() => {
    getAllProducts()
      .then((res) => setProducts(res.data))
      .catch((err) => console.log(err))
      .finally(() => setLoading(false));
  }, []);

  // Keep the URL's ?category= param in sync so this page's filter state is
  // linkable/shareable/refreshable — e.g. a breadcrumb or category tile
  // elsewhere in the app can deep-link straight into a filtered view.
  useEffect(() => {
    if (categoryFilter === "All") {
      searchParams.delete("category");
      setSearchParams(searchParams, { replace: true });
    } else {
      setSearchParams({ category: categoryFilter }, { replace: true });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [categoryFilter]);

  const getBusinessId = (product) => product.businessId?._id;
  const getBusinessSlug = (product) => product.businessId?.slug;
  const getBusinessName = (product) => product.businessId?.name;
  const getBusinessLink = (product) =>
    `/business/${getBusinessSlug(product) || getBusinessId(product)}`;

  const defaultCategories = [
    "Fashion",
    "Electronics",
    "Phones & Accessories",
    "Computers & Accessories",
    "Beauty & Personal Care",
    "Health",
    "Food & Groceries",
    "Home & Kitchen",
    "Furniture",
    "Baby & Kids",
    "Shoes & Bags",
    "Jewelry & Accessories",
    "Sports & Fitness",
    "Books & Stationery",
    "Automotive",
    "Services",
    "Agriculture",
    "Pets",
    "Gifts",
    "Other",
  ];

  const categories = [
    "All",
    ...new Set([
      ...defaultCategories,
      ...products.map((p) => p.category).filter(Boolean),
    ]),
  ];

  const activeFilterCount =
    (categoryFilter !== "All" ? 1 : 0) +
    (minPrice ? 1 : 0) +
    (maxPrice ? 1 : 0) +
    (inStockOnly ? 1 : 0);

  const clearFilters = () => {
    setCategoryFilter("All");
    setMinPrice("");
    setMaxPrice("");
    setInStockOnly(false);
    setSortBy("newest");
  };

  const filteredProducts = products
    .filter((p) => {
      const matchesName = p.name.toLowerCase().includes(searchTerm.toLowerCase());
      const matchesCategory = categoryFilter === "All" || p.category === categoryFilter;
      const matchesMin = minPrice === "" || p.price >= Number(minPrice);
      const matchesMax = maxPrice === "" || p.price <= Number(maxPrice);
      const matchesStock = !inStockOnly || p.inStock;
      return matchesName && matchesCategory && matchesMin && matchesMax && matchesStock;
    })
    .sort((a, b) => {
      if (sortBy === "price-low") return a.price - b.price;
      if (sortBy === "price-high") return b.price - a.price;
      if (sortBy === "name") return a.name.localeCompare(b.name);
      return new Date(b.createdAt || 0) - new Date(a.createdAt || 0);
    });

  if (showLoader) {
    return <Loader text="Loading products..." />;
  }

  return (
    <div className="min-h-screen bg-gray-50 p-4 sm:p-6">
      <div className="max-w-7xl mx-auto">
        <div className="flex items-center justify-between gap-4 mb-6">
          <h1 className="text-2xl sm:text-3xl font-bold text-gray-900">
            All Products
          </h1>

          <a
            href="/cart"
            className="inline-flex items-center justify-center bg-gray-900 hover:bg-gray-800 text-white p-3 rounded-full shadow-sm relative"
            aria-label="View cart"
          >
            <svg
              className="w-5 h-5"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
              strokeWidth="2"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M3 3h2l.4 2M7 13h10l4-8H5.4M7 13L5.4 5M7 13l-1.5 6M17 13l1.5 6M9 19h.01M15 19h.01"
              />
            </svg>
            <span className="absolute -top-2 -right-2 bg-green-600 text-white rounded-full min-w-5 h-5 flex items-center justify-center text-[10px] font-bold">
              {itemCount}
            </span>
          </a>
        </div>

        {/* Search + Filter toggle */}
        <div className="sticky top-0 z-20 bg-gray-50/90 backdrop-blur-sm py-2 mb-4">
          <div className="flex flex-col sm:flex-row gap-3">
            <div className="relative flex-1">
              <svg
                className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M21 21l-4.35-4.35M17 10a7 7 0 11-14 0 7 7 0 0114 0z"
                />
              </svg>
              <input
                type="text"
                placeholder="Search products..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="p-2 pl-10 border border-gray-300 rounded-lg w-full focus:outline-none focus:ring-2 focus:ring-green-500 focus:border-green-500"
              />
            </div>

            <button
              type="button"
              onClick={() => setShowFilters((prev) => !prev)}
              className={`inline-flex items-center justify-center gap-2 px-4 py-2 rounded-lg border font-medium text-sm shrink-0 transition-colors ${
                showFilters
                  ? "bg-green-600 border-green-600 text-white"
                  : "bg-white border-gray-300 text-gray-700 hover:bg-gray-50"
              }`}
            >
              <SlidersHorizontal size={16} />
              Filters
              {activeFilterCount > 0 && (
                <span
                  className={`text-[10px] font-bold rounded-full w-4 h-4 flex items-center justify-center ${
                    showFilters ? "bg-white text-green-700" : "bg-green-600 text-white"
                  }`}
                >
                  {activeFilterCount}
                </span>
              )}
            </button>
          </div>

          {showFilters && (
            <div className="mt-3 p-4 bg-white border border-gray-200 rounded-xl grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
              <div>
                <label className="block text-xs font-medium text-gray-500 mb-1">
                  Category
                </label>
                <select
                  value={categoryFilter}
                  onChange={(e) => setCategoryFilter(e.target.value)}
                  className="p-2 border border-gray-300 rounded-lg w-full text-sm focus:outline-none focus:ring-2 focus:ring-green-500"
                >
                  {categories.map((cat) => (
                    <option key={cat} value={cat}>
                      {cat}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-xs font-medium text-gray-500 mb-1">
                  Min price (₦)
                </label>
                <input
                  type="number"
                  min="0"
                  placeholder="0"
                  value={minPrice}
                  onChange={(e) => setMinPrice(e.target.value)}
                  className="p-2 border border-gray-300 rounded-lg w-full text-sm focus:outline-none focus:ring-2 focus:ring-green-500"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-gray-500 mb-1">
                  Max price (₦)
                </label>
                <input
                  type="number"
                  min="0"
                  placeholder="Any"
                  value={maxPrice}
                  onChange={(e) => setMaxPrice(e.target.value)}
                  className="p-2 border border-gray-300 rounded-lg w-full text-sm focus:outline-none focus:ring-2 focus:ring-green-500"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-gray-500 mb-1">
                  Sort by
                </label>
                <select
                  value={sortBy}
                  onChange={(e) => setSortBy(e.target.value)}
                  className="p-2 border border-gray-300 rounded-lg w-full text-sm focus:outline-none focus:ring-2 focus:ring-green-500"
                >
                  <option value="newest">Newest</option>
                  <option value="price-low">Price: Low to High</option>
                  <option value="price-high">Price: High to Low</option>
                  <option value="name">Name (A–Z)</option>
                </select>
              </div>

              <div className="sm:col-span-2 lg:col-span-4 flex items-center justify-between pt-1">
                <label className="inline-flex items-center gap-2 text-sm text-gray-700 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={inStockOnly}
                    onChange={(e) => setInStockOnly(e.target.checked)}
                    className="w-4 h-4 rounded border-gray-300 text-green-600 focus:ring-green-500"
                  />
                  In stock only
                </label>

                {activeFilterCount > 0 && (
                  <button
                    type="button"
                    onClick={clearFilters}
                    className="inline-flex items-center gap-1 text-sm text-gray-500 hover:text-gray-700 font-medium"
                  >
                    <X size={14} />
                    Clear filters
                  </button>
                )}
              </div>
            </div>
          )}
        </div>

        <p className="text-sm text-gray-500 mb-4">
          {filteredProducts.length}{" "}
          {filteredProducts.length === 1 ? "product" : "products"} found
        </p>

        <div className="grid grid-cols-2 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4 sm:gap-6">
          {filteredProducts.map((product) => (
            <div
              key={product._id}
              className="group bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden hover:shadow-xl hover:-translate-y-1 transition-all duration-300 flex flex-col"
            >
              {/* Image links through to the product detail page */}
              <Link to={`/product/${product._id}`} className="block">
                <div className="relative aspect-square bg-gray-100 overflow-hidden">
                  {product.images && product.images[0] ? (
                    <img
                      src={product.images[0]}
                      alt={product.name}
                      className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                    />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center">
                      <svg
                        className="h-16 w-16 text-gray-300"
                        fill="none"
                        viewBox="0 0 24 24"
                        stroke="currentColor"
                      >
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          strokeWidth={2}
                          d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z"
                        />
                      </svg>
                    </div>
                  )}

                  <span
                    className={`absolute top-2 left-2 text-[11px] font-semibold px-2 py-1 rounded-full shadow-sm ${
                      product.inStock
                        ? "bg-green-100 text-green-800"
                        : "bg-red-100 text-red-800"
                    }`}
                  >
                    {product.inStock ? "In Stock" : "Out of Stock"}
                  </span>

                  {!product.inStock && (
                    <div className="absolute inset-0 bg-white/40" />
                  )}
                </div>
              </Link>

              <div className="p-3 sm:p-4 flex flex-col flex-1">
                {product.category && (
                  <span className="text-[11px] uppercase tracking-wide text-gray-400 font-medium mb-1">
                    {product.category}
                  </span>
                )}
                <Link to={`/product/${product._id}`}>
                  <h3 className="font-semibold text-sm sm:text-lg text-gray-900 mb-1 line-clamp-1 hover:text-green-700 transition-colors">
                    {product.name}
                  </h3>
                </Link>
                {getBusinessName(product) && (
                  <p className="text-xs text-gray-400 mb-1">
                    by {getBusinessName(product)}
                  </p>
                )}
                <p className="text-xs sm:text-sm text-gray-500 mb-3 line-clamp-2 flex-1">
                  {product.description}
                </p>

                <div className="flex items-center justify-between mb-3">
                  <span className="text-lg sm:text-2xl font-bold text-gray-900">
                    ₦{product.price.toLocaleString()}
                  </span>
                </div>

                <div className="mt-3 space-y-2">
                  {getBusinessId(product) ? (
                    <Link
                      to={getBusinessLink(product)}
                      state={{ internalNav: true }}
                      className={`flex items-center justify-center w-full text-center py-2 rounded-lg text-sm sm:text-base font-medium transition-colors ${
                        product.inStock
                          ? "bg-green-600 hover:bg-green-700 text-white"
                          : "bg-gray-200 text-gray-500 cursor-not-allowed pointer-events-none"
                      }`}
                    >
                      Visit store
                    </Link>
                  ) : (
                    <span className="block w-full text-center py-2 rounded-lg text-sm sm:text-base font-medium bg-gray-100 text-gray-400">
                      Storefront unavailable
                    </span>
                  )}
                </div>
              </div>
            </div>
          ))}

          {filteredProducts.length === 0 && (
            <div className="col-span-full text-center py-16 bg-white rounded-2xl border border-gray-100">
              <svg
                className="mx-auto h-16 w-16 text-gray-300"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M20 13V6a2 2 0 00-2-2H6a2 2 0 00-2 2v7m16 0v5a2 2 0 01-2 2H6a2 2 0 01-2-2v-5m16 0h-2.586a1 1 0 00-.707.293l-2.414 2.414a1 1 0 01-.707.293h-3.172a1 1 0 01-.707-.293l-2.414-2.414A1 1 0 006.586 13H4"
                />
              </svg>
              <h3 className="mt-4 text-lg font-medium text-gray-900">
                No products found
              </h3>
              <p className="mt-2 text-sm text-gray-500">
                Try a different search term or category.
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export default Products;