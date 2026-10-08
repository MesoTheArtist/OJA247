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
import { LogOut, ShoppingBag, Clock, CheckCircle2, XCircle, Copy, Check, Share2, Truck } from "lucide-react";
import { useDialog } from "../components/DialogProvider";
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
    socialLinks: { facebook: "", instagram: "", twitter: "", website: "" },
    highlights: [],
  });
  const [highlightInput, setHighlightInput] = useState("");

  const [orders, setOrders] = useState([]);
  const [ordersLoading, setOrdersLoading] = useState(false);
  const [ordersError, setOrdersError] = useState("");
  const [shippingRef, setShippingRef] = useState(null);
  // Bank-transfer orders: which order is being confirmed, and the reject form.
  const [confirmingRef, setConfirmingRef] = useState(null);
  const [rejectTarget, setRejectTarget] = useState(null);
  const [rejectReason, setRejectReason] = useState("");
  const [rejecting, setRejecting] = useState(false);
  const { confirm, notify } = useDialog();
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

  // Loads the edit form from the saved business. Also used by Cancel, so
  // abandoned edits don't reappear the next time the form is opened.
  const resetEditForm = (b) => {
    if (!b) return;
    setEditForm({
      name: b.name || "",
      description: b.description || "",
      category: b.category || "",
      location: b.location || "",
      contact: b.contact || "",
      logo: b.logo || "",
      banner: b.banner || "",
      deliveryFeeInState: b.deliveryFeeInState ?? "",
      deliveryFeeOutState: b.deliveryFeeOutState ?? "",
      slug: b.slug || "",
      socialLinks: {
        facebook: b.socialLinks?.facebook || "",
        instagram: b.socialLinks?.instagram || "",
        twitter: b.socialLinks?.twitter || "",
        website: b.socialLinks?.website || "",
      },
      highlights: Array.isArray(b.highlights) ? b.highlights : [],
    });
    setHighlightInput("");
  };

  useEffect(() => {
    resetEditForm(business);
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

  // This business's own slice of an order (an order can span several vendors,
  // and each one ships separately). Orders from before delivery tracking
  // existed have no value, which counts as "processing".
  const vendorPartOf = (order) => order.vendors?.find((v) => v.businessId === businessId);

  const markShipped = async (order) => {
    const ok = await confirm({
      title: "Mark as sent out?",
      message: `${order.customer?.fullName || "The customer"} will be emailed so they can confirm when order ${order.reference} arrives.`,
      confirmLabel: "Yes, it's sent out",
    });
    if (!ok) return;
    setShippingRef(order.reference);
    try {
      const res = await axiosInstance.patch(`/api/orders/${order.reference}/ship`, { businessId });
      setOrders((prev) => prev.map((o) => (o._id === res.data.order._id ? res.data.order : o)));
    } catch (error) {
      await notify({
        title: "Couldn't update the order",
        message: error.response?.data?.message || "Something went wrong. Please try again.",
        tone: "error",
      });
    } finally {
      setShippingRef(null);
    }
  };

  // Merge an updated order into the list, keeping the signed receipt links the
  // list was loaded with (the update responses don't carry them).
  const mergeOrder = (updated) =>
    setOrders((prev) =>
      prev.map((o) => (o._id === updated._id ? { ...o, ...updated, paymentReceipts: o.paymentReceipts } : o))
    );

  // Block / unblock a customer email from placing new orders at this store.
  const blockedEmails = (vendorStatus?.blockedCustomerEmails || []).map((e) => String(e).toLowerCase());
  const isBlocked = (order) => blockedEmails.includes(String(order.customer?.email || "").toLowerCase());

  const toggleBlockCustomer = async (order) => {
    const email = String(order.customer?.email || "").trim();
    if (!email) return;
    const blocking = !isBlocked(order);

    if (blocking) {
      const ok = await confirm({
        title: "Block this customer?",
        message: `${email} won't be able to place new orders at your store. Orders they already placed aren't affected. You can unblock them any time.`,
        confirmLabel: "Block customer",
        tone: "danger",
      });
      if (!ok) return;
    }

    try {
      const { data } = blocking
        ? await axiosInstance.post("/api/vendors/me/blocked-customers", { email })
        : await axiosInstance.delete("/api/vendors/me/blocked-customers", { data: { email } });
      setVendorStatus((prev) => (prev ? { ...prev, blockedCustomerEmails: data.data.blockedCustomerEmails } : prev));
    } catch (error) {
      await notify({
        title: blocking ? "Couldn't block this customer" : "Couldn't unblock this customer",
        message: error.response?.data?.message || "Please try again.",
        tone: "error",
      });
    }
  };

  const confirmTransfer = async (order) => {
    const ok = await confirm({
      title: "Payment received?",
      message: `Only confirm once ₦${Number(order.total || 0).toLocaleString()} is really in your bank account. A receipt can be faked, so check your own bank first. The customer will be emailed.`,
      confirmLabel: "Yes, I got the money",
    });
    if (!ok) return;
    setConfirmingRef(order.reference);
    try {
      const res = await axiosInstance.patch(`/api/orders/${order.reference}/payment/confirm`);
      mergeOrder(res.data.order);
    } catch (error) {
      await notify({
        title: "Couldn't confirm the payment",
        message: error.response?.data?.message || "Something went wrong. Please try again.",
        tone: "error",
      });
    } finally {
      setConfirmingRef(null);
    }
  };

  const submitReject = async (e) => {
    e.preventDefault();
    if (rejectReason.trim().length < 5) {
      await notify({
        title: "Add a reason",
        message: "Please tell the customer why you are rejecting this payment.",
        tone: "error",
      });
      return;
    }
    setRejecting(true);
    try {
      const res = await axiosInstance.patch(`/api/orders/${rejectTarget.reference}/payment/reject`, {
        reason: rejectReason.trim(),
      });
      mergeOrder(res.data.order);
      setRejectTarget(null);
      setRejectReason("");
    } catch (error) {
      await notify({
        title: "Couldn't reject the payment",
        message: error.response?.data?.message || "Something went wrong. Please try again.",
        tone: "error",
      });
    } finally {
      setRejecting(false);
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
    if (name.startsWith("socialLinks.")) {
      const key = name.split(".")[1];
      setEditForm((prev) => ({ ...prev, socialLinks: { ...prev.socialLinks, [key]: value } }));
      return;
    }
    setEditForm((prev) => ({ ...prev, [name]: value }));
  };

  const MAX_HIGHLIGHTS = 10;
  const addHighlight = () => {
    const text = highlightInput.trim();
    if (!text) return;
    if (editForm.highlights.some((h) => h.toLowerCase() === text.toLowerCase())) {
      setHighlightInput("");
      return;
    }
    if (editForm.highlights.length >= MAX_HIGHLIGHTS) {
      setFormError(`You can add up to ${MAX_HIGHLIGHTS} highlights.`);
      return;
    }
    setFormError("");
    setEditForm((prev) => ({ ...prev, highlights: [...prev.highlights, text] }));
    setHighlightInput("");
  };
  const removeHighlight = (index) =>
    setEditForm((prev) => ({ ...prev, highlights: prev.highlights.filter((_, i) => i !== index) }));

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
        socialLinks: editForm.socialLinks,
        highlights: editForm.highlights,
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
  // Expired / expiring warnings are about being hidden from customers, so they
  // only apply while visibility is enforced and nothing exempts the store —
  // the same rule the reminder emails follow.
  const grandfatheredNow =
    business.grandfatherExemptUntil && Date.now() <= new Date(business.grandfatherExemptUntil).getTime();
  const subscriptionRulesApply =
    business.enforceSubscriptionVisibility && !business.visibilityExempt && !grandfatheredNow;
  const subExpired = subscriptionRulesApply && daysUntilSubExpiry !== null && daysUntilSubExpiry < 0;
  const subExpiringSoon =
    subscriptionRulesApply && daysUntilSubExpiry !== null && daysUntilSubExpiry >= 0 && daysUntilSubExpiry <= 4;

  // A business that's never subscribed at all (subscriptionExpiresAt is
  // null) falls through the two checks above entirely — neither counts
  // "never started" as "expiring" or "expired". Only worth nudging when
  // visibility enforcement is actually on (see businessController.getBusiness)
  // and nothing else is exempting them from it, same override order the
  // backend uses for the public listing itself.
  const neverSubscribed = subscriptionRulesApply && !subscriptionExpiresAt;

  return (
    <div className="min-h-screen bg-gradient-to-br from-green-50 via-white to-yellow-50" style={{ overflowX: "clip" }}>
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
        <div className="relative max-w-7xl mx-auto px-4 py-6 h-full flex items-end justify-between gap-3">
          <div className="flex items-center gap-3 sm:gap-4 pb-4 sm:pb-6 min-w-0 flex-1">
            <div className="shrink-0 w-16 h-16 sm:w-24 sm:h-24 rounded-2xl border-4 border-white bg-white shadow-lg overflow-hidden">
              {business.logo ? (
                <img src={business.logo} alt={business.name} className="w-full h-full object-cover" />
              ) : (
                <div className="w-full h-full flex items-center justify-center bg-gradient-to-br from-green-500 to-yellow-400 text-xl font-black text-white">
                  {business.name?.slice(0, 1).toUpperCase()}
                </div>
              )}
            </div>
            <div className="text-white min-w-0">
              <p className="text-xs uppercase tracking-[0.2em] text-green-100">Vendor dashboard</p>
              <h1 className="text-2xl sm:text-4xl font-black mt-1 break-words line-clamp-2">{business.name}</h1>
              <p className="text-sm sm:text-base text-green-50 mt-1 truncate">{business.category} • {business.location}</p>
            </div>
          </div>

          <button
            onClick={handleLogout}
            aria-label="Logout"
            className="mb-4 sm:mb-6 shrink-0 flex items-center gap-2 px-3 sm:px-4 py-2 bg-white/15 border border-white/30 text-white rounded-xl hover:bg-white/20 transition backdrop-blur-sm"
          >
            <LogOut size={18} />
            <span className="hidden sm:inline">Logout</span>
          </button>
        </div>
      </div>

      <div className="bg-white border-b sticky top-0 z-10 shadow-sm">
        <div className="max-w-7xl mx-auto px-4">
          <div className="flex gap-3 sm:gap-6 overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
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
              Bank & Verification
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

      <div className="max-w-7xl mx-auto px-4 py-6 sm:py-8">
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
              <div className="bg-white rounded-2xl border border-green-100 shadow-sm p-4 sm:p-5 min-w-0">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-xs font-medium text-gray-500">Total Orders</p>
                    <p className="text-xl sm:text-2xl font-bold text-gray-900 mt-1">{orderStats.total}</p>
                  </div>
                  <ShoppingBag className="text-green-600" size={26} />
                </div>
              </div>
              <div className="bg-white rounded-2xl border border-yellow-100 shadow-sm p-4 sm:p-5 min-w-0">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-xs font-medium text-gray-500">Pending</p>
                    <p className="text-xl sm:text-2xl font-bold text-gray-900 mt-1">{orderStats.pending}</p>
                  </div>
                  <Clock className="text-yellow-500" size={26} />
                </div>
              </div>
              <div className="bg-white rounded-2xl border border-green-100 shadow-sm p-4 sm:p-5 min-w-0">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-xs font-medium text-gray-500">Paid</p>
                    <p className="text-xl sm:text-2xl font-bold text-gray-900 mt-1">{orderStats.paid}</p>
                  </div>
                  <CheckCircle2 className="text-green-600" size={26} />
                </div>
              </div>
              <div className="bg-white rounded-2xl border border-green-100 shadow-sm p-4 sm:p-5 min-w-0">
                <p className="text-xs font-medium text-gray-500">Revenue (Paid)</p>
                <p className="text-xl sm:text-2xl font-bold text-green-700 mt-1 break-words">
                  ₦{orderStats.revenue.toLocaleString()}
                </p>
              </div>
            </div>

            {rejectTarget && (
              <div
                className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
                onClick={() => !rejecting && setRejectTarget(null)}
              >
                <form
                  onSubmit={submitReject}
                  onClick={(e) => e.stopPropagation()}
                  className="bg-white rounded-2xl shadow-xl w-full max-w-md p-5 sm:p-6"
                >
                  <h3 className="text-lg font-bold text-gray-900 mb-1">Reject this payment</h3>
                  <p className="text-sm text-gray-500 mb-4">
                    Order {rejectTarget.reference}. Your reason is emailed to the customer and shown on their order, and
                    they can upload a new receipt.
                  </p>
                  <label className="block text-sm font-medium text-gray-700 mb-2">Why are you rejecting it?</label>
                  <textarea
                    autoFocus
                    required
                    rows={4}
                    maxLength={500}
                    value={rejectReason}
                    onChange={(e) => setRejectReason(e.target.value)}
                    placeholder="e.g. I checked my account and the money has not arrived yet."
                    className="w-full px-3 py-2 border border-gray-300 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-green-500"
                  />
                  <div className="flex justify-end gap-2 mt-4">
                    <button
                      type="button"
                      disabled={rejecting}
                      onClick={() => setRejectTarget(null)}
                      className="px-4 py-2 rounded-xl border border-gray-200 text-sm font-medium text-gray-700 hover:bg-gray-50"
                    >
                      Cancel
                    </button>
                    <button
                      type="submit"
                      disabled={rejecting}
                      className="px-4 py-2 rounded-xl bg-red-600 hover:bg-red-700 disabled:opacity-60 text-white text-sm font-semibold"
                    >
                      {rejecting ? "Rejecting…" : "Reject payment"}
                    </button>
                  </div>
                </form>
              </div>
            )}

            <div className="bg-white rounded-2xl shadow-sm border border-green-100 overflow-hidden">
              <div className="p-5 sm:p-6 border-b border-gray-100 flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                <h2 className="text-lg font-bold text-gray-900">
                  Orders <span className="text-gray-400 font-normal">({filteredOrders.length})</span>
                </h2>
                <div className="flex flex-wrap gap-2">
                  {[
                    { value: "all", label: "All" },
                    { value: "awaiting_confirmation", label: "Needs confirmation" },
                    { value: "payment_rejected", label: "Rejected" },
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
                  <table className="w-full admin-table">
                    <thead className="bg-gray-50">
                      <tr>
                        <th className="text-left p-4 text-xs font-semibold text-gray-500 uppercase tracking-wide">Reference</th>
                        <th className="text-left p-4 text-xs font-semibold text-gray-500 uppercase tracking-wide">Customer</th>
                        <th className="text-left p-4 text-xs font-semibold text-gray-500 uppercase tracking-wide">Items</th>
                        <th className="text-left p-4 text-xs font-semibold text-gray-500 uppercase tracking-wide">Total</th>
                        <th className="text-left p-4 text-xs font-semibold text-gray-500 uppercase tracking-wide">Status</th>
                        <th className="text-left p-4 text-xs font-semibold text-gray-500 uppercase tracking-wide">Delivery</th>
                        <th className="text-left p-4 text-xs font-semibold text-gray-500 uppercase tracking-wide">Date</th>
                      </tr>
                    </thead>
                    <tbody>
                      {filteredOrders.map((order) => (
                        <tr key={order._id} className="border-b border-gray-100 hover:bg-gray-50">
                          <td data-label="Reference" className="p-4 text-sm font-medium text-gray-700 break-all">{order.reference}</td>
                          <td data-label="Customer" data-stack="true" className="p-4">
                            <p className="font-medium text-gray-900">{order.customer?.fullName}</p>
                            <p className="text-sm text-gray-500">{order.customer?.phone}</p>
                          </td>
                          <td data-label="Items" className="p-4 text-sm text-gray-600">{order.items?.length || 0}</td>
                          <td data-label="Total" className="p-4 font-semibold text-gray-900">₦{Number(order.total || 0).toLocaleString()}</td>
                          <td data-label="Status" className="p-4">
                            <span
                              className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-semibold ${
                                order.paymentStatus === "paid"
                                  ? "bg-green-100 text-green-700 border border-green-200"
                                  : order.paymentStatus === "failed" || order.paymentStatus === "payment_rejected"
                                  ? "bg-red-100 text-red-700 border border-red-200"
                                  : "bg-yellow-100 text-yellow-700 border border-yellow-200"
                              }`}
                            >
                              {order.paymentStatus === "paid" && <CheckCircle2 size={12} />}
                              {(order.paymentStatus === "failed" || order.paymentStatus === "payment_rejected") && (
                                <XCircle size={12} />
                              )}
                              {(order.paymentStatus === "pending" || order.paymentStatus === "awaiting_confirmation") && (
                                <Clock size={12} />
                              )}
                              {{
                                awaiting_confirmation: "Needs your confirmation",
                                payment_rejected: "Rejected",
                              }[order.paymentStatus] || order.paymentStatus}
                            </span>

                            {order.paymentMethod === "bank_transfer" && (
                              <div className="mt-2 space-y-2">
                                <p className="text-xs text-gray-400">Paid by bank transfer</p>

                                {order.paymentInstructions?.accountNumber && (
                                  <p className="text-xs text-gray-500">
                                    Customer was told to pay {order.paymentInstructions.bankName}, account ending{" "}
                                    <span className="font-semibold">{String(order.paymentInstructions.accountNumber).slice(-4)}</span>
                                  </p>
                                )}
                                {order.duplicateReceipt && (
                                  <p className="text-xs font-semibold text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-2 py-1.5">
                                    This exact receipt file was already used on another order. Check your bank carefully before you confirm.
                                  </p>
                                )}
                                {order.payToChanged && (
                                  <p className="text-xs font-semibold text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-2 py-1.5">
                                    You changed your bank account after this order was placed. The customer may have paid the old account, so check that account's statement too.
                                  </p>
                                )}

                                {(order.paymentReceipts || []).map((receipt, idx) =>
                                  receipt.url ? (
                                    <a
                                      key={receipt.publicId}
                                      href={receipt.url}
                                      target="_blank"
                                      rel="noopener noreferrer"
                                      className="block text-xs font-semibold text-green-700 hover:text-green-800 underline"
                                    >
                                      View receipt{(order.paymentReceipts || []).length > 1 ? ` ${idx + 1}` : ""}
                                    </a>
                                  ) : null
                                )}

                                {order.paymentStatus === "awaiting_confirmation" && (
                                  <div className="flex flex-wrap gap-2">
                                    <button
                                      onClick={() => confirmTransfer(order)}
                                      disabled={confirmingRef === order.reference}
                                      className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl bg-green-600 hover:bg-green-700 disabled:opacity-60 text-white text-xs font-semibold transition"
                                    >
                                      <CheckCircle2 size={14} />
                                      {confirmingRef === order.reference ? "Saving…" : "Payment received"}
                                    </button>
                                    <button
                                      onClick={() => {
                                        setRejectReason("");
                                        setRejectTarget(order);
                                      }}
                                      className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl border border-red-200 text-red-700 hover:bg-red-50 text-xs font-semibold transition"
                                    >
                                      <XCircle size={14} />
                                      Reject
                                    </button>
                                  </div>
                                )}

                                {(order.paymentStatus === "awaiting_confirmation" || order.paymentStatus === "payment_rejected") && (
                                  <button
                                    type="button"
                                    onClick={() => toggleBlockCustomer(order)}
                                    className="text-xs font-semibold text-gray-500 hover:text-red-600 underline"
                                  >
                                    {isBlocked(order) ? "Customer blocked · Unblock" : "Block this customer"}
                                  </button>
                                )}

                                {order.paymentStatus === "payment_rejected" && (
                                  <p className="text-xs text-gray-500 max-w-[14rem]">
                                    Your reason: {order.paymentRejections?.[order.paymentRejections.length - 1]?.reason}
                                    <br />
                                    <span className="text-gray-400">Waiting for the customer to upload a new receipt.</span>
                                  </p>
                                )}
                              </div>
                            )}
                          </td>
                          <td data-label="Delivery" data-stack="true" className="p-4">
                            {(() => {
                              const mine = vendorPartOf(order);
                              const delivery = mine?.fulfillmentStatus || "processing";
                              const payable = order.status === "paid" || order.status === "disputed";
                              if (!payable) return <span className="text-sm text-gray-400">—</span>;
                              // Orders placed before delivery tracking existed have no entry
                              // for this business, so there's nothing to update.
                              if (!mine) {
                                return (
                                  <span className="text-xs text-gray-400" title="Placed before delivery tracking was added">
                                    Not tracked
                                  </span>
                                );
                              }
                              if (delivery === "received") {
                                return (
                                  <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-semibold bg-green-100 text-green-700 border border-green-200">
                                    <CheckCircle2 size={12} />
                                    Received{mine?.autoReceived ? " (auto)" : ""}
                                  </span>
                                );
                              }
                              if (delivery === "shipped") {
                                return (
                                  <div>
                                    <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-semibold bg-blue-100 text-blue-700 border border-blue-200">
                                      <Truck size={12} />
                                      Sent out
                                    </span>
                                    <p className="text-xs text-gray-400 mt-1">
                                      Waiting for customer to confirm
                                    </p>
                                  </div>
                                );
                              }
                              return (
                                <button
                                  onClick={() => markShipped(order)}
                                  disabled={shippingRef === order.reference}
                                  className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl bg-green-600 hover:bg-green-700 disabled:opacity-60 text-white text-xs font-semibold transition"
                                >
                                  <Truck size={14} />
                                  {shippingRef === order.reference ? "Saving…" : "Mark as sent out"}
                                </button>
                              );
                            })()}
                          </td>
                          <td data-label="Date" className="p-4 text-sm text-gray-500">
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
          <div className="bg-white rounded-2xl shadow-md p-4 sm:p-8 border border-green-100">
            <div className="flex flex-wrap items-center justify-between gap-2 mb-6">
              <h2 className="text-xl sm:text-2xl font-bold text-gray-900">Business Information</h2>
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
                <div className="flex-1 min-w-0 px-3 py-2 bg-white rounded-xl border border-gray-200 text-sm text-gray-700 truncate">
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
                      <p className="mt-1 text-lg font-semibold text-gray-900 break-words">{business.name}</p>
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700">Description</label>
                      <p className="mt-1 text-gray-700 break-words">{business.description || "No description added yet."}</p>
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700">Category</label>
                      <p className="mt-1 text-gray-900">{business.category}</p>
                    </div>
                  </div>

                  <div className="space-y-5">
                    <div>
                      <label className="block text-sm font-medium text-gray-700">Location</label>
                      <p className="mt-1 text-gray-900 break-words">{business.location}</p>
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700">Contact</label>
                      <p className="mt-1 text-gray-900 break-words">{business.contact}</p>
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

                <div className="mt-8 grid grid-cols-1 md:grid-cols-2 gap-6">
                  <div>
                    <label className="block text-sm font-medium text-gray-700">Social links</label>
                    {Object.values(business.socialLinks || {}).some(Boolean) ? (
                      <ul className="mt-2 space-y-1.5">
                        {[
                          ["facebook", "Facebook"],
                          ["instagram", "Instagram"],
                          ["twitter", "Twitter / X"],
                          ["website", "Website"],
                        ]
                          .filter(([key]) => business.socialLinks?.[key])
                          .map(([key, label]) => (
                            <li key={key} className="text-sm min-w-0">
                              <span className="text-gray-500">{label}: </span>
                              <a
                                href={business.socialLinks[key]}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="text-green-700 hover:underline break-all"
                              >
                                {business.socialLinks[key]}
                              </a>
                            </li>
                          ))}
                      </ul>
                    ) : (
                      <p className="mt-1 text-gray-500">No social links added yet.</p>
                    )}
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700">Highlights</label>
                    {business.highlights?.length > 0 ? (
                      <div className="mt-2 flex flex-wrap gap-2">
                        {business.highlights.map((h, i) => (
                          <span key={`${h}-${i}`} className="text-xs bg-green-50 text-green-700 px-2.5 py-1 rounded-full break-words max-w-full">
                            {h}
                          </span>
                        ))}
                      </div>
                    ) : (
                      <p className="mt-1 text-gray-500">No highlights added yet.</p>
                    )}
                  </div>
                </div>

                <div className="mt-8 flex justify-end">
                  <button
                    type="button"
                    onClick={() => setIsEditing(true)}
                    className="w-full sm:w-auto px-6 py-3 bg-gradient-to-r from-green-600 to-yellow-500 text-white font-semibold rounded-xl hover:opacity-90 transition shadow-md"
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
                  <div className="flex flex-col sm:flex-row sm:items-center rounded-xl border border-gray-300 focus-within:ring-2 focus-within:ring-green-500 overflow-hidden">
                    <span className="px-3 pt-2 sm:pt-0 sm:pr-1 text-sm text-gray-400 break-all sm:whitespace-nowrap">
                      {window.location.origin}/business/
                    </span>
                    <input
                      type="text"
                      name="slug"
                      value={editForm.slug}
                      onChange={handleEditFieldChange}
                      placeholder="your-store-name"
                      className="w-full sm:flex-1 min-w-0 px-3 sm:px-1 py-2 focus:outline-none"
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

                <div className="border-t border-gray-100 pt-6">
                  <h3 className="text-base font-bold text-gray-900 mb-1">Social links</h3>
                  <p className="text-xs text-gray-400 mb-3">Shown as icons on your store page. Leave blank to hide one.</p>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                    {[
                      ["facebook", "Facebook", "https://facebook.com/yourpage"],
                      ["instagram", "Instagram", "https://instagram.com/yourhandle"],
                      ["twitter", "Twitter / X", "https://x.com/yourhandle"],
                      ["website", "Website", "https://yourwebsite.com"],
                    ].map(([key, label, placeholder]) => (
                      <div key={key} className="min-w-0">
                        <label className="block text-sm font-medium text-gray-700 mb-1">{label}</label>
                        <input
                          type="url"
                          inputMode="url"
                          name={`socialLinks.${key}`}
                          value={editForm.socialLinks[key]}
                          onChange={handleEditFieldChange}
                          placeholder={placeholder}
                          className="w-full rounded-xl border border-gray-300 px-3 py-2 focus:outline-none focus:ring-2 focus:ring-green-500"
                        />
                      </div>
                    ))}
                  </div>
                </div>

                <div className="border-t border-gray-100 pt-6">
                  <h3 className="text-base font-bold text-gray-900 mb-1">Highlights</h3>
                  <p className="text-xs text-gray-400 mb-3">
                    Short selling points, like "Fast delivery". The first 3 show on your Explore card. Up to {MAX_HIGHLIGHTS}.
                  </p>
                  <div className="flex flex-col sm:flex-row gap-2">
                    <input
                      type="text"
                      value={highlightInput}
                      onChange={(e) => setHighlightInput(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") {
                          e.preventDefault();
                          addHighlight();
                        }
                      }}
                      maxLength={60}
                      placeholder="e.g. Fast delivery"
                      className="w-full sm:flex-1 min-w-0 rounded-xl border border-gray-300 px-3 py-2 focus:outline-none focus:ring-2 focus:ring-green-500"
                    />
                    <button
                      type="button"
                      onClick={addHighlight}
                      className="w-full sm:w-auto px-5 py-2 rounded-xl bg-green-600 hover:bg-green-700 text-white font-medium transition"
                    >
                      Add
                    </button>
                  </div>
                  {editForm.highlights.length > 0 && (
                    <div className="mt-3 flex flex-wrap gap-2">
                      {editForm.highlights.map((h, i) => (
                        <span
                          key={`${h}-${i}`}
                          className="inline-flex items-center gap-1.5 max-w-full text-sm bg-green-50 text-green-700 pl-3 pr-2 py-1 rounded-full"
                        >
                          <span className="break-words min-w-0">{h}</span>
                          <button
                            type="button"
                            onClick={() => removeHighlight(i)}
                            aria-label={`Remove ${h}`}
                            className="shrink-0 w-5 h-5 rounded-full text-green-700 hover:bg-green-100 flex items-center justify-center leading-none"
                          >
                            ×
                          </button>
                        </span>
                      ))}
                    </div>
                  )}
                </div>

                <div className="flex flex-col-reverse sm:flex-row sm:justify-end gap-3 pt-2">
                  <button
                    type="button"
                    onClick={() => {
                      setIsEditing(false);
                      setFormError("");
                      resetEditForm(business);
                    }}
                    className="w-full sm:w-auto px-5 py-2.5 rounded-xl border border-gray-300 text-gray-700 font-medium hover:bg-gray-50"
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    onClick={saveBusinessChanges}
                    disabled={saving}
                    className="w-full sm:w-auto px-5 py-2.5 rounded-xl bg-gradient-to-r from-green-600 to-yellow-500 text-white font-semibold disabled:opacity-70 hover:opacity-90 transition"
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
                  From {earningsSummary.ordersCount} paid order{earningsSummary.ordersCount === 1 ? "" : "s"} — paid straight
                  to your own bank account
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

            <VendorOnboardingForm existing={vendorStatus} onSubmitted={() => fetchVendorStatus()} />
          </div>
        )}
      </div>
    </div>
  );
};

export default BusinessDashboard;