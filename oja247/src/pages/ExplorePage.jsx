import React, { useState, useEffect, useMemo, useCallback } from "react";
import { useNavigate, useSearchParams, Link } from "react-router-dom";
import { getAllBusinesses } from "../services/api";
import Loader from "../components/Loader";

const PLACEHOLDER_LOGO = "/assets/placeholder-logo.png"; // local fallback instead of via.placeholder.com

const ExplorePage = () => {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();

  const [businesses, setBusinesses] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const [searchQuery, setSearchQuery] = useState(
    searchParams.get("search") || ""
  );

  const [selectedCategory, setSelectedCategory] = useState(
    searchParams.get("category") || "all"
  );

  // Fetch businesses
  useEffect(() => {
    fetchBusinesses();
  }, []);

  // Keep URL in sync with filter state so it's shareable/refreshable
  useEffect(() => {
    const params = {};
    if (searchQuery.trim()) params.search = searchQuery;
    if (selectedCategory !== "all") params.category = selectedCategory;
    setSearchParams(params, { replace: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchQuery, selectedCategory]);

  const fetchBusinesses = async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await getAllBusinesses();
      setBusinesses(response.data);
    } catch (err) {
      console.error("Error fetching businesses:", err);
      setError("We couldn't load businesses right now. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  // Memoized filtering — avoids extra render cycle from useState+useEffect
  const filteredBusinesses = useMemo(() => {
    let filtered = [...businesses];

    if (selectedCategory !== "all") {
      filtered = filtered.filter(
        (business) => business.category === selectedCategory
      );
    }

    if (searchQuery.trim()) {
      const query = searchQuery.toLowerCase();

      filtered = filtered.filter(
        (business) =>
          business.name?.toLowerCase().includes(query) ||
          business.description?.toLowerCase().includes(query) ||
          business.category?.toLowerCase().includes(query) ||
          business.location?.toLowerCase().includes(query)
      );
    }

    return filtered;
  }, [businesses, searchQuery, selectedCategory]);

  const categories = useMemo(
    () => [
      "all",
      ...new Set(
        businesses.map((business) => business.category).filter(Boolean)
      ),
    ],
    [businesses]
  );

  const clearFilters = useCallback(() => {
    setSearchQuery("");
    setSelectedCategory("all");
  }, []);

  // ----------------- LOADER -----------------
  if (loading) {
    return <Loader text="Loading businesses..." />;
  }

  // ----------------- ERROR STATE -----------------
  if (error) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center px-6">
        <div className="text-center max-w-md">
          <svg
            className="mx-auto h-16 w-16 text-red-400 mb-4"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M12 9v2m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
            />
          </svg>
          <h3 className="text-xl font-bold text-gray-900 mb-2">
            Something went wrong
          </h3>
          <p className="text-gray-600 mb-6">{error}</p>
          <button
            onClick={fetchBusinesses}
            className="px-6 py-3 bg-green-600 text-white rounded-xl hover:bg-green-700 transition shadow-md"
          >
            Try Again
          </button>
        </div>
      </div>
    );
  }

  // ----------------- MAIN PAGE -----------------
  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <div className="backdrop-blur-xl bg-white/70 border-b border-gray-200 sticky top-0 z-10 shadow-md">
        <div className="max-w-7xl mx-auto px-6 py-6">
          <div className="flex flex-col md:flex-row gap-4 items-center">
            {/* Search */}
            <div className="flex-1 w-full">
              <div className="relative">
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Search businesses, products, categories..."
                  aria-label="Search businesses"
                  className="w-full px-4 py-3 pl-12 border border-gray-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-green-400 bg-white/80 shadow-inner"
                />

                <svg
                  className="absolute left-4 top-3.5 w-5 h-5 text-gray-400"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"
                  />
                </svg>
              </div>
            </div>

            {/* Category Filter */}
            <select
              value={selectedCategory}
              onChange={(e) => setSelectedCategory(e.target.value)}
              aria-label="Filter by category"
              className="px-4 py-3 border border-gray-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-green-400 bg-white/80 shadow-inner"
            >
              {categories.map((category) => (
                <option key={category} value={category}>
                  {category === "all" ? "All Categories" : category}
                </option>
              ))}
            </select>
          </div>

          {/* Business Count */}
          <div className="mt-4 text-sm text-gray-600">
            Showing {filteredBusinesses.length} of {businesses.length}{" "}
            businesses
          </div>
        </div>
      </div>

      {/* Main Content */}
      <div className="max-w-7xl mx-auto px-6 py-8">
        {filteredBusinesses.length === 0 ? (
          /* No Businesses */
          <div className="text-center py-20">
            <svg
              className="mx-auto h-24 w-24 text-gray-400 mb-4"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              {/* Empty-box icon instead of reused search icon */}
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M20 13V7a2 2 0 00-2-2H6a2 2 0 00-2 2v6m16 0l-1.5 7.5a2 2 0 01-2 1.5H7.5a2 2 0 01-2-1.5L4 13m16 0H4m4 0V9m8 4V9"
              />
            </svg>

            <h3 className="text-2xl font-bold text-gray-900 mb-2">
              No businesses found
            </h3>

            <p className="text-gray-600 mb-6">
              Try adjusting your search or filter.
            </p>

            <button
              onClick={clearFilters}
              className="px-6 py-3 bg-green-600 text-white rounded-xl hover:bg-green-700 transition shadow-md"
            >
              Clear Filters
            </button>
          </div>
        ) : (
          /* Business Grid */
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
            {filteredBusinesses.map((business) => (
              <Link
                key={business._id}
                to={`/business/${business.slug || business._id}`}
                state={{ internalNav: true }}
                className="block bg-white/90 backdrop-blur-xl border border-gray-200 rounded-2xl shadow-lg overflow-hidden cursor-pointer hover:shadow-2xl transition-all hover:-translate-y-1 focus:outline-none focus:ring-2 focus:ring-green-400"
              >
                {/* Banner */}
                <div
                  className="h-40 bg-gradient-to-r from-green-200 to-yellow-200 relative"
                  style={{
                    backgroundImage: business.banner
                      ? `url(${business.banner})`
                      : "",
                    backgroundSize: "cover",
                    backgroundPosition: "center",
                  }}
                >
                  {business.category && (
                    <span className="absolute top-3 right-3 bg-white/90 px-3 py-1 rounded-full text-xs font-semibold shadow">
                      {business.category}
                    </span>
                  )}
                </div>

                {/* Business Information */}
                <div className="p-5 -mt-12 relative z-10">
                  {/* Business Logo */}
                  <img
                    src={business.logo || PLACEHOLDER_LOGO}
                    alt={business.name}
                    className="w-20 h-20 rounded-full border-4 border-white shadow-lg mb-3 object-cover bg-white"
                  />

                  {/* Business Name */}
                  <h3 className="font-bold text-lg mb-2 truncate">
                    {business.name}
                  </h3>

                  {/* Description */}
                  <p className="text-sm text-gray-600 mb-3 line-clamp-2 h-10">
                    {business.description || "No description available"}
                  </p>

                  {/* Location */}
                  {business.location && (
                    <div className="flex items-center gap-2 text-sm text-gray-500 mb-3">
                      <svg
                        className="w-4 h-4"
                        fill="none"
                        stroke="currentColor"
                        viewBox="0 0 24 24"
                      >
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          strokeWidth={2}
                          d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z"
                        />
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          strokeWidth={2}
                          d="M15 11a3 3 0 11-6 0 3 3 0 016 0z"
                        />
                      </svg>

                      <span className="truncate">{business.location}</span>
                    </div>
                  )}

                  {/* Highlights */}
                  {business.highlights && business.highlights.length > 0 && (
                    <div className="flex flex-wrap gap-1 mb-3">
                      {business.highlights.slice(0, 3).map((highlight, index) => (
                        <span
                          key={index}
                          className="text-xs bg-green-50 text-green-600 px-2 py-1 rounded"
                        >
                          {highlight}
                        </span>
                      ))}
                    </div>
                  )}

                  {/* View Store */}
                  <button
                    onClick={(event) => {
                      event.preventDefault();
                      event.stopPropagation();
                      navigate(`/business/${business.slug || business._id}`, { state: { internalNav: true } });
                    }}
                    className="w-full py-2 min-h-11 bg-green-600 hover:bg-green-700 text-white font-medium rounded-xl transition shadow-md"
                  >
                    View Store
                  </button>
                </div>
              </Link>
            ))}
          </div>
        )}
      </div>

      {/* Back To Top */}
      <button
        onClick={() =>
          window.scrollTo({
            top: 0,
            behavior: "smooth",
          })
        }
        className="fixed bottom-6 right-6 bg-green-600 hover:bg-green-700 text-white p-4 rounded-full shadow-lg transition"
        title="Back to top"
        aria-label="Back to top"
      >
        <svg
          className="w-6 h-6"
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M5 10l7-7m0 0l7 7m-7-7v18"
          />
        </svg>
      </button>
    </div>
  );
};

export default ExplorePage;