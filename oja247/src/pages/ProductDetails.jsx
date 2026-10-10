import { useEffect, useState, useRef } from "react";
import { useParams, useNavigate, Link } from "react-router-dom";
import { getProductById, getProductsByBusiness } from "../services/api";
import { useCart } from "../context/CartContext";
import Loader from "../components/Loader";
import useMinimumLoadingTime from "../hooks/useMinimumLoadingTime";

const RECENTLY_VIEWED_KEY = "oja247_recently_viewed";
const RECENTLY_VIEWED_LIMIT = 8;

function readRecentlyViewed() {
  try {
    const raw = localStorage.getItem(RECENTLY_VIEWED_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

function pushRecentlyViewed(product) {
  const entry = {
    _id: product._id,
    name: product.name,
    price: product.price,
    image: product.images?.[0] || null,
  };

  const existing = readRecentlyViewed().filter((p) => p._id !== product._id);
  const next = [entry, ...existing].slice(0, RECENTLY_VIEWED_LIMIT);

  try {
    localStorage.setItem(RECENTLY_VIEWED_KEY, JSON.stringify(next));
  } catch {
    // localStorage unavailable (private browsing, quota, etc.) — non-critical, skip silently
  }

  return next;
}

function ProductDetails() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { itemCount } = useCart();

  const [product, setProduct] = useState(null);
  const [loading, setLoading] = useState(true);
  const [activeImage, setActiveImage] = useState(0);
  const [relatedProducts, setRelatedProducts] = useState([]);
  const [recentlyViewed, setRecentlyViewed] = useState([]);
  const [shareFeedback, setShareFeedback] = useState(false);
  const [isZooming, setIsZooming] = useState(false);
  const [zoomPosition, setZoomPosition] = useState({ x: 50, y: 50 });
  const imageRef = useRef(null);

  const showLoader = useMinimumLoadingTime(loading);

  useEffect(() => {
    setActiveImage(0);
    setRelatedProducts([]);
    window.scrollTo({ top: 0, behavior: "instant" });

    const fetchProduct = async () => {
      setLoading(true);
      try {
        const response = await getProductById(id);
        const fetchedProduct = response.data;
        setProduct(fetchedProduct);

        // Recently viewed — record this product, show the others (excluding itself)
        const updated = pushRecentlyViewed(fetchedProduct);
        setRecentlyViewed(updated.filter((p) => p._id !== fetchedProduct._id));

        // Related products from the same vendor
        const business = fetchedProduct.businessId;
        if (business?._id) {
          try {
            const relatedRes = await getProductsByBusiness(business._id);
            setRelatedProducts(
              relatedRes.data.filter((p) => p._id !== fetchedProduct._id).slice(0, 8)
            );
          } catch (err) {
            console.error("Error fetching related products:", err);
          }
        }
      } catch (error) {
        console.error("Error fetching product:", error);
        setProduct(null);
      } finally {
        setLoading(false);
      }
    };

    fetchProduct();
  }, [id]);

  const handleShare = async () => {
    const url = window.location.href;
    try {
      if (navigator.share) {
        await navigator.share({ title: product?.name, url });
        return;
      }
      await navigator.clipboard.writeText(url);
      setShareFeedback(true);
      setTimeout(() => setShareFeedback(false), 2000);
    } catch (error) {
      console.error("Error sharing:", error);
    }
  };

  const handleImageMouseMove = (e) => {
    if (!imageRef.current) return;
    const rect = imageRef.current.getBoundingClientRect();
    const x = ((e.clientX - rect.left) / rect.width) * 100;
    const y = ((e.clientY - rect.top) / rect.height) * 100;
    setZoomPosition({ x, y });
  };

  if (showLoader) {
    return <Loader text="Loading product..." />;
  }

  if (!product) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50 px-6">
        <div className="text-center">
          <p className="text-red-600 text-lg font-medium mb-4">Product not found</p>
          <button
            onClick={() => navigate("/products")}
            className="text-green-600 hover:text-green-700 font-medium"
          >
            ← Back to all products
          </button>
        </div>
      </div>
    );
  }

  const images = product.images && product.images.length > 0 ? product.images : [];
  const business = product.businessId;

  return (
    <div className="min-h-screen bg-gray-50 pb-16">
      {/* Top bar */}
      <div className="sticky top-0 z-20 bg-gray-50/90 backdrop-blur-sm border-b border-gray-200 px-4 sm:px-6 py-3 flex items-center justify-between">
        <button
          onClick={() => navigate(-1)}
          className="flex items-center gap-1.5 min-h-11 text-sm font-medium text-gray-600 hover:text-gray-900 transition"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
          </svg>
          Back
        </button>

        <a
          href="/cart"
          className="inline-flex items-center justify-center bg-gray-900 hover:bg-gray-800 text-white p-3 rounded-full shadow-sm relative"
          aria-label="View cart"
        >
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth="2">
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

      <div className="max-w-6xl mx-auto px-4 sm:px-6 py-6 sm:py-10">
        {/* Breadcrumb */}
        <nav className="flex items-center gap-1.5 text-sm text-gray-500 mb-5 flex-wrap">
          <Link to="/" className="min-h-11 py-3 -my-3 hover:text-gray-700 transition-colors">
            Home
          </Link>
          <span>/</span>
          <Link to="/products" className="min-h-11 py-3 -my-3 hover:text-gray-700 transition-colors">
            All Products
          </Link>
          {product.category && (
            <>
              <span>/</span>
              <Link
                to={`/products?category=${encodeURIComponent(product.category)}`}
                className="min-h-11 py-3 -my-3 hover:text-gray-700 transition-colors"
              >
                {product.category}
              </Link>
            </>
          )}
          <span>/</span>
          <span className="text-gray-900 font-medium truncate max-w-[200px]">{product.name}</span>
        </nav>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 lg:gap-12">
          {/* Image gallery */}
          <div>
            <div
              ref={imageRef}
              className="relative aspect-square bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden mb-3 cursor-zoom-in"
              onMouseEnter={() => setIsZooming(true)}
              onMouseLeave={() => setIsZooming(false)}
              onMouseMove={handleImageMouseMove}
            >
              {images.length > 0 ? (
                <img
                  src={images[activeImage]}
                  alt={product.name}
                  className="w-full h-full object-cover transition-transform duration-150 ease-out"
                  style={
                    isZooming
                      ? {
                          transform: "scale(1.9)",
                          transformOrigin: `${zoomPosition.x}% ${zoomPosition.y}%`,
                        }
                      : undefined
                  }
                />
              ) : (
                <div className="w-full h-full flex items-center justify-center">
                  <svg className="h-20 w-20 text-gray-300" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z"
                    />
                  </svg>
                </div>
              )}

              {images.length > 0 && !isZooming && (
                <span className="absolute bottom-3 right-3 bg-black/50 text-white text-xs px-2.5 py-1 rounded-full pointer-events-none">
                  Hover to zoom
                </span>
              )}
            </div>

            {/* Thumbnail strip — only shown when there's more than one image */}
            {images.length > 1 && (
              <div className="flex gap-2.5 overflow-x-auto pb-1">
                {images.map((img, index) => (
                  <button
                    key={index}
                    onClick={() => setActiveImage(index)}
                    className={`shrink-0 w-16 h-16 sm:w-20 sm:h-20 rounded-xl overflow-hidden border-2 transition-colors ${
                      activeImage === index
                        ? "border-green-500"
                        : "border-transparent hover:border-gray-300"
                    }`}
                  >
                    <img src={img} alt={`${product.name} ${index + 1}`} className="w-full h-full object-cover" />
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Product info */}
          <div>
            {product.category && (
              <span className="text-xs uppercase tracking-wide text-gray-400 font-semibold">
                {product.category}
              </span>
            )}

            <div className="flex items-start justify-between gap-3 mt-1 mb-3">
              <h1 className="text-2xl sm:text-3xl font-bold text-gray-900">{product.name}</h1>
              <button
                type="button"
                onClick={handleShare}
                className="shrink-0 inline-flex items-center gap-1.5 text-xs font-medium text-gray-600 hover:text-gray-900 border border-gray-200 hover:bg-gray-50 rounded-full px-4 py-1.5 min-h-11 transition-colors"
              >
                <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth="2">
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    d="M8.684 13.342a3 3 0 100-2.684m0 2.684a3 3 0 100 2.684m0-2.684l6.632-3.316m-6.632 6l6.632 3.316m0-9.632a3 3 0 100 2.684m0-2.684a3 3 0 100 2.684"
                  />
                </svg>
                {shareFeedback ? "Copied!" : "Share"}
              </button>
            </div>

            <div className="flex items-center gap-3 mb-5">
              <span className="text-3xl font-black text-gray-900">
                ₦{Number(product.price || 0).toLocaleString()}
              </span>
              <span
                className={`text-xs font-semibold px-2.5 py-1 rounded-full ${
                  product.inStock ? "bg-green-100 text-green-800" : "bg-red-100 text-red-800"
                }`}
              >
                {product.inStock
                  ? product.stock > 0 && product.stock <= 5
                    ? `Only ${product.stock} left`
                    : "In Stock"
                  : "Out of Stock"}
              </span>
            </div>

            {business && (
              <Link
                to={`/business/${business._id}`}
                state={{ internalNav: true }}
                className="inline-flex items-center gap-2.5 mb-5 px-3 py-2 rounded-xl border border-gray-200 bg-white hover:bg-gray-50 transition"
              >
                {business.logo ? (
                  <img src={business.logo} alt={business.name} className="w-8 h-8 rounded-full object-cover" />
                ) : (
                  <div className="w-8 h-8 rounded-full bg-green-100 text-green-700 flex items-center justify-center text-xs font-bold">
                    {business.name?.slice(0, 1).toUpperCase()}
                  </div>
                )}
                <span className="text-sm">
                  <span className="text-gray-500">Sold by</span>{" "}
                  <span className="font-semibold text-gray-900">{business.name}</span>
                </span>
                <svg className="w-4 h-4 text-gray-400 ml-1" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
                </svg>
              </Link>
            )}

            {/* Tags */}
            {product.tags && product.tags.length > 0 && (
              <div className="flex flex-wrap gap-2 mb-5">
                {product.tags.map((tag) => (
                  <span
                    key={tag}
                    className="text-xs font-medium px-3 py-1 rounded-full bg-green-50 text-green-700 border border-green-100"
                  >
                    {tag}
                  </span>
                ))}
              </div>
            )}

            {product.description && (
              <div className="mb-6">
                <h2 className="text-sm font-semibold text-gray-900 mb-2">Description</h2>
                <p className="text-gray-600 leading-relaxed whitespace-pre-line">{product.description}</p>
              </div>
            )}

            {business ? (
              <Link
                to={`/business/${business.slug || business._id}`}
                state={{ internalNav: true }}
                className="w-full sm:w-auto flex items-center justify-center gap-2 px-8 py-3.5 rounded-xl text-base font-semibold transition-colors bg-green-600 hover:bg-green-700 text-white"
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth="2">
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    d="M3 3h2l.4 2M7 13h10l4-8H5.4M7 13L5.4 5M7 13l-1.5 6M17 13l1.5 6M9 19h.01M15 19h.01"
                  />
                </svg>
                Visit store
              </Link>
            ) : (
              <span className="w-full sm:w-auto flex items-center justify-center px-8 py-3.5 rounded-xl text-base font-semibold bg-gray-200 text-gray-500">
                Storefront unavailable
              </span>
            )}
          </div>
        </div>

        {/* More from this vendor */}
        {relatedProducts.length > 0 && (
          <section className="mt-14">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-bold text-gray-900">
                More from {business?.name || "this vendor"}
              </h2>
              {business && (
                <Link
                  to={`/business/${business._id}`}
                  state={{ internalNav: true }}
                  className="text-sm text-green-600 hover:text-green-700 font-medium"
                >
                  View store
                </Link>
              )}
            </div>
            <div className="flex gap-4 overflow-x-auto pb-2 -mx-4 px-4 sm:mx-0 sm:px-0">
              {relatedProducts.map((rp) => (
                <Link
                  key={rp._id}
                  to={`/product/${rp._id}`}
                  className="shrink-0 w-40 sm:w-48 bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden hover:shadow-md transition-shadow"
                >
                  <div className="aspect-square bg-gray-100">
                    {rp.images?.[0] ? (
                      <img src={rp.images[0]} alt={rp.name} className="w-full h-full object-cover" />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center text-gray-300">
                        <svg className="h-10 w-10" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            strokeWidth={2}
                            d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z"
                          />
                        </svg>
                      </div>
                    )}
                  </div>
                  <div className="p-3">
                    <p className="text-sm font-medium text-gray-900 line-clamp-1">{rp.name}</p>
                    <p className="text-sm font-bold text-gray-900 mt-0.5">
                      ₦{Number(rp.price || 0).toLocaleString()}
                    </p>
                  </div>
                </Link>
              ))}
            </div>
          </section>
        )}

        {/* Recently viewed */}
        {recentlyViewed.length > 0 && (
          <section className="mt-10">
            <h2 className="text-lg font-bold text-gray-900 mb-4">Recently viewed</h2>
            <div className="flex gap-4 overflow-x-auto pb-2 -mx-4 px-4 sm:mx-0 sm:px-0">
              {recentlyViewed.map((rv) => (
                <Link
                  key={rv._id}
                  to={`/product/${rv._id}`}
                  className="shrink-0 w-40 sm:w-48 bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden hover:shadow-md transition-shadow"
                >
                  <div className="aspect-square bg-gray-100">
                    {rv.image ? (
                      <img src={rv.image} alt={rv.name} className="w-full h-full object-cover" />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center text-gray-300">
                        <svg className="h-10 w-10" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            strokeWidth={2}
                            d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z"
                          />
                        </svg>
                      </div>
                    )}
                  </div>
                  <div className="p-3">
                    <p className="text-sm font-medium text-gray-900 line-clamp-1">{rv.name}</p>
                    <p className="text-sm font-bold text-gray-900 mt-0.5">
                      ₦{Number(rv.price || 0).toLocaleString()}
                    </p>
                  </div>
                </Link>
              ))}
            </div>
          </section>
        )}
      </div>
    </div>
  );
}

export default ProductDetails;

// done