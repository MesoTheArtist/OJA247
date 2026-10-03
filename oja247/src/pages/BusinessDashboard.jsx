import React, { useState, useEffect } from "react";
import { useParams } from "react-router-dom";
import axiosInstance, { getBusinessById } from "../services/api";
import AddProductForm from "../components/AddProductForm.jsx";
import ProductList from "../components/ProductList.jsx";
import VendorOnboardingForm from "../components/Vendoronboardingform.jsx";
import SubscriptionTab from "../components/SubscriptionTab.jsx";
import AccountAlertsPopup from "../components/AccountAlertsPopup.jsx";
import ReferralPointsTab from "../components/ReferralPointsTab.jsx";
import VendorReviewsTab from "../components/VendorReviewsTab.jsx";
import VendorDisputesTab from "../components/VendorDisputesTab.jsx";
import { useAuth } from "../context/AuthContext";
import { useNavigate } from "react-router-dom";
import { LogOut, ShoppingBag, Clock, CheckCircle2, XCircle, Copy, Check, Share2 } from "lucide-react";
import Loader from "../components/Loader";
import useMinimumLoadingTime from "../hooks/useMinimumLoadingTime";

const BusinessDashboard = () => {
  const { businessId } = useParams();

  const { logout, user } = useAuth();
  const navigate = useNavigate();

  const [business, setBusiness] = useState(null);
  const [activeTab, setActiveTab] = useState("products");
  const [loading, setLoading] = useState(true);
  const [isEditing, setIsEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState("");
  const [editForm, setEditForm] = useState({
    name: "",
    description: "",
    category: "",
    location: "",
    contact: "",
    logo: "",
    banner: "",
    deliveryFeeInState: "",
    deliveryFeeOutState: "",
    slug: "",
  });

  const [orders, setOrders] = useState([]);
  const [ordersLoading, setOrdersLoading] = useState(false);
  const [ordersError, setOrdersError] = useState("");
  const [orderStatusFilter, setOrderStatusFilter] = useState("all");
  const [ordersFetched, setOrdersFetched] = useState(false);
  const [copiedLink, setCopiedLink] = useState(false);

  const [vendorStatus, setVendorStatus] = useState(null);
  const [earningsSummary, setEarningsSummary] = useState(null);

  const showLoader = useMinimumLoadingTime(loading);

  useEffect(() => {
    fetchBusiness();
    fetchVendorStatus();
    fetchEarningsSummary();
  }, [businessId]);

  const fetchEarningsSummary = async () => {
    try {
      const res = await axiosInstance.get(`/api/businesses/${businessId}/earnings-summary`);
      setEarningsSummary(res.data);
    } catch (err) {
      console.error("Failed to load earnings summary", err);
    }
  };

  useEffect(() => {
    if (business) {
      setEditForm({
        name: business.name || "",
        description: business.description || "",
        category: business.category || "",
        location: business.location || "",
        contact: business.contact || "",
        logo: business.logo || "",
        banner: business.banner || "",
        deliveryFeeInState: business.deliveryFeeInState ?? "",
        deliveryFeeOutState: business.deliveryFeeOutState ?? "",
        slug: business.slug || "",
      });
    }
  }, [business]);

  useEffect(() => {
    if (activeTab === "orders" && !ordersFetched) {
      fetchOrders();
    }
  }, [activeTab, ordersFetched]);

  const fetchBusiness = async () => {
    try {
      const response = await getBusinessById(businessId);
      setBusiness(response.data);
    } catch (error) {
      console.error("Error fetching business:", error);
    } finally {
      setLoading(false);
    }
  };

  const fetchOrders = async () => {
    try {
      setOrdersLoading(true);
      setOrdersError("");
      // NOTE: this endpoint needs to exist on the backend — a route that
      // returns only orders containing items from this businessId, e.g.
      // GET /api/orders/business/:businessId
      const response = await axiosInstance.get(`/api/orders/business/${businessId}`);
      setOrders(response.data);
      setOrdersFetched(true);
    } catch (error) {
      console.error("Error fetching orders:", error);
      setOrdersError(
        error.response?.data?.message || "Unable to load orders right now."
      );
    } finally {
      setOrdersLoading(false);
    }
  };

  const fetchVendorStatus = async () => {
    try {
      const response = await axiosInstance.get("/api/vendors/me");
      setVendorStatus(response.data.data);
    } catch (error) {
      // 404 just means they haven't submitted onboarding yet — not an error state
      setVendorStatus(null);
    }
  };

  const acknowledgeVendorNotification = async () => {
    try {
      await axiosInstance.patch("/api/vendors/me/seen");
      setVendorStatus((prev) => (prev ? { ...prev, notificationSeen: true } : prev));
    } catch (error) {
      console.error("Failed to acknowledge notification:", error);
    }
  };

  const handleProductAdded = () => {
    setActiveTab("products");
  };

  const handleEditFieldChange = (event) => {
    const { name, value } = event.target;
    setEditForm((prev) => ({ ...prev, [name]: value }));
  };

  const handleEditImageUpload = (event) => {
    const { name, files } = event.target;
    const file = files && files[0];
    if (!file) return;

    if (!file.type.startsWith("image/")) {
      setFormError("Please upload a valid image file.");
      return;
    }

    if (file.size > 5 * 1024 * 1024) {
      setFormError("Please upload an image smaller than 5MB.");
      return;
    }

    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result;
      setEditForm((prev) => ({ ...prev, [name]: result }));
      setFormError("");
    };
    reader.readAsDataURL(file);
  };

  const saveBusinessChanges = async () => {
    try {
      setSaving(true);
      setFormError("");

      const response = await axiosInstance.put(`/api/businesses/${businessId}`, {
        ...editForm,
        deliveryFeeInState: Number(editForm.deliveryFeeInState) || 0,
        deliveryFeeOutState: Number(editForm.deliveryFeeOutState) || 0,
        socialLinks: business.socialLinks || {},
        highlights: business.highlights || [],
      });

      setBusiness(response.data);
      setIsEditing(false);
    } catch (error) {
      setFormError(error.response?.data?.message || "Unable to update your business information right now.");
    } finally {
      setSaving(false);
    }
  };

  if (showLoader) {
    return <Loader text="Loading dashboard..." />;
  }

  if (!business) {
    return (
      <div className="flex justify-center items-center h-screen">
        <div className="text-xl text-red-600">Business not found</div>
      </div>
    );
  }

  const handleLogout = () => {
    logout();
    navigate("/");
  };

  const storeLink = `${window.location.origin}/business/${business.slug || business._id}`;

  const handleCopyLink = async () => {
    try {
      await navigator.clipboard.writeText(storeLink);
      setCopiedLink(true);
      setTimeout(() => setCopiedLink(false), 2000);
    } catch (error) {
      console.error("Copy failed:", error);
    }
  };

  const filteredOrders =
    orderStatusFilter === "all"
      ? orders
      : orders.filter((o) => o.paymentStatus === orderStatusFilter);

  const orderStats = {
    total: orders.length,
    pending: orders.filter((o) => o.paymentStatus === "pending").length,
    paid: orders.filter((o) => o.paymentStatus === "paid").length,
    failed: orders.filter((o) => o.paymentStatus === "failed").length,
    revenue: orders
      .filter((o) => o.paymentStatus === "paid")
      .reduce((sum, o) => sum + Number(o.total || 0), 0),
  };

  // Documents-incomplete reminder is now a dismissible popup, not a
  // countdown — verification no longer auto-hides the store. An admin
  // approval overrides the automatic tier check entirely — the bank-name
  // auto-match can false-negative even for a legit vendor (e.g. name
  // formatting differences), and once a human has manually approved them
  // the form shouldn't keep reappearing regardless of what
  // verificationTier still says.
  const needsVerification =
    vendorStatus?.reviewStatus !== "approved" &&
    (vendorStatus?.verificationTier || "incomplete") === "incomplete";

  // Subscription reminder: purely computed from subscriptionExpiresAt, no
  // cron/status field to trust — matches how the backend gates public
  // listing visibility (live check, restored the instant a payment lands).
  const subscriptionExpiresAt = business.subscriptionExpiresAt ? new Date(business.subscriptionExpiresAt) : null;
  const daysUntilSubExpiry = subscriptionExpiresAt
    ? Math.ceil((subscriptionExpiresAt.getTime() - Date.now()) / (1000 * 60 * 60 * 24))
    : null;
  const subExpired = daysUntilSubExpiry !== null && daysUntilSubExpiry < 0;
  const subExpiringSoon = daysUntilSubExpiry !== null && daysUntilSubExpiry >= 0 && daysUntilSubExpiry <= 4;

  // A business that's never subscribed at all (subscriptionExpiresAt is
  // null) falls through the two checks above entirely — neither counts
  // "never started" as "expiring" or "expired". Only worth nudging when
  // visibility enforcement is actually on (see businessController.getBusiness)
  // and nothing else is exempting them from it, same override order the
  // backend uses for the public listing itself.
  const grandfathered =
    business.grandfatherExemptUntil && Date.now() <= new Date(business.grandfatherExemptUntil).getTime();
  const neverSubscribed =
    business.enforceSubscriptionVisibility &&
    !subscriptionExpiresAt &&
    !business.visibilityExempt &&
    !grandfathered;

  return (
    <div className="min-h-screen bg-gradient-to-br from-green-50 via-white to-yellow-50">
      <AccountAlertsPopup
        businessId={businessId}
        needsVerification={needsVerification}
        subExpired={subExpired}
        subExpiringSoon={subExpiringSoon}
        neverSubscribed={neverSubscribed}
        daysUntilSubExpiry={daysUntilSubExpiry}
        onGoToVerification={() => setActiveTab("payouts")}
        onGoToSubscription={() => setActiveTab("subscription")}
      />

      <div
        className="relative h-60 sm:h-72 overflow-hidden"
        style={{
          backgroundImage: business.banner ? `url(${business.banner})` : "linear-gradient(135deg, #16a34a, #facc15)",
          backgroundSize: "cover",
          backgroundPosition: "center"
        }}
      >
        <div className="absolute inset-0 bg-gradient-to-r from-green-900/60 via-emerald-900/30 to-yellow-500/20" />
        <div className="relative max-w-7xl mx-auto px-4 py-6 h-full flex items-end justify-between gap-4">
          <div className="flex items-center gap-4 pb-6">
            <div className="w-20 h-20 sm:w-24 sm:h-24 rounded-2xl border-4 border-white bg-white shadow-lg overflow-hidden">
              {business.logo ? (
                <img src={business.logo} alt={business.name} className="w-full h-full object-cover" />
              ) : (
                <div className="w-full h-full flex items-center justify-center bg-gradient-to-br from-green-500 to-yellow-400 text-xl font-black text-white">
                  {business.name?.slice(0, 1).toUpperCase()}
                </div>
              )}
            </div>
            <div className="text-white">
              <p className="text-xs uppercase tracking-[0.2em] text-green-100">Vendor dashboard</p>
              <h1 className="text-3xl sm:text-4xl font-black mt-1">{business.name}</h1>
              <p className="text-sm sm:text-base text-green-50 mt-1">{business.category} • {business.location}</p>
            </div>
          </div>

          <button
            onClick={handleLogout}
            className="mb-6 flex items-center gap-2 px-4 py-2 bg-white/15 border border-white/30 text-white rounded-xl hover:bg-white/20 transition backdrop-blur-sm"
          >
            <LogOut size={18} />
            Logout
          </button>
        </div>
      </div>

      <div className="bg-white border-b sticky top-0 z-10 shadow-sm">
        <div className="max-w-7xl mx-auto px-4">
          <div className="flex gap-3 sm:gap-6 overflow-x-auto">
            <button
              onClick={() => setActiveTab("products")}
              className={`py-4 px-2 border-b-2 font-semibold transition-colors whitespace-nowrap ${
                activeTab === "products"
                  ? "border-green-600 text-green-700"
                  : "border-transparent text-gray-500 hover:text-gray-700"
              }`}
            >
              My Products
            </button>

            <button
              onClick={() => setActiveTab("add")}
              className={`py-4 px-2 border-b-2 font-semibold transition-colors whitespace-nowrap ${
                activeTab === "add"
                  ? "border-green-600 text-green-700"
                  : "border-transparent text-gray-500 hover:text-gray-700"
              }`}
            >
              Add Product
            </button>

            <button
              onClick={() => setActiveTab("orders")}
              className={`py-4 px-2 border-b-2 font-semibold transition-colors whitespace-nowrap ${
                activeTab === "orders"
                  ? "border-green-600 text-green-700"
                  : "border-transparent text-gray-500 hover:text-gray-700"
              }`}
            >
              Orders
            </button>

            <button
              onClick={() => setActiveTab("settings")}
              className={`py-4 px-2 border-b-2 font-semibold transition-colors whitespace-nowrap ${
                activeTab === "settings"
                  ? "border-green-600 text-green-700"
                  : "border-transparent text-gray-500 hover:text-gray-700"
              }`}
            >
              Business Settings
            </button>

            <button
              onClick={() => setActiveTab("payouts")}
              className={`py-4 px-2 border-b-2 font-semibold transition-colors whitespace-nowrap ${
                activeTab === "payouts"
                  ? "border-green-600 text-green-700"
                  : "border-transparent text-gray-500 hover:text-gray-700"
              }`}
            >
              Payouts & Verification
            </button>

            <button
              onClick={() => setActiveTab("subscription")}
              className={`py-4 px-2 border-b-2 font-semibold transition-colors whitespace-nowrap ${
                activeTab === "subscription"
                  ? "border-green-600 text-green-700"
                  : "border-transparent text-gray-500 hover:text-gray-700"
              }`}
            >
              Subscription
            </button>

            <button
              onClick={() => setActiveTab("referrals")}
              className={`py-4 px-2 border-b-2 font-semibold transition-colors whitespace-nowrap ${
                activeTab === "referrals"
                  ? "border-green-600 text-green-700"
                  : "border-transparent text-gray-500 hover:text-gray-700"
              }`}
            >
              Referrals & Points
            </button>

            <button
              onClick={() => setActiveTab("reviews")}
              className={`py-4 px-2 border-b-2 font-semibold transition-colors whitespace-nowrap ${
                activeTab === "reviews"
                  ? "border-green-600 text-green-700"
                  : "border-transparent text-gray-500 hover:text-gray-700"
              }`}
            >
              Reviews
            </button>

            <button
              onClick={() => setActiveTab("disputes")}
              className={`py-4 px-2 border-b-2 font-semibold transition-colors whitespace-nowrap ${
                activeTab === "disputes"
                  ? "border-green-600 text-green-700"
                  : "border-transparent text-gray-500 hover:text-gray-700"
              }`}
            >
              Disputes
            </button>
          </div>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-4 py-8">
        {activeTab === "products" && <ProductList businessId={businessId} />}

        {activeTab === "subscription" && (
          <SubscriptionTab businessId={businessId} business={business} email={user?.email} />
        )}

        {activeTab === "referrals" && <ReferralPointsTab businessId={businessId} />}

        {activeTab === "reviews" && <VendorReviewsTab businessId={businessId} />}

        {activeTab === "disputes" && <VendorDisputesTab businessId={businessId} />}

        {activeTab === "add" && (
          <AddProductForm
            businessId={businessId}
            onProductAdded={handleProductAdded}
          />
        )}

        {activeTab === "orders" && (
          <div>
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
              <div className="bg-white rounded-2xl border border-green-100 shadow-sm p-5">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-xs font-medium text-gray-500">Total Orders</p>
                    <p className="text-2xl font-bold text-gray-900 mt-1">{orderStats.total}</p>
                  </div>
                  <ShoppingBag className="text-green-600" size={26} />
                </div>
              </div>
              <div className="bg-white rounded-2xl border border-yellow-100 shadow-sm p-5">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-xs font-medium text-gray-500">Pending</p>
                    <p className="text-2xl font-bold text-gray-900 mt-1">{orderStats.pending}</p>
                  </div>
                  <Clock className="text-yellow-500" size={26} />
                </div>
              </div>
              <div className="bg-white rounded-2xl border border-green-100 shadow-sm p-5">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-xs font-medium text-gray-500">Paid</p>
                    <p className="text-2xl font-bold text-gray-900 mt-1">{orderStats.paid}</p>
                  </div>
                  <CheckCircle2 className="text-green-600" size={26} />
                </div>
              </div>
              <div className="bg-white rounded-2xl border border-green-100 shadow-sm p-5">
                <p className="text-xs font-medium text-gray-500">Revenue (Paid)</p>
                <p className="text-2xl font-bold text-green-700 mt-1">
                  ₦{orderStats.revenue.toLocaleString()}
                </p>
              </div>
            </div>

            <div className="bg-white rounded-2xl shadow-sm border border-green-100 overflow-hidden">
              <div className="p-5 sm:p-6 border-b border-gray-100 flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                <h2 className="text-lg font-bold text-gray-900">
                  Orders <span className="text-gray-400 font-normal">({filteredOrders.length})</span>
                </h2>
                <div className="flex flex-wrap gap-2">
                  {[
                    { value: "all", label: "All" },
                    { value: "paid", label: "Paid" },
                    { value: "pending", label: "Pending" },
                    { value: "failed", label: "Failed" },
                  ].map((filter) => (
                    <button
                      key={filter.value}
                      onClick={() => setOrderStatusFilter(filter.value)}
                      className={`px-3 py-1.5 rounded-full text-sm font-medium transition border ${
                        orderStatusFilter === filter.value
                          ? "bg-green-600 border-green-600 text-white"
                          : "bg-white border-gray-200 text-gray-600 hover:bg-gray-50"
                      }`}
                    >
                      {filter.label}
                    </button>
                  ))}
                </div>
              </div>

              {ordersLoading ? (
                <div className="p-10 text-center text-gray-500">Loading orders...</div>
              ) : ordersError ? (
                <div className="p-6 m-5 rounded-xl border border-red-200 bg-red-50 text-sm text-red-700">
                  {ordersError}
                </div>
              ) : filteredOrders.length === 0 ? (
                <div className="p-10 text-center">
                  <ShoppingBag className="mx-auto text-gray-300 mb-3" size={40} />
                  <p className="text-gray-500">No orders yet in this category.</p>
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full">
                    <thead className="bg-gray-50">
                      <tr>
                        <th className="text-left p-4 text-xs font-semibold text-gray-500 uppercase tracking-wide">Reference</th>
                        <th className="text-left p-4 text-xs font-semibold text-gray-500 uppercase tracking-wide">Customer</th>
                        <th className="text-left p-4 text-xs font-semibold text-gray-500 uppercase tracking-wide">Items</th>
                        <th className="text-left p-4 text-xs font-semibold text-gray-500 uppercase tracking-wide">Total</th>
                        <th className="text-left p-4 text-xs font-semibold text-gray-500 uppercase tracking-wide">Status</th>
                        <th className="text-left p-4 text-xs font-semibold text-gray-500 uppercase tracking-wide">Date</th>
                      </tr>
                    </thead>
                    <tbody>
                      {filteredOrders.map((order) => (
                        <tr key={order._id} className="border-b border-gray-100 hover:bg-gray-50">
                          <td className="p-4 text-sm font-medium text-gray-700">{order.reference}</td>
                          <td className="p-4">
                            <p className="font-medium text-gray-900">{order.customer?.fullName}</p>
                            <p className="text-sm text-gray-500">{order.customer?.phone}</p>
                          </td>
                          <td className="p-4 text-sm text-gray-600">{order.items?.length || 0}</td>
                          <td className="p-4 font-semibold text-gray-900">₦{Number(order.total || 0).toLocaleString()}</td>
                          <td className="p-4">
                            <span
                              className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-semibold ${
                                order.paymentStatus === "paid"
                                  ? "bg-green-100 text-green-700 border border-green-200"
                                  : order.paymentStatus === "failed"
                                  ? "bg-red-100 text-red-700 border border-red-200"
                                  : "bg-yellow-100 text-yellow-700 border border-yellow-200"
                              }`}
                            >
                              {order.paymentStatus === "paid" && <CheckCircle2 size={12} />}
                              {order.paymentStatus === "failed" && <XCircle size={12} />}
                              {order.paymentStatus === "pending" && <Clock size={12} />}
                              {order.paymentStatus}
                            </span>
                          </td>
                          <td className="p-4 text-sm text-gray-500">
                            {new Date(order.createdAt).toLocaleString()}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </div>
        )}

        {activeTab === "settings" && (
          <div className="bg-white rounded-2xl shadow-md p-6 sm:p-8 border border-green-100">
            <div className="flex items-center justify-between mb-6">
              <h2 className="text-2xl font-bold text-gray-900">Business Information</h2>
              <span className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-yellow-100 text-yellow-700 border border-yellow-200 text-sm font-semibold">
                Live profile
              </span>
            </div>

            {formError && (
              <div className="mb-4 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
                {formError}
              </div>
            )}

            {/* Store link — shown in both view and edit mode */}
            <div className="mb-6 bg-gradient-to-r from-green-50 to-yellow-50 border border-green-100 rounded-2xl p-4 sm:p-5">
              <div className="flex items-center gap-2 mb-2">
                <Share2 size={16} className="text-green-600" />
                <p className="text-sm font-semibold text-gray-700">Your store link</p>
              </div>
              <div className="flex flex-col sm:flex-row gap-2">
                <div className="flex-1 px-3 py-2 bg-white rounded-xl border border-gray-200 text-sm text-gray-700 truncate">
                  {storeLink}
                </div>
                <button
                  type="button"
                  onClick={handleCopyLink}
                  className="flex items-center justify-center gap-2 px-4 py-2 bg-green-600 text-white rounded-xl font-medium text-sm hover:bg-green-700 transition shrink-0"
                >
                  {copiedLink ? <Check size={16} /> : <Copy size={16} />}
                  {copiedLink ? "Copied!" : "Copy Link"}
                </button>
              </div>
              {!business.slug && (
                <p className="text-xs text-gray-500 mt-2">
                  Edit your business info below to set a custom store name for this link.
                </p>
              )}
            </div>

            {!isEditing ? (
              <>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <div className="space-y-5">
                    <div>
                      <label className="block text-sm font-medium text-gray-700">Business Name</label>
                      <p className="mt-1 text-lg font-semibold text-gray-900">{business.name}</p>
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700">Description</label>
                      <p className="mt-1 text-gray-700">{business.description || "No description added yet."}</p>
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700">Category</label>
                      <p className="mt-1 text-gray-900">{business.category}</p>
                    </div>
                  </div>

                  <div className="space-y-5">
                    <div>
                      <label className="block text-sm font-medium text-gray-700">Location</label>
                      <p className="mt-1 text-gray-900">{business.location}</p>
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700">Contact</label>
                      <p className="mt-1 text-gray-900">{business.contact}</p>
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700">Delivery Fee (within your state)</label>
                      <p className="mt-1 text-gray-900">
                        {business.deliveryFeeInState ? `₦${Number(business.deliveryFeeInState).toLocaleString()}` : "Not set"}
                      </p>
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700">Delivery Fee (outside your state)</label>
                      <p className="mt-1 text-gray-900">
                        {business.deliveryFeeOutState ? `₦${Number(business.deliveryFeeOutState).toLocaleString()}` : "Not set"}
                      </p>
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700">Profile image</label>
                      <div className="mt-2 flex items-center gap-3">
                        {business.logo ? (
                          <img src={business.logo} alt={business.name} className="w-16 h-16 rounded-xl object-cover border border-gray-200" />
                        ) : (
                          <div className="w-16 h-16 rounded-xl bg-gradient-to-br from-green-100 to-yellow-100 text-green-700 font-bold flex items-center justify-center">N/A</div>
                        )}
                        <span className="text-sm text-gray-500">{business.logo ? "Uploaded and in use" : "No profile image added yet"}</span>
                      </div>
                    </div>
                  </div>
                </div>

                <div className="mt-8 flex justify-end">
                  <button
                    type="button"
                    onClick={() => setIsEditing(true)}
                    className="px-6 py-3 bg-gradient-to-r from-green-600 to-yellow-500 text-white font-semibold rounded-xl hover:opacity-90 transition shadow-md"
                  >
                    Edit Business Info
                  </button>
                </div>
              </>
            ) : (
              <div className="space-y-5">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Business Name</label>
                    <input
                      type="text"
                      name="name"
                      value={editForm.name}
                      onChange={handleEditFieldChange}
                      className="w-full rounded-xl border border-gray-300 px-3 py-2 focus:outline-none focus:ring-2 focus:ring-green-500"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Category</label>
                    <select
                      name="category"
                      value={editForm.category}
                      onChange={handleEditFieldChange}
                      className="w-full rounded-xl border border-gray-300 px-3 py-2 focus:outline-none focus:ring-2 focus:ring-green-500"
                    >
                      <option value="">Select category</option>
                      <option value="Food">Food & Drinks</option>
                      <option value="Fashion">Fashion</option>
                      <option value="Tech">Tech & Electronics</option>
                      <option value="Beauty">Beauty & Health</option>
                      <option value="Fitness">Fitness</option>
                      <option value="Groceries">Groceries</option>
                      <option value="Other">Other</option>
                    </select>
                  </div>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Description</label>
                  <textarea
                    name="description"
                    rows="4"
                    value={editForm.description}
                    onChange={handleEditFieldChange}
                    className="w-full rounded-xl border border-gray-300 px-3 py-2 focus:outline-none focus:ring-2 focus:ring-green-500"
                  />
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Location</label>
                    <input
                      type="text"
                      name="location"
                      value={editForm.location}
                      onChange={handleEditFieldChange}
                      placeholder="e.g. Lagos"
                      className="w-full rounded-xl border border-gray-300 px-3 py-2 focus:outline-none focus:ring-2 focus:ring-green-500"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Contact</label>
                    <input
                      type="text"
                      name="contact"
                      value={editForm.contact}
                      onChange={handleEditFieldChange}
                      className="w-full rounded-xl border border-gray-300 px-3 py-2 focus:outline-none focus:ring-2 focus:ring-green-500"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Store link name
                  </label>
                  <div className="flex items-center rounded-xl border border-gray-300 focus-within:ring-2 focus-within:ring-green-500 overflow-hidden">
                    <span className="pl-3 pr-1 text-sm text-gray-400 whitespace-nowrap">
                      {window.location.origin}/business/
                    </span>
                    <input
                      type="text"
                      name="slug"
                      value={editForm.slug}
                      onChange={handleEditFieldChange}
                      placeholder="your-store-name"
                      className="flex-1 min-w-0 px-1 py-2 focus:outline-none"
                    />
                  </div>
                  <p className="text-xs text-gray-400 mt-1">
                    Letters, numbers, and hyphens only. This is the link you'll share with customers.
                  </p>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Delivery Fee — within your state (₦)
                    </label>
                    <input
                      type="number"
                      min="0"
                      name="deliveryFeeInState"
                      value={editForm.deliveryFeeInState}
                      onChange={handleEditFieldChange}
                      placeholder="e.g. 1500"
                      className="w-full rounded-xl border border-gray-300 px-3 py-2 focus:outline-none focus:ring-2 focus:ring-green-500"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Delivery Fee — outside your state (₦)
                    </label>
                    <input
                      type="number"
                      min="0"
                      name="deliveryFeeOutState"
                      value={editForm.deliveryFeeOutState}
                      onChange={handleEditFieldChange}
                      placeholder="e.g. 3500"
                      className="w-full rounded-xl border border-gray-300 px-3 py-2 focus:outline-none focus:ring-2 focus:ring-green-500"
                    />
                  </div>
                </div>
                <p className="text-xs text-gray-400 -mt-3">
                  Your "Location" state above determines which fee buyers are charged — the in-state fee applies to buyers in {editForm.location || "your state"}, and the outside-state fee applies everywhere else.
                </p>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Logo image</label>
                    <input
                      type="file"
                      accept="image/*"
                      name="logo"
                      onChange={handleEditImageUpload}
                      className="w-full rounded-xl border border-gray-300 px-3 py-2 file:mr-3 file:rounded file:border-0 file:bg-green-600 file:px-3 file:py-2 file:text-white file:font-medium hover:file:bg-green-700"
                    />
                    {editForm.logo && (
                      <img src={editForm.logo} alt="Logo preview" className="mt-3 h-20 w-20 rounded-xl object-cover border border-gray-200" />
                    )}
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Banner image</label>
                    <input
                      type="file"
                      accept="image/*"
                      name="banner"
                      onChange={handleEditImageUpload}
                      className="w-full rounded-xl border border-gray-300 px-3 py-2 file:mr-3 file:rounded file:border-0 file:bg-green-600 file:px-3 file:py-2 file:text-white file:font-medium hover:file:bg-green-700"
                    />
                    {editForm.banner && (
                      <img src={editForm.banner} alt="Banner preview" className="mt-3 h-20 w-full rounded-xl object-cover border border-gray-200" />
                    )}
                  </div>
                </div>

                <div className="flex justify-end gap-3 pt-2">
                  <button
                    type="button"
                    onClick={() => {
                      setIsEditing(false);
                      setFormError("");
                    }}
                    className="px-5 py-2.5 rounded-xl border border-gray-300 text-gray-700 font-medium hover:bg-gray-50"
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    onClick={saveBusinessChanges}
                    disabled={saving}
                    className="px-5 py-2.5 rounded-xl bg-gradient-to-r from-green-600 to-yellow-500 text-white font-semibold disabled:opacity-70 hover:opacity-90 transition"
                  >
                    {saving ? "Saving..." : "Save Changes"}
                  </button>
                </div>
              </div>
            )}
          </div>
        )}

        {activeTab === "payouts" && (
          <div>
            {earningsSummary && (
              <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5 mb-6">
                <p className="text-xs uppercase tracking-wide text-gray-400 font-semibold">Total earned</p>
                <p className="text-2xl font-black text-gray-900 mt-1">
                  ₦{earningsSummary.totalEarned.toLocaleString()}
                </p>
                <p className="text-xs text-gray-400 mt-1">
                  From {earningsSummary.ordersCount} paid order{earningsSummary.ordersCount === 1 ? "" : "s"} — already
                  settled to your bank
                </p>
              </div>
            )}
            {vendorStatus && !vendorStatus.notificationSeen && vendorStatus.reviewStatus !== "pending" && (
              <div
                className={`mb-6 rounded-2xl border p-5 flex items-start justify-between gap-4 ${
                  vendorStatus.reviewStatus === "approved"
                    ? "bg-green-50 border-green-200"
                    : "bg-red-50 border-red-200"
                }`}
              >
                <div>
                  <p
                    className={`font-semibold ${
                      vendorStatus.reviewStatus === "approved" ? "text-green-700" : "text-red-700"
                    }`}
                  >
                    {vendorStatus.reviewStatus === "approved"
                      ? "Your vendor verification was approved!"
                      : "Your vendor verification was rejected"}
                  </p>
                  {vendorStatus.reviewStatus === "rejected" && vendorStatus.reviewNotes && (
                    <p className="text-sm text-red-600 mt-1">{vendorStatus.reviewNotes}</p>
                  )}
                </div>
                <button
                  type="button"
                  onClick={acknowledgeVendorNotification}
                  className="shrink-0 px-3 py-1.5 rounded-lg text-sm font-medium border border-gray-300 text-gray-700 hover:bg-white transition"
                >
                  Got it
                </button>
              </div>
            )}

            {vendorStatus?.reviewStatus === "pending" && (
              <div className="mb-6 rounded-2xl border border-yellow-200 bg-yellow-50 p-5">
                <p className="font-semibold text-yellow-700">Your submission is under review</p>
                <p className="text-sm text-yellow-700 mt-1">
                  We'll let you know here once an admin has checked your details.
                </p>
              </div>
            )}

            <VendorOnboardingForm onSubmitted={() => fetchVendorStatus()} />
          </div>
        )}
      </div>
    </div>
  );
};

export default BusinessDashboard;