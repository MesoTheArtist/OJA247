import React, { useState, useEffect } from "react";
import { motion, useScroll, useMotionValueEvent } from "framer-motion";
import axiosInstance from "../services/api";
import { useAuth } from "../context/AuthContext";
import { useNavigate } from "react-router-dom";
import Loader from "../components/Loader";
import CustomerAdminTab from "../components/CustomerAdminTab.jsx";
import CampaignAdminTab from "../components/CampaignAdminTab.jsx";
import { useDialog } from "../components/DialogProvider";
import useMinimumLoadingTime from "../hooks/useMinimumLoadingTime";
import {
  Users,
  Store,
  Package,
  TrendingUp,
  Star,
  Trash2,
  Ban,
  CheckCircle,
  ShoppingCart,
  Menu,
  X,
  LogOut,
  ExternalLink,
  ShieldCheck,
  XCircle,
  FileText,
  Search,
  AlertTriangle,
  BarChart3,
  Award,
  Clock,
  ToggleLeft,
  CalendarClock,
  UserCog,
  Receipt,
  ArrowLeft,
  Wallet,
  UserCircle,
  Mail,
} from "lucide-react";
import {
  LineChart,
  Line,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from "recharts";

const NAV_ITEMS = [
  { id: "overview", label: "Overview", icon: TrendingUp },
  { id: "analytics", label: "Analytics", icon: BarChart3 },
  { id: "businesses", label: "Businesses", icon: Store },
  { id: "products", label: "Products", icon: Package },
  { id: "orders", label: "Orders", icon: ShoppingCart },
  { id: "users", label: "Users", icon: Users },
  { id: "customers", label: "Customers", icon: UserCircle },
  { id: "vendors", label: "Vendor Verification", icon: ShieldCheck },
  { id: "emails", label: "Emails", icon: Mail },
  { id: "marketers", label: "Marketers", icon: UserCog },
  { id: "payouts", label: "Payouts", icon: Wallet },
  { id: "transactions", label: "Transactions", icon: Receipt },
  { id: "visibility", label: "Kill Switch", icon: ToggleLeft },
  { id: "grandfather", label: "Grandfather Exemptions", icon: CalendarClock },
  { id: "tax-ledger", label: "Tax Ledger", icon: FileText },
];

// Small, reusable empty-state block so every table has somewhere
// sensible to land when there's nothing (or no matches) to show.
const EmptyState = ({ icon: Icon, title, message }) => (
  <div className="flex flex-col items-center justify-center py-16 px-6 text-center">
    <div className="p-3 rounded-2xl bg-gray-50 border border-gray-200 mb-4">
      <Icon size={22} className="text-gray-500" />
    </div>
    <p className="font-semibold text-gray-900 mb-1">{title}</p>
    <p className="text-sm text-gray-500 max-w-xs">{message}</p>
  </div>
);

// Lightweight search field shared across the table headers.
const SearchField = ({ value, onChange, placeholder }) => (
  <div className="relative w-full sm:w-64">
    <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500" />
    <input
      type="text"
      value={value}
      onChange={(e) => onChange(e.target.value)}
      placeholder={placeholder}
      className="w-full pl-9 pr-3 py-2 bg-gray-50 border border-gray-200 rounded-lg text-sm text-gray-900 placeholder-gray-400 focus:outline-none focus:border-green-400/40 focus:bg-gray-100 transition"
    />
  </div>
);

// "2026-09-05" -> "Sep 5", for compact chart x-axis labels
const formatChartDate = (isoDate) => {
  const d = new Date(isoDate + "T00:00:00");
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
};

const AdminDashboard = () => {
  const { confirm, prompt, notify } = useDialog();
  const { user, logout } = useAuth();
  const navigate = useNavigate();

  const [stats, setStats] = useState({
    totalBusinesses: 0,
    totalProducts: 0,
    totalUsers: 0,
    totalOrders: 0,
    totalRevenue: 0,
    businessesByCategory: [],
  });
  const [businesses, setBusinesses] = useState([]);
  const [users, setUsers] = useState([]);
  const [products, setProducts] = useState([]);
  const [orders, setOrders] = useState([]);
  const [vendors, setVendors] = useState([]);
  const [settings, setSettings] = useState({ enforceSubscriptionVisibility: false });
  const [settingsSaving, setSettingsSaving] = useState(false);
  const [analytics, setAnalytics] = useState(null);
  const [analyticsLoading, setAnalyticsLoading] = useState(false);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState("overview");
  const [orderStatusFilter, setOrderStatusFilter] = useState("all");
  const [sidebarOpen, setSidebarOpen] = useState(false);

  // Search terms, one per searchable tab.
  const [businessSearch, setBusinessSearch] = useState("");
  const [productSearch, setProductSearch] = useState("");
  const [orderSearch, setOrderSearch] = useState("");
  const [userSearch, setUserSearch] = useState("");

  // Unfiltered business list (all businesses regardless of visibility
  // rules) — used by the Kill Switch and Grandfather Exemptions tabs.
  const [adminBusinesses, setAdminBusinesses] = useState([]);
  const [visibilitySearch, setVisibilitySearch] = useState("");
  const [grandfatherSearch, setGrandfatherSearch] = useState("");
  const [grandfatherDrafts, setGrandfatherDrafts] = useState({}); // businessId -> date input value being edited

  // Marketer management
  const [marketers, setMarketers] = useState([]);
  const [marketerSearch, setMarketerSearch] = useState("");
  const [marketerDetail, setMarketerDetail] = useState(null); // set when drilled into one marketer
  const [marketerDetailLoading, setMarketerDetailLoading] = useState(false);

  // Unified transactions
  const [transactions, setTransactions] = useState([]);
  const [transactionsLoading, setTransactionsLoading] = useState(false);
  const [transactionTypeFilter, setTransactionTypeFilter] = useState("all"); // all | subscription | marketer_payout | points
  const [transactionSearch, setTransactionSearch] = useState("");

  // Payouts: one list of everything to send, marketers and vendors together.
  // The data stays where it was (MarketerPayout / PointsLedger); see
  // getPayouts in payoutBatchController.js. Payouts aren't automated, so an
  // admin sends each transfer by hand, then marks it paid here.
  const [payouts, setPayouts] = useState({ rows: [], toPay: { count: 0, total: 0 } });
  const [payoutsLoading, setPayoutsLoading] = useState(false);
  const [payoutTypeFilter, setPayoutTypeFilter] = useState("all"); // all | marketer | vendor
  const [payoutStatusFilter, setPayoutStatusFilter] = useState("to_pay"); // to_pay | paid | rejected
  const [payoutBusyId, setPayoutBusyId] = useState(null);
  const [payoutRefDrafts, setPayoutRefDrafts] = useState({});

  // Toast replaces alert() for non-blocking confirmations/errors.
  const [toast, setToast] = useState(null); // { message, type: "success" | "error" }

  // Top bar hides on scroll-down, reappears on scroll-up — same behavior
  // as the public Navbar.jsx, applied here to the admin top bar only (the
  // sidebar stays put; collapsing that too would hide the tab navigation).
  const [topBarHidden, setTopBarHidden] = useState(false);
  const { scrollY } = useScroll();
  useMotionValueEvent(scrollY, "change", (latest) => {
    const previous = scrollY.getPrevious() ?? 0;
    const diff = latest - previous;

    if (latest < 80) {
      setTopBarHidden(false);
      return;
    }
    if (Math.abs(diff) < 4) return;

    setTopBarHidden(diff > 0); // true = scrolling down, false = scrolling up
  });

  const showLoader = useMinimumLoadingTime(loading);

  useEffect(() => {
    if (!toast) return;
    const timer = setTimeout(() => setToast(null), 3200);
    return () => clearTimeout(timer);
  }, [toast]);

  const showToast = (message, type = "success") => setToast({ message, type });

  const handleToggleSubscriptionVisibility = async () => {
    const next = !settings.enforceSubscriptionVisibility;
    setSettingsSaving(true);
    try {
      const res = await axiosInstance.patch("/api/admin/settings/subscription-visibility", {
        enabled: next,
      });
      setSettings(res.data);
      showToast(
        next
          ? "Subscription visibility gate turned ON — unsubscribed businesses are now hidden from public listings."
          : "Subscription visibility gate turned OFF — all businesses are visible regardless of subscription status.",
        "success"
      );
      fetchAllData(); // businesses list changes shape immediately when this flips
    } catch (error) {
      showToast(error.response?.data?.message || "Could not update the setting.", "error");
    } finally {
      setSettingsSaving(false);
    }
  };

  useEffect(() => {
    if (!user || user.role !== "admin") {
      navigate("/");
      return;
    }
    fetchAllData();
  }, [user]);

  useEffect(() => {
    if (activeTab !== "analytics" || analytics) return; // only fetch once, on first visit to the tab
    setAnalyticsLoading(true);
    Promise.all([
      axiosInstance.get("/api/admin/analytics/growth"),
      axiosInstance.get("/api/admin/analytics/subscriptions"),
      axiosInstance.get("/api/admin/analytics/marketer-leaderboard"),
      axiosInstance.get("/api/admin/analytics/recent-activity"),
    ])
      .then(([growthRes, subsRes, leaderboardRes, activityRes]) => {
        setAnalytics({
          growth: growthRes.data,
          subscriptions: subsRes.data,
          leaderboard: leaderboardRes.data.leaderboard,
          activity: activityRes.data.events,
        });
      })
      .catch(() => showToast("Couldn't load analytics. Try switching tabs and back.", "error"))
      .finally(() => setAnalyticsLoading(false));
  }, [activeTab]);

  // Kill Switch + Grandfather Exemptions both need the unfiltered business
  // list — fetch once, shared between both tabs.
  useEffect(() => {
    if ((activeTab !== "visibility" && activeTab !== "grandfather") || adminBusinesses.length) return;
    axiosInstance
      .get("/api/admin/businesses")
      .then((res) => setAdminBusinesses(res.data))
      .catch(() => showToast("Couldn't load businesses.", "error"));
  }, [activeTab]);

  useEffect(() => {
    if (activeTab !== "marketers" || marketers.length) return;
    axiosInstance
      .get("/api/admin/marketers")
      .then((res) => setMarketers(res.data))
      .catch(() => showToast("Couldn't load marketers.", "error"));
  }, [activeTab]);

  const fetchTransactions = (type = transactionTypeFilter) => {
    setTransactionsLoading(true);
    axiosInstance
      .get("/api/admin/transactions", { params: type === "all" ? {} : { type } })
      .then((res) => setTransactions(res.data.transactions))
      .catch(() => showToast("Couldn't load transactions.", "error"))
      .finally(() => setTransactionsLoading(false));
  };

  useEffect(() => {
    if (activeTab !== "transactions") return;
    fetchTransactions();
  }, [activeTab, transactionTypeFilter]);

  const fetchPayouts = () => {
    setPayoutsLoading(true);
    return axiosInstance
      .get("/api/admin/payouts", { params: { type: payoutTypeFilter, status: payoutStatusFilter } })
      .then((res) => setPayouts({ rows: res.data.rows, toPay: res.data.toPay }))
      .catch(() => showToast("Couldn't load payouts.", "error"))
      .finally(() => setPayoutsLoading(false));
  };

  useEffect(() => {
    if (activeTab !== "payouts") return;
    fetchPayouts();
  }, [activeTab, payoutTypeFilter, payoutStatusFilter]);

  const copyToClipboard = async (text, what) => {
    try {
      await navigator.clipboard.writeText(String(text));
      showToast(`${what} copied`);
    } catch {
      showToast("Couldn't copy — select it and copy by hand.", "error");
    }
  };

  // Marking paid is the one step that can't be taken back (it emails the
  // person that money is on its way), so ask first.
  const markPayoutPaid = async (row) => {
    const ok = await confirm({
      title: "Have you sent the money?",
      message: `Confirm you have already transferred ₦${Number(row.amount).toLocaleString()} to ${row.party}. This marks it paid and emails them.`,
      confirmLabel: "Yes, mark paid",
    });
    if (!ok) return;
    setPayoutBusyId(row.rowId);
    try {
      const transferReference = payoutRefDrafts[row.rowId] || "";
      if (row.kind === "marketer") {
        await axiosInstance.post(`/api/admin/payout-batches/${row.marketerId}/mark-paid`, { transferReference });
      } else {
        await axiosInstance.patch(`/api/admin/points-withdrawals/${row.entryId}/mark-paid`, { transferReference });
      }
      showToast("Marked as paid — they have been notified by email");
      setPayoutRefDrafts((prev) => {
        const next = { ...prev };
        delete next[row.rowId];
        return next;
      });
      fetchPayouts();
    } catch (err) {
      showToast(err.response?.data?.message || "Couldn't mark as paid.", "error");
    } finally {
      setPayoutBusyId(null);
    }
  };

  // Declining needs a reason (emailed to them). For a vendor the withdrawn
  // points go back to their balance; for a marketer the payout is cancelled.
  const rejectPayout = async (row) => {
    const reason = await prompt({
      title: row.kind === "vendor" ? "Reject this withdrawal?" : "Reject this payout?",
      message:
        row.kind === "vendor"
          ? `${row.party} asked to withdraw ₦${Number(row.amount).toLocaleString()}. Rejecting puts those points back in their balance and emails them your reason.`
          : `This cancels the ₦${Number(row.amount).toLocaleString()} waiting to be paid to ${row.party} and emails them your reason.`,
      placeholder: "Reason (they will see this)",
      multiline: true,
      confirmLabel: row.kind === "vendor" ? "Reject and refund" : "Reject payout",
      tone: "danger",
    });
    if (reason === null) return; // cancelled
    if (!reason.trim()) {
      showToast("A reason is required.", "error");
      return;
    }
    setPayoutBusyId(row.rowId);
    try {
      if (row.kind === "marketer") {
        await axiosInstance.post(`/api/admin/payout-batches/${row.marketerId}/reject`, { reason: reason.trim() });
        showToast("Payout rejected — marketer notified");
      } else {
        await axiosInstance.patch(`/api/admin/points-withdrawals/${row.entryId}/reject`, { reason: reason.trim() });
        showToast("Withdrawal rejected and points refunded");
      }
      fetchPayouts();
    } catch (err) {
      showToast(err.response?.data?.message || "Couldn't reject this payout.", "error");
    } finally {
      setPayoutBusyId(null);
    }
  };

  // Tax Ledger tab
  const [taxEntries, setTaxEntries] = useState([]);
  const [taxTotals, setTaxTotals] = useState({ accrued: { total: 0, count: 0 }, remitted: { total: 0, count: 0 } });
  const [taxLoading, setTaxLoading] = useState(false);
  const [taxStatusFilter, setTaxStatusFilter] = useState("accrued");
  const [remittingId, setRemittingId] = useState(null);
  // Keyed by entry id — a single shared string would let a note typed on
  // one row get submitted against a different row if multiple accrued
  // entries are visible at once.
  const [remittanceNoteDrafts, setRemittanceNoteDrafts] = useState({});

  const fetchTaxLedger = (status = taxStatusFilter) => {
    setTaxLoading(true);
    axiosInstance
      .get("/api/admin/tax-ledger", { params: status === "all" ? {} : { status } })
      .then((res) => {
        setTaxEntries(res.data.entries);
        setTaxTotals(res.data.totals);
      })
      .catch(() => showToast("Couldn't load tax ledger.", "error"))
      .finally(() => setTaxLoading(false));
  };

  useEffect(() => {
    if (activeTab !== "tax-ledger") return;
    fetchTaxLedger();
  }, [activeTab, taxStatusFilter]);

  const markTaxRemitted = async (id) => {
    setRemittingId(id);
    try {
      await axiosInstance.patch(`/api/admin/tax-ledger/${id}/mark-remitted`, {
        remittanceNote: remittanceNoteDrafts[id] || "",
      });
      showToast("Marked as remitted");
      setRemittanceNoteDrafts((prev) => {
        const next = { ...prev };
        delete next[id];
        return next;
      });
      fetchTaxLedger();
    } catch (err) {
      showToast(err.response?.data?.message || "Couldn't mark as remitted.", "error");
    } finally {
      setRemittingId(null);
    }
  };

  const viewMarketerDetail = (id) => {
    setMarketerDetailLoading(true);
    setMarketerDetail({ id }); // show the detail panel immediately with a loading state
    axiosInstance
      .get(`/api/admin/marketers/${id}`)
      .then((res) => setMarketerDetail(res.data))
      .catch(() => {
        showToast("Couldn't load that marketer's details.", "error");
        setMarketerDetail(null);
      })
      .finally(() => setMarketerDetailLoading(false));
  };

  const toggleMarketerBan = async (id, currentlyBanned) => {
    try {
      const res = await axiosInstance.patch(`/api/admin/marketers/${id}/ban`, {
        banned: !currentlyBanned,
      });
      setMarketers((prev) => prev.map((m) => (m._id === id ? { ...m, banned: res.data.banned } : m)));
      showToast(currentlyBanned ? "Marketer unbanned" : "Marketer banned");
    } catch (error) {
      showToast("Failed to update marketer status", "error");
    }
  };

  const deleteMarketer = async (id, name) => {
    const ok = await confirm({
      title: "Delete marketer?",
      message: `Delete ${name}? This removes their account and payout records permanently.`,
      confirmLabel: "Delete",
      tone: "danger",
    });
    if (!ok) return;
    try {
      await axiosInstance.delete(`/api/admin/marketers/${id}`);
      setMarketers((prev) => prev.filter((m) => m._id !== id));
      if (marketerDetail?.marketer?._id === id) setMarketerDetail(null);
      showToast("Marketer deleted");
    } catch (error) {
      showToast("Failed to delete marketer", "error");
    }
  };

  const toggleVisibilityExempt = async (id, currentlyExempt) => {
    try {
      const res = await axiosInstance.patch(`/api/admin/businesses/${id}/visibility-exempt`, {
        exempt: !currentlyExempt,
      });
      setAdminBusinesses((prev) =>
        prev.map((b) => (b._id === id ? { ...b, visibilityExempt: res.data.visibilityExempt } : b))
      );
      showToast(
        currentlyExempt ? "Removed individual exemption" : "Business exempted — always visible regardless of subscription status"
      );
    } catch (error) {
      showToast("Failed to update exemption", "error");
    }
  };

  const saveGrandfatherExemption = async (id, dateValue) => {
    try {
      const exemptUntil = dateValue ? new Date(dateValue).toISOString() : null;
      const res = await axiosInstance.patch(`/api/admin/businesses/${id}/grandfather-exemption`, {
        exemptUntil,
      });
      setAdminBusinesses((prev) =>
        prev.map((b) => (b._id === id ? { ...b, grandfatherExemptUntil: res.data.grandfatherExemptUntil } : b))
      );
      showToast(exemptUntil ? "Grandfather exemption saved" : "Grandfather exemption cleared");
    } catch (error) {
      showToast("Failed to save exemption", "error");
    }
  };

  const fetchAllData = async () => {
    try {
      const [statsRes, bizRes, userRes, prodRes, ordersRes, vendorsRes, settingsRes] = await Promise.all([
        axiosInstance.get("/api/admin/stats"),
        axiosInstance.get("/api/businesses"),
        axiosInstance.get("/api/admin/users"),
        axiosInstance.get("/api/products/search"),
        axiosInstance.get("/api/admin/orders"),
        axiosInstance.get("/api/admin/vendors"),
        axiosInstance.get("/api/admin/settings"),
      ]);

      setStats(statsRes.data);
      setBusinesses(bizRes.data);
      setUsers(userRes.data);
      setProducts(prodRes.data);
      setOrders(ordersRes.data);
      setVendors(vendorsRes.data);
      setSettings(settingsRes.data);
    } catch (error) {
      console.error("Error fetching data:", error);
      if (error.response?.status === 403) {
        await notify({ title: "Admin access required", message: "You don't have permission to open this page.", tone: "error" });
        navigate("/");
      } else {
        showToast("Couldn't load dashboard data. Try refreshing.", "error");
      }
    } finally {
      setLoading(false);
    }
  };

  const toggleFeatured = async (id, currentStatus) => {
    try {
      await axiosInstance.patch(`/api/admin/businesses/${id}/featured`, {
        featured: !currentStatus,
      });
      showToast(currentStatus ? "Removed from featured" : "Marked as featured");
      fetchAllData();
    } catch (error) {
      showToast("Failed to update featured status", "error");
    }
  };

  const deleteBusiness = async (id, name) => {
    const ok = await confirm({
      title: "Delete business?",
      message: `Delete "${name}" and all its products?\n\nThis action cannot be undone!`,
      confirmLabel: "Delete",
      tone: "danger",
    });
    if (!ok) return;

    try {
      await axiosInstance.delete(`/api/admin/businesses/${id}`);
      showToast("Business deleted");
      fetchAllData();
    } catch (error) {
      showToast("Failed to delete business", "error");
    }
  };

  const deleteProduct = async (id, name) => {
    const ok = await confirm({
      title: "Delete product?",
      message: `Delete product "${name}"?`,
      confirmLabel: "Delete",
      tone: "danger",
    });
    if (!ok) return;

    try {
      await axiosInstance.delete(`/api/products/${id}`);
      showToast("Product deleted");
      fetchAllData();
    } catch (error) {
      showToast("Failed to delete product", "error");
    }
  };

  const toggleUserBan = async (id, currentStatus, email) => {
    const banning = !currentStatus;
    let reason = "";

    if (banning) {
      // One dialog: the reason is optional and goes into the email the user
      // receives. Cancelling aborts the ban.
      const input = await prompt({
        title: "Ban user?",
        message: `Ban "${email}"? You can add a reason, which is included in the email they receive. Leave it empty to send none.`,
        placeholder: "Reason (optional)",
        multiline: true,
        confirmLabel: "Ban",
        tone: "danger",
      });
      if (input === null) return; // cancelled
      reason = input;
    } else {
      const ok = await confirm({
        title: "Unban user?",
        message: `Unban user "${email}"?`,
        confirmLabel: "Unban",
      });
      if (!ok) return;
    }

    try {
      await axiosInstance.patch(`/api/admin/users/${id}/ban`, {
        banned: !currentStatus,
        reason,
      });
      showToast(`User ${currentStatus ? "unbanned" : "banned"}`);
      fetchAllData();
    } catch (error) {
      showToast("Failed to update user status", "error");
    }
  };

  const reviewVendor = async (id, decision, businessName) => {
    let notes = "";

    if (decision === "rejected") {
      const input = await prompt({
        title: "Reject verification?",
        message: `Reason for rejecting ${businessName}'s verification? (shown to the vendor)`,
        placeholder: "Write the reason here",
        multiline: true,
        confirmLabel: "Reject",
        tone: "danger",
      });
      if (input === null) return; // cancelled
      notes = input;
    } else {
      const ok = await confirm({
        title: "Approve vendor?",
        message: `Approve ${businessName}'s vendor verification?`,
        confirmLabel: "Approve",
      });
      if (!ok) return;
    }

    try {
      await axiosInstance.patch(`/api/admin/vendors/${id}/review`, { decision, notes });
      showToast(`Vendor ${decision}`);
      fetchAllData();
    } catch (error) {
      showToast(error.response?.data?.message || "Failed to update vendor review status", "error");
    }
  };

  const filteredOrders = orders
    .filter((order) => orderStatusFilter === "all" || order.paymentStatus === orderStatusFilter)
    .filter((order) => {
      if (!orderSearch) return true;
      const q = orderSearch.toLowerCase();
      return (
        order.reference?.toLowerCase().includes(q) ||
        order.customer?.fullName?.toLowerCase().includes(q) ||
        order.customer?.email?.toLowerCase().includes(q)
      );
    });

  const filteredBusinesses = businesses.filter((biz) => {
    if (!businessSearch) return true;
    const q = businessSearch.toLowerCase();
    return biz.name?.toLowerCase().includes(q) || biz.category?.toLowerCase().includes(q) || biz.location?.toLowerCase().includes(q);
  });

  const filteredProducts = products.filter((product) => {
    if (!productSearch) return true;
    return product.name?.toLowerCase().includes(productSearch.toLowerCase());
  });

  const filteredUsers = users.filter((u) => {
    if (!userSearch) return true;
    const q = userSearch.toLowerCase();
    return u.email?.toLowerCase().includes(q) || u.businessId?.name?.toLowerCase().includes(q);
  });

  const filteredVisibilityBusinesses = adminBusinesses.filter((biz) => {
    if (!visibilitySearch) return true;
    return biz.name?.toLowerCase().includes(visibilitySearch.toLowerCase());
  });

  const filteredGrandfatherBusinesses = adminBusinesses.filter((biz) => {
    if (!grandfatherSearch) return true;
    return biz.name?.toLowerCase().includes(grandfatherSearch.toLowerCase());
  });

  const filteredMarketers = marketers.filter((m) => {
    if (!marketerSearch) return true;
    const q = marketerSearch.toLowerCase();
    return m.name?.toLowerCase().includes(q) || m.email?.toLowerCase().includes(q) || m.referralCode?.toLowerCase().includes(q);
  });

  const filteredTransactions = transactions.filter((t) => {
    if (!transactionSearch) return true;
    const q = transactionSearch.toLowerCase();
    return t.party?.toLowerCase().includes(q) || t.reference?.toLowerCase().includes(q);
  });

  if (showLoader) {
    return <Loader text="Loading Admin Dashboard..." />;
  }

  const activeLabel = NAV_ITEMS.find((n) => n.id === activeTab)?.label || "";

  return (
    <div className="min-h-screen bg-gray-50 text-gray-900 relative overflow-x-hidden lg:flex">
      {/* Ambient glow orbs — purely decorative, never intercepts clicks */}
      <div className="pointer-events-none fixed inset-0 overflow-hidden z-0">
        <div className="absolute -top-32 left-1/4 w-96 h-96 bg-green-500/10 rounded-full blur-3xl" />
        <div className="absolute top-1/2 -right-32 w-96 h-96 bg-yellow-500/10 rounded-full blur-3xl" />
        <div className="absolute bottom-0 left-1/3 w-72 h-72 bg-emerald-500/10 rounded-full blur-3xl" />
      </div>

      {/* Mobile sidebar overlay */}
      {sidebarOpen && (
        <div
          className="fixed inset-0 bg-black/60 backdrop-blur-sm z-40 lg:hidden"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      {/*
        Sidebar: an overlay drawer on mobile (fixed), but a normal flex
        item that's "sticky" from lg upward — not "fixed" full-height.
        A sticky element releases at the bottom of ITS OWN parent, so
        once this component ends and any page footer begins below it,
        the sidebar stops scrolling and gets out of the footer's way
        instead of permanently floating over it.
      */}
      <aside
        className={`fixed top-0 left-0 h-screen w-72 bg-white border-r border-gray-200 z-50 flex flex-col transform transition-transform duration-300
        lg:sticky lg:translate-x-0 lg:z-30 lg:shrink-0
        ${sidebarOpen ? "translate-x-0" : "-translate-x-full"}`}
      >
        <div className="flex items-center justify-between px-6 py-6 border-b border-gray-200">
          <div>
            <p className="text-[11px] uppercase tracking-[0.25em] text-green-700 font-semibold">
              OJA247
            </p>
            <h1 className="text-xl font-black bg-gradient-to-r from-green-600 to-yellow-600 bg-clip-text text-transparent">
              Control Room
            </h1>
          </div>
          <button
            onClick={() => setSidebarOpen(false)}
            className="lg:hidden p-1.5 rounded-lg hover:bg-gray-100 text-gray-500"
          >
            <X size={20} />
          </button>
        </div>

        <nav className="flex-1 px-4 py-6 space-y-1.5 overflow-y-auto">
          {NAV_ITEMS.map((tab) => {
            const isActive = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                onClick={() => {
                  setActiveTab(tab.id);
                  setSidebarOpen(false);
                }}
                className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-semibold transition-all ${
                  isActive
                    ? "bg-green-50 text-green-800 border border-green-200 shadow-sm"
                    : "text-gray-500 hover:text-gray-900 hover:bg-gray-50 border border-transparent"
                }`}
              >
                <tab.icon size={18} className={isActive ? "text-green-700" : ""} />
                {tab.label}
              </button>
            );
          })}
        </nav>

        <div className="px-4 py-6 border-t border-gray-200 space-y-2">
          <button
            onClick={() => navigate("/")}
            className="w-full flex items-center gap-3 px-4 py-2.5 rounded-xl text-sm font-medium text-gray-500 hover:text-gray-900 hover:bg-gray-50 transition"
          >
            <ExternalLink size={16} />
            View Site
          </button>
          <button
            onClick={logout}
            className="w-full flex items-center gap-3 px-4 py-2.5 rounded-xl text-sm font-medium text-red-600 hover:text-red-700 hover:bg-red-50 transition"
          >
            <LogOut size={16} />
            Logout
          </button>
        </div>
      </aside>

      {/* Main content */}
      <div className="flex-1 min-w-0 relative z-10">
        {/* Top bar */}
        <motion.div
          animate={topBarHidden ? { y: "-100%", opacity: 0 } : { y: "0%", opacity: 1 }}
          transition={{ type: "spring", stiffness: 300, damping: 30 }}
          className="sticky top-0 z-20 bg-white/90 backdrop-blur-xl border-b border-gray-200"
        >
          <div className="flex items-center gap-4 px-4 sm:px-8 py-5">
            <button
              onClick={() => setSidebarOpen(true)}
              className="lg:hidden p-2 rounded-lg hover:bg-gray-100 text-gray-600"
            >
              <Menu size={22} />
            </button>
            <div>
              <div className="flex items-center gap-2">
                <span className="relative flex h-2 w-2">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75" />
                  <span className="relative inline-flex rounded-full h-2 w-2 bg-green-400" />
                </span>
                <span className="text-[11px] uppercase tracking-[0.2em] text-gray-500 font-semibold">
                  Live
                </span>
              </div>
              <h2 className="text-2xl font-bold text-gray-900 mt-0.5">{activeLabel}</h2>
            </div>
          </div>
        </motion.div>

        <div className="px-4 sm:px-8 py-8 max-w-7xl">
          {activeTab === "overview" && (
            <div>
              {/* Platform Settings — subscription visibility kill switch */}
              <div
                className={`mb-8 relative rounded-2xl p-6 sm:p-8 border overflow-hidden ${
                  settings.enforceSubscriptionVisibility
                    ? "bg-gray-50 border-gray-200"
                    : "bg-amber-500/10 border-amber-500/30"
                }`}
              >
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                  <div className="flex items-start gap-3">
                    <AlertTriangle
                      className={settings.enforceSubscriptionVisibility ? "text-gray-500" : "text-amber-600"}
                      size={22}
                    />
                    <div>
                      <h3 className="font-bold text-gray-900">Subscription Visibility Gate</h3>
                      <p className="text-sm text-gray-500 mt-1 max-w-xl">
                        When ON, businesses without a currently active subscription are hidden from
                        public listings. Currently{" "}
                        <span className={settings.enforceSubscriptionVisibility ? "text-green-700 font-semibold" : "text-amber-600 font-semibold"}>
                          {settings.enforceSubscriptionVisibility ? "ON" : "OFF"}
                        </span>
                        {!settings.enforceSubscriptionVisibility &&
                          " — all businesses are showing regardless of subscription status."}
                      </p>
                    </div>
                  </div>
                  <button
                    onClick={handleToggleSubscriptionVisibility}
                    disabled={settingsSaving}
                    className={`shrink-0 relative inline-flex h-8 w-14 items-center rounded-full transition-colors disabled:opacity-50 ${
                      settings.enforceSubscriptionVisibility ? "bg-green-500" : "bg-gray-600"
                    }`}
                  >
                    <span
                      className={`inline-block h-6 w-6 transform rounded-full bg-white transition-transform ${
                        settings.enforceSubscriptionVisibility ? "translate-x-7" : "translate-x-1"
                      }`}
                    />
                  </button>
                </div>
              </div>

              {/* Stats Cards */}
              <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 sm:gap-6 mb-8">
                {[
                  { label: "Total Businesses", value: stats.totalBusinesses, icon: Store, accent: "from-green-500 to-emerald-500" },
                  { label: "Total Products", value: stats.totalProducts, icon: Package, accent: "from-yellow-500 to-amber-500" },
                  { label: "Total Users", value: stats.totalUsers, icon: Users, accent: "from-emerald-500 to-green-400" },
                  { label: "Total Orders", value: stats.totalOrders, icon: ShoppingCart, accent: "from-yellow-400 to-yellow-600" },
                ].map((card) => (
                  <div
                    key={card.label}
                    className="relative bg-white border border-gray-200 shadow-sm rounded-2xl p-5 sm:p-6 overflow-hidden group hover:border-white/20 transition-colors"
                  >
                    <div className={`absolute top-0 left-0 w-full h-1 bg-gradient-to-r ${card.accent}`} />
                    <div className="flex items-start justify-between">
                      <div>
                        <p className="text-gray-500 text-xs sm:text-sm font-medium">{card.label}</p>
                        <p className="text-2xl sm:text-3xl font-black text-gray-900 mt-2">{card.value}</p>
                      </div>
                      <div className={`p-2.5 rounded-xl bg-gradient-to-br ${card.accent} bg-opacity-10 shrink-0`}>
                        <card.icon className="text-gray-900/90" size={20} />
                      </div>
                    </div>
                  </div>
                ))}
              </div>

              {/* Revenue */}
              <div className="mb-8 relative bg-white border border-gray-200 shadow-sm rounded-2xl p-6 sm:p-8 overflow-hidden">
                <div className="absolute -right-10 -top-10 w-40 h-40 bg-green-500/10 rounded-full blur-3xl" />
                <h2 className="text-sm uppercase tracking-widest text-gray-500 font-semibold mb-2">
                  Total Revenue
                </h2>
                <p className="text-3xl sm:text-4xl font-black bg-gradient-to-r from-green-600 to-yellow-600 bg-clip-text text-transparent">
                  ₦{Number(stats.totalRevenue || 0).toLocaleString()}
                </p>
              </div>

              {/* Categories */}
              <div className="bg-white border border-gray-200 shadow-sm rounded-2xl p-6 sm:p-8">
                <h2 className="text-lg font-bold text-gray-900 mb-5">Businesses by Category</h2>
                {stats.businessesByCategory.length === 0 ? (
                  <EmptyState icon={Store} title="No categories yet" message="Category breakdowns will show up here as businesses join." />
                ) : (
                  <div className="space-y-3">
                    {stats.businessesByCategory.map((cat) => (
                      <div
                        key={cat._id}
                        className="flex items-center justify-between bg-gray-50 rounded-xl px-4 py-3 border border-gray-100"
                      >
                        <span className="font-medium text-gray-600">
                          {cat._id || "Uncategorized"}
                        </span>
                        <span className="px-3 py-1 bg-green-500/15 text-green-700 border border-green-500/30 rounded-full font-semibold text-sm">
                          {cat.count}
                        </span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}

          {activeTab === "orders" && (
            <div className="bg-white border border-gray-200 shadow-sm rounded-2xl overflow-hidden">
              <div className="p-6 border-b border-gray-200 flex flex-col gap-4">
                <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
                  <h2 className="text-xl font-bold text-gray-900">
                    Recent Orders <span className="text-gray-500 font-normal">({filteredOrders.length})</span>
                  </h2>
                  <SearchField value={orderSearch} onChange={setOrderSearch} placeholder="Search by reference or customer" />
                </div>
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
                          ? "bg-green-500 border-green-500 text-gray-900 shadow-[0_0_15px_rgba(34,197,94,0.4)]"
                          : "bg-gray-50 border-gray-200 text-gray-500 hover:text-gray-900 hover:bg-gray-100"
                      }`}
                    >
                      {filter.label}
                    </button>
                  ))}
                </div>
              </div>
              {filteredOrders.length === 0 ? (
                <EmptyState
                  icon={ShoppingCart}
                  title={orderSearch || orderStatusFilter !== "all" ? "No matching orders" : "No orders yet"}
                  message={orderSearch || orderStatusFilter !== "all" ? "Try a different search or filter." : "Orders will appear here as customers check out."}
                />
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full sm:min-w-[720px] admin-table">
                    <thead className="bg-gray-50">
                      <tr>
                        <th className="text-left p-4 font-semibold text-gray-500 text-xs uppercase tracking-wide">Reference</th>
                        <th className="text-left p-4 font-semibold text-gray-500 text-xs uppercase tracking-wide">Customer</th>
                        <th className="text-left p-4 font-semibold text-gray-500 text-xs uppercase tracking-wide">Items</th>
                        <th className="text-left p-4 font-semibold text-gray-500 text-xs uppercase tracking-wide">Total</th>
                        <th className="text-left p-4 font-semibold text-gray-500 text-xs uppercase tracking-wide">Payment</th>
                        <th className="text-left p-4 font-semibold text-gray-500 text-xs uppercase tracking-wide">Date</th>
                      </tr>
                    </thead>
                    <tbody>
                      {filteredOrders.map((order) => (
                        <tr key={order._id} className="border-b border-gray-100 hover:bg-gray-50 transition-colors">
                          <td data-label="Reference" className="p-4 font-medium text-sm text-gray-600">{order.reference}</td>
                          <td data-label="Customer" data-stack="true" className="p-4">
                            <div>
                              <p className="font-medium text-gray-900">{order.customer?.fullName}</p>
                              <p className="text-sm text-gray-500">{order.customer?.email}</p>
                            </div>
                          </td>
                          <td data-label="Items" className="p-4 text-sm text-gray-500">{order.items?.length || 0}</td>
                          <td data-label="Total" className="p-4 font-semibold text-gray-900">₦{Number(order.total || 0).toLocaleString()}</td>
                          <td data-label="Payment" className="p-4">
                            <span
                              className={`px-2.5 py-1 rounded-full text-xs font-semibold border ${
                                order.paymentStatus === "paid"
                                  ? "bg-green-500/15 text-green-700 border-green-500/30"
                                  : order.paymentStatus === "failed"
                                  ? "bg-red-500/15 text-red-600 border-red-500/30"
                                  : "bg-yellow-500/15 text-amber-700 border-yellow-500/30"
                              }`}
                            >
                              {order.paymentStatus}
                            </span>
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
          )}

          {activeTab === "analytics" && (
            <div>
              {analyticsLoading && !analytics && (
                <div className="flex items-center justify-center py-24">
                  <p className="text-gray-500 text-sm">Loading analytics...</p>
                </div>
              )}

              {analytics && (
                <div className="space-y-8">
                  {/* Trend charts */}
                  <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                    {[
                      { key: "userGrowth", title: "Users Onboarded", color: "#16a34a", type: "line" },
                      { key: "businessGrowth", title: "Businesses Onboarded", color: "#0ea5e9", type: "line" },
                      { key: "revenueGrowth", title: "Revenue", color: "#eab308", type: "bar", isCurrency: true },
                      { key: "conversionGrowth", title: "Referral Conversions", color: "#a855f7", type: "bar" },
                    ].map((chart) => {
                      const data = (analytics.growth[chart.key] || []).map((d) => ({
                        ...d,
                        label: formatChartDate(d.date),
                      }));
                      const total = data.reduce((sum, d) => sum + d.count, 0);
                      return (
                        <div
                          key={chart.key}
                          className="bg-white border border-gray-200 shadow-sm rounded-2xl p-6"
                        >
                          <div className="flex items-baseline justify-between mb-4">
                            <h3 className="font-bold text-gray-900">{chart.title}</h3>
                            <p className="text-sm text-gray-500">
                              {chart.isCurrency ? `₦${total.toLocaleString()}` : total.toLocaleString()}{" "}
                              <span className="text-gray-400">last {analytics.growth.days} days</span>
                            </p>
                          </div>
                          <ResponsiveContainer width="100%" height={220}>
                            {chart.type === "line" ? (
                              <LineChart data={data}>
                                <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                                <XAxis
                                  dataKey="label"
                                  tick={{ fontSize: 11, fill: "#9ca3af" }}
                                  interval="preserveStartEnd"
                                />
                                <YAxis tick={{ fontSize: 11, fill: "#9ca3af" }} allowDecimals={false} />
                                <Tooltip />
                                <Line
                                  type="monotone"
                                  dataKey="count"
                                  stroke={chart.color}
                                  strokeWidth={2}
                                  dot={false}
                                />
                              </LineChart>
                            ) : (
                              <BarChart data={data}>
                                <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                                <XAxis
                                  dataKey="label"
                                  tick={{ fontSize: 11, fill: "#9ca3af" }}
                                  interval="preserveStartEnd"
                                />
                                <YAxis tick={{ fontSize: 11, fill: "#9ca3af" }} allowDecimals={false} />
                                <Tooltip
                                  formatter={(value) =>
                                    chart.isCurrency ? `₦${Number(value).toLocaleString()}` : value
                                  }
                                />
                                <Bar dataKey="count" fill={chart.color} radius={[4, 4, 0, 0]} />
                              </BarChart>
                            )}
                          </ResponsiveContainer>
                        </div>
                      );
                    })}
                  </div>

                  {/* Subscription status breakdown */}
                  <div className="bg-white border border-gray-200 shadow-sm rounded-2xl p-6">
                    <h3 className="font-bold text-gray-900 mb-4">Subscription Status</h3>
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                      {[
                        { label: "Active", value: analytics.subscriptions.active, color: "text-green-700 bg-green-50 border-green-200" },
                        { label: "Expired", value: analytics.subscriptions.expired, color: "text-red-600 bg-red-50 border-red-200" },
                        { label: "Never Subscribed", value: analytics.subscriptions.neverSubscribed, color: "text-gray-600 bg-gray-50 border-gray-200" },
                      ].map((s) => (
                        <div key={s.label} className={`rounded-xl border p-4 ${s.color}`}>
                          <p className="text-xs font-semibold uppercase tracking-wide opacity-80">{s.label}</p>
                          <p className="text-2xl font-black mt-1">{s.value}</p>
                        </div>
                      ))}
                    </div>
                  </div>

                  <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                    {/* Marketer leaderboard */}
                    <div className="bg-white border border-gray-200 shadow-sm rounded-2xl overflow-hidden">
                      <div className="p-6 border-b border-gray-200 flex items-center gap-2">
                        <Award size={18} className="text-amber-600" />
                        <h3 className="font-bold text-gray-900">Top Marketers</h3>
                      </div>
                      {analytics.leaderboard.length === 0 ? (
                        <EmptyState icon={Award} title="No payouts yet" message="Marketer earnings will show up here once referrals start converting." />
                      ) : (
                        <div className="divide-y divide-gray-100">
                          {analytics.leaderboard.map((m, i) => (
                            <div key={m.marketerId} className="flex items-center justify-between px-6 py-3">
                              <div className="flex items-center gap-3">
                                <span className="w-6 text-center text-sm font-bold text-gray-400">{i + 1}</span>
                                <div>
                                  <p className="font-semibold text-gray-900 text-sm">{m.name}</p>
                                  <p className="text-xs text-gray-500">
                                    {m.referralCode} · {m.totalReferred} referred · {m.totalConversions} converted
                                  </p>
                                </div>
                              </div>
                              <p className="font-bold text-green-700 text-sm">₦{m.totalEarned.toLocaleString()}</p>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>

                    {/* Recent activity */}
                    <div className="bg-white border border-gray-200 shadow-sm rounded-2xl overflow-hidden">
                      <div className="p-6 border-b border-gray-200 flex items-center gap-2">
                        <Clock size={18} className="text-gray-500" />
                        <h3 className="font-bold text-gray-900">Recent Activity</h3>
                      </div>
                      {analytics.activity.length === 0 ? (
                        <EmptyState icon={Clock} title="Nothing yet" message="Signups and orders will show up here as they happen." />
                      ) : (
                        <div className="divide-y divide-gray-100 max-h-[360px] overflow-y-auto">
                          {analytics.activity.map((event, i) => (
                            <div key={i} className="px-6 py-3 flex items-start justify-between gap-3">
                              <p className="text-sm text-gray-700">{event.label}</p>
                              <p className="text-xs text-gray-400 shrink-0 whitespace-nowrap">
                                {new Date(event.timestamp).toLocaleDateString("en-US", {
                                  month: "short",
                                  day: "numeric",
                                })}
                              </p>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}

          {activeTab === "businesses" && (
            <div className="bg-white border border-gray-200 shadow-sm rounded-2xl overflow-hidden">
              <div className="p-6 border-b border-gray-200 flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
                <h2 className="text-xl font-bold text-gray-900">
                  All Businesses <span className="text-gray-500 font-normal">({filteredBusinesses.length})</span>
                </h2>
                <SearchField value={businessSearch} onChange={setBusinessSearch} placeholder="Search by name, category, or location" />
              </div>
              {filteredBusinesses.length === 0 ? (
                <EmptyState
                  icon={Store}
                  title={businessSearch ? "No matching businesses" : "No businesses yet"}
                  message={businessSearch ? `Nothing matches "${businessSearch}".` : "Businesses will appear here once vendors sign up."}
                />
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full sm:min-w-[720px] admin-table">
                    <thead className="bg-gray-50">
                      <tr>
                        <th className="text-left p-4 font-semibold text-gray-500 text-xs uppercase tracking-wide">Business</th>
                        <th className="text-left p-4 font-semibold text-gray-500 text-xs uppercase tracking-wide">Category</th>
                        <th className="text-left p-4 font-semibold text-gray-500 text-xs uppercase tracking-wide">Location</th>
                        <th className="text-left p-4 font-semibold text-gray-500 text-xs uppercase tracking-wide">Contact</th>
                        <th className="text-left p-4 font-semibold text-gray-500 text-xs uppercase tracking-wide">Featured</th>
                        <th className="text-left p-4 font-semibold text-gray-500 text-xs uppercase tracking-wide">Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {filteredBusinesses.map((biz) => (
                        <tr key={biz._id} className="border-b border-gray-100 hover:bg-gray-50 transition-colors">
                          <td data-label="Business" data-stack="true" className="p-4">
                            <div className="flex items-center gap-3">
                              {biz.logo && (
                                <img
                                  src={biz.logo}
                                  alt=""
                                  className="w-9 h-9 rounded-full object-cover border border-gray-200"
                                />
                              )}
                              <span className="font-medium text-gray-900">{biz.name}</span>
                            </div>
                          </td>
                          <td data-label="Category" className="p-4 text-gray-500">{biz.category}</td>
                          <td data-label="Location" className="p-4 text-gray-500">{biz.location}</td>
                          <td data-label="Contact" className="p-4 text-gray-500">{biz.contact}</td>
                          <td data-label="Featured" className="p-4">
                            <button
                              onClick={() => toggleFeatured(biz._id, biz.featured)}
                              className={`flex items-center gap-1 px-3 py-1 rounded-full text-sm font-medium border transition ${
                                biz.featured
                                  ? "bg-yellow-500/15 text-amber-700 border-yellow-500/30"
                                  : "bg-gray-50 text-gray-500 border-gray-200 hover:bg-gray-100"
                              }`}
                            >
                              <Star size={14} fill={biz.featured ? "currentColor" : "none"} />
                              {biz.featured ? "Featured" : "Not Featured"}
                            </button>
                          </td>
                          <td data-label="Actions" data-stack="true" className="p-4">
                            <div className="flex gap-2">
                              <button
                                onClick={() => navigate(`/dashboard/${biz._id}`)}
                                className="px-3 py-1.5 bg-green-500 text-gray-900 rounded-lg hover:bg-green-600 text-sm font-medium transition"
                              >
                                View
                              </button>
                              <button
                                onClick={() => deleteBusiness(biz._id, biz.name)}
                                className="px-3 py-1.5 bg-red-500/15 text-red-600 border border-red-500/30 rounded-lg hover:bg-red-500/25 text-sm font-medium flex items-center gap-1 transition"
                              >
                                <Trash2 size={14} />
                                Delete
                              </button>
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}

          {activeTab === "products" && (
            <div className="bg-white border border-gray-200 shadow-sm rounded-2xl overflow-hidden">
              <div className="p-6 border-b border-gray-200 flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
                <h2 className="text-xl font-bold text-gray-900">
                  All Products <span className="text-gray-500 font-normal">({filteredProducts.length})</span>
                </h2>
                <SearchField value={productSearch} onChange={setProductSearch} placeholder="Search products" />
              </div>
              {filteredProducts.length === 0 ? (
                <EmptyState
                  icon={Package}
                  title={productSearch ? "No matching products" : "No products yet"}
                  message={productSearch ? `Nothing matches "${productSearch}".` : "Products will appear here as vendors list them."}
                />
              ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5 p-6">
                  {filteredProducts.map((product) => (
                    <div
                      key={product._id}
                      className="bg-gray-50 border border-gray-200 rounded-xl overflow-hidden hover:border-white/20 hover:-translate-y-0.5 transition-all"
                    >
                      <div className="h-44 bg-gray-50">
                        {product.images?.[0] ? (
                          <img
                            src={product.images[0]}
                            alt={product.name}
                            className="w-full h-full object-cover"
                          />
                        ) : (
                          <div className="w-full h-full flex items-center justify-center">
                            <Package className="text-gray-600" size={40} />
                          </div>
                        )}
                      </div>
                      <div className="p-4">
                        <h3 className="font-bold text-gray-900 mb-1 truncate">{product.name}</h3>
                        <p className="text-green-700 font-bold text-lg mb-2">
                          ₦{product.price?.toLocaleString()}
                        </p>
                        <p className="text-sm text-gray-500 mb-4 line-clamp-2">
                          {product.description}
                        </p>
                        <button
                          onClick={() => deleteProduct(product._id, product.name)}
                          className="w-full px-4 py-2 bg-yellow-500/15 text-amber-700 border border-yellow-500/30 rounded-lg hover:bg-yellow-500/25 flex items-center justify-center gap-2 font-medium text-sm transition"
                        >
                          <Trash2 size={15} />
                          Delete Product
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {activeTab === "users" && (
            <div className="bg-white border border-gray-200 shadow-sm rounded-2xl overflow-hidden">
              <div className="p-6 border-b border-gray-200 flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
                <h2 className="text-xl font-bold text-gray-900">
                  All Users <span className="text-gray-500 font-normal">({filteredUsers.length})</span>
                </h2>
                <SearchField value={userSearch} onChange={setUserSearch} placeholder="Search by email or business" />
              </div>
              {filteredUsers.length === 0 ? (
                <EmptyState
                  icon={Users}
                  title={userSearch ? "No matching users" : "No users yet"}
                  message={userSearch ? `Nothing matches "${userSearch}".` : "Registered users will appear here."}
                />
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full sm:min-w-[720px] admin-table">
                    <thead className="bg-gray-50">
                      <tr>
                        <th className="text-left p-4 font-semibold text-gray-500 text-xs uppercase tracking-wide">Email</th>
                        <th className="text-left p-4 font-semibold text-gray-500 text-xs uppercase tracking-wide">Business</th>
                        <th className="text-left p-4 font-semibold text-gray-500 text-xs uppercase tracking-wide">Role</th>
                        <th className="text-left p-4 font-semibold text-gray-500 text-xs uppercase tracking-wide">Status</th>
                        <th className="text-left p-4 font-semibold text-gray-500 text-xs uppercase tracking-wide">Joined</th>
                        <th className="text-left p-4 font-semibold text-gray-500 text-xs uppercase tracking-wide">Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {filteredUsers.map((u) => (
                        <tr key={u._id} className="border-b border-gray-100 hover:bg-gray-50 transition-colors">
                          <td data-label="Email" className="p-4 font-medium text-gray-900">{u.email}</td>
                          <td data-label="Business" className="p-4 text-gray-500">{u.businessId?.name || "No business"}</td>
                          <td data-label="Role" className="p-4">
                            <span
                              className={`px-2.5 py-1 rounded-full text-xs font-semibold border ${
                                u.role === "admin"
                                  ? "bg-purple-500/15 text-purple-700 border-purple-500/30"
                                  : "bg-blue-500/15 text-blue-700 border-blue-500/30"
                              }`}
                            >
                              {u.role}
                            </span>
                          </td>
                          <td data-label="Status" className="p-4">
                            <span
                              className={`flex items-center gap-1.5 text-sm font-medium justify-end sm:justify-start ${
                                u.banned ? "text-red-600" : "text-green-700"
                              }`}
                            >
                              {u.banned ? <Ban size={15} /> : <CheckCircle size={15} />}
                              {u.banned ? "Banned" : "Active"}
                            </span>
                          </td>
                          <td data-label="Joined" className="p-4 text-sm text-gray-500">
                            {new Date(u.createdAt).toLocaleDateString()}
                          </td>
                          <td data-label="Actions" className="p-4">
                            {u.role !== "admin" && (
                              <button
                                onClick={() => toggleUserBan(u._id, u.banned, u.email)}
                                className={`px-3 py-1.5 rounded-lg text-sm font-medium transition ${
                                  u.banned
                                    ? "bg-green-500/15 text-green-700 border border-green-500/30 hover:bg-green-500/25"
                                    : "bg-red-500/15 text-red-600 border border-red-500/30 hover:bg-red-500/25"
                                }`}
                              >
                                {u.banned ? "Unban" : "Ban User"}
                              </button>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}

          {activeTab === "customers" && <CustomerAdminTab showToast={showToast} />}

          {activeTab === "emails" && <CampaignAdminTab showToast={showToast} />}

          {activeTab === "vendors" && (
            <div className="bg-white border border-gray-200 shadow-sm rounded-2xl overflow-hidden">
              <div className="p-6 border-b border-gray-200">
                <h2 className="text-xl font-bold text-gray-900">
                  Vendor Verification <span className="text-gray-500 font-normal">({vendors.length})</span>
                </h2>
              </div>
              {vendors.length === 0 ? (
                <EmptyState icon={ShieldCheck} title="Nothing to review" message="Vendor verification submissions will show up here." />
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full sm:min-w-[900px] admin-table">
                    <thead className="bg-gray-50">
                      <tr>
                        <th className="text-left p-4 font-semibold text-gray-500 text-xs uppercase tracking-wide">Business</th>
                        <th className="text-left p-4 font-semibold text-gray-500 text-xs uppercase tracking-wide">Tier</th>
                        <th className="text-left p-4 font-semibold text-gray-500 text-xs uppercase tracking-wide">Documents</th>
                        <th className="text-left p-4 font-semibold text-gray-500 text-xs uppercase tracking-wide">Review Status</th>
                        <th className="text-left p-4 font-semibold text-gray-500 text-xs uppercase tracking-wide">Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {vendors.map((v) => (
                        <tr key={v._id} className="border-b border-gray-100 hover:bg-gray-50 transition-colors">
                          <td data-label="Business" data-stack="true" className="p-4">
                            <p className="font-medium text-gray-900">{v.businessId?.name || v.businessName}</p>
                            <p className="text-sm text-gray-500">{v.contactEmail}</p>
                          </td>
                          <td data-label="Tier" className="p-4">
                            <span className="px-2.5 py-1 rounded-full text-xs font-semibold border bg-blue-500/15 text-blue-700 border-blue-500/30 capitalize">
                              {v.verificationTier}
                            </span>
                          </td>
                          <td data-label="Documents" data-stack="true" className="p-4 text-sm">
                            <div className="flex flex-col gap-1">
                              {[
                                { label: "NIN", value: v.nin },
                                { label: "CAC", url: v.cacDocumentUrl },
                                { label: "Address proof", url: v.addressProofUrl },
                                { label: "Selfie", url: v.selfieUrl },
                              ].map((doc) => (
                                <span key={doc.label} className="flex items-center gap-1.5 text-gray-500">
                                  <FileText size={13} />
                                  {doc.url ? (
                                    <a
                                      href={doc.url}
                                      target="_blank"
                                      rel="noopener noreferrer"
                                      className="text-green-700 hover:underline"
                                    >
                                      {doc.label}
                                    </a>
                                  ) : (
                                    <span>{doc.label}: {doc.value || "—"}</span>
                                  )}
                                </span>
                              ))}
                              <span
                                className={`mt-1 text-xs font-medium ${
                                  v.ninVerified ? (v.ninNameMatch === false ? "text-amber-700" : "text-green-700") : "text-gray-400"
                                }`}
                              >
                                {v.ninVerified
                                  ? v.ninNameMatch === false
                                    ? `NIN verified (${v.ninHolderName}) — name differs from payout account`
                                    : `NIN verified (${v.ninHolderName})`
                                  : "NIN not checked"}
                              </span>
                            </div>
                          </td>
                          <td data-label="Status" data-stack="true" className="p-4">
                            <span
                              className={`px-2.5 py-1 rounded-full text-xs font-semibold border capitalize ${
                                v.reviewStatus === "approved"
                                  ? "bg-green-500/15 text-green-700 border-green-500/30"
                                  : v.reviewStatus === "rejected"
                                  ? "bg-red-500/15 text-red-600 border-red-500/30"
                                  : "bg-yellow-500/15 text-amber-700 border-yellow-500/30"
                              }`}
                            >
                              {v.reviewStatus}
                            </span>
                            {v.reviewStatus === "rejected" && v.reviewNotes && (
                              <p className="text-xs text-gray-500 mt-1 max-w-[220px]">{v.reviewNotes}</p>
                            )}
                            {v.payoutHold && (
                              <span className="mt-1 flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-semibold bg-orange-500/15 text-orange-700 border border-orange-500/30 w-fit">
                                <AlertTriangle size={11} />
                                Payout on hold
                              </span>
                            )}
                            {v.payoutHold && v.payoutHoldReason && (
                              <p className="text-xs text-orange-700/80 mt-1 max-w-[220px]">{v.payoutHoldReason}</p>
                            )}
                          </td>
                          <td data-label="Actions" data-stack="true" className="p-4">
                            {v.reviewStatus === "approved" ? (
                              <span className="flex items-center gap-1.5 text-sm font-medium text-green-700">
                                <ShieldCheck size={14} />
                                Approved
                              </span>
                            ) : (
                            <div className="flex gap-2">
                              <button
                                onClick={() => reviewVendor(v._id, "approved", v.businessId?.name || v.businessName)}
                                className="px-3 py-1.5 bg-green-500/15 text-green-700 border border-green-500/30 rounded-lg hover:bg-green-500/25 text-sm font-medium flex items-center gap-1 transition"
                              >
                                <ShieldCheck size={14} />
                                Approve
                              </button>
                              {v.reviewStatus !== "rejected" && (
                              <button
                                onClick={() => reviewVendor(v._id, "rejected", v.businessId?.name || v.businessName)}
                                className="px-3 py-1.5 bg-red-500/15 text-red-600 border border-red-500/30 rounded-lg hover:bg-red-500/25 text-sm font-medium flex items-center gap-1 transition"
                              >
                                <XCircle size={14} />
                                Reject
                              </button>
                              )}
                            </div>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}

          {activeTab === "marketers" && (
            <div>
              {marketerDetail ? (
                <div className="bg-white border border-gray-200 shadow-sm rounded-2xl overflow-hidden">
                  <div className="p-6 border-b border-gray-200 flex items-center gap-3">
                    <button
                      onClick={() => setMarketerDetail(null)}
                      className="p-2 rounded-lg hover:bg-gray-100 text-gray-500"
                    >
                      <ArrowLeft size={18} />
                    </button>
                    <div>
                      <h2 className="text-xl font-bold text-gray-900">
                        {marketerDetail.marketer?.name || "Loading…"}
                      </h2>
                      <p className="text-sm text-gray-500">{marketerDetail.marketer?.email}</p>
                    </div>
                  </div>
                  {marketerDetailLoading ? (
                    <div className="p-10 text-center text-gray-500 text-sm">Loading…</div>
                  ) : (
                    <>
                      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 p-6 border-b border-gray-200">
                        {[
                          { label: "Total Referred", value: marketerDetail.stats?.totalReferred || 0 },
                          { label: "Converted", value: marketerDetail.stats?.totalConverted || 0 },
                          { label: "Pending Payout", value: `₦${(marketerDetail.stats?.pendingPayoutTotal || 0).toLocaleString()}` },
                          { label: "Lifetime Paid", value: `₦${(marketerDetail.stats?.lifetimePaidTotal || 0).toLocaleString()}` },
                        ].map((s) => (
                          <div key={s.label} className="bg-gray-50 border border-gray-200 rounded-xl p-4">
                            <p className="text-xs text-gray-500 font-medium">{s.label}</p>
                            <p className="text-lg font-bold text-gray-900 mt-1">{s.value}</p>
                          </div>
                        ))}
                      </div>
                      <div className="p-6">
                        <h3 className="font-semibold text-gray-900 mb-3">Referrals</h3>
                        {(marketerDetail.referrals || []).length === 0 ? (
                          <p className="text-sm text-gray-500">No referrals yet.</p>
                        ) : (
                          <div className="space-y-2 mb-6">
                            {marketerDetail.referrals.map((r) => (
                              <div
                                key={r.id}
                                className="flex items-center justify-between px-4 py-2.5 bg-gray-50 border border-gray-200 rounded-lg text-sm"
                              >
                                <span className="font-medium text-gray-900">{r.businessName}</span>
                                <span
                                  className={`px-2 py-0.5 rounded-full text-xs font-semibold border ${
                                    r.status === "converted"
                                      ? "bg-green-500/15 text-green-700 border-green-500/30"
                                      : "bg-yellow-500/15 text-amber-700 border-yellow-500/30"
                                  }`}
                                >
                                  {r.status}
                                </span>
                              </div>
                            ))}
                          </div>
                        )}
                        <h3 className="font-semibold text-gray-900 mb-3">Payout History</h3>
                        {(marketerDetail.payouts || []).length === 0 ? (
                          <p className="text-sm text-gray-500">No payouts yet.</p>
                        ) : (
                          <div className="space-y-2">
                            {marketerDetail.payouts.map((p) => (
                              <div
                                key={p._id}
                                className="flex items-center justify-between px-4 py-2.5 bg-gray-50 border border-gray-200 rounded-lg text-sm"
                              >
                                <span className="text-gray-900 font-medium">₦{p.amount.toLocaleString()}</span>
                                <span className="text-gray-500 capitalize">{p.status}</span>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    </>
                  )}
                </div>
              ) : (
                <div className="bg-white border border-gray-200 shadow-sm rounded-2xl overflow-hidden">
                  <div className="p-6 border-b border-gray-200 flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
                    <h2 className="text-xl font-bold text-gray-900">
                      All Marketers <span className="text-gray-500 font-normal">({filteredMarketers.length})</span>
                    </h2>
                    <SearchField value={marketerSearch} onChange={setMarketerSearch} placeholder="Search by name, email, or referral code" />
                  </div>
                  {filteredMarketers.length === 0 ? (
                    <EmptyState
                      icon={UserCog}
                      title={marketerSearch ? "No matching marketers" : "No marketers yet"}
                      message={marketerSearch ? `Nothing matches "${marketerSearch}".` : "Marketers will appear here once people register."}
                    />
                  ) : (
                    <div className="overflow-x-auto">
                      <table className="w-full sm:min-w-[820px] admin-table">
                        <thead className="bg-gray-50">
                          <tr>
                            <th className="text-left p-4 font-semibold text-gray-500 text-xs uppercase tracking-wide">Marketer</th>
                            <th className="text-left p-4 font-semibold text-gray-500 text-xs uppercase tracking-wide">Referral Code</th>
                            <th className="text-left p-4 font-semibold text-gray-500 text-xs uppercase tracking-wide">Referred / Converted</th>
                            <th className="text-left p-4 font-semibold text-gray-500 text-xs uppercase tracking-wide">Pending / Paid</th>
                            <th className="text-left p-4 font-semibold text-gray-500 text-xs uppercase tracking-wide">Actions</th>
                          </tr>
                        </thead>
                        <tbody>
                          {filteredMarketers.map((m) => (
                            <tr key={m._id} className="border-b border-gray-100 hover:bg-gray-50 transition-colors">
                              <td data-label="Marketer" data-stack="true" className="p-4">
                                <p className="font-medium text-gray-900">{m.name}</p>
                                <p className="text-sm text-gray-500">{m.email}</p>
                              </td>
                              <td data-label="Referral Code" className="p-4 text-gray-500 font-mono text-sm">{m.referralCode}</td>
                              <td data-label="Referred / Converted" className="p-4 text-gray-500">
                                {m.totalReferred} / {m.totalConverted}
                              </td>
                              <td data-label="Pending / Paid" className="p-4 text-gray-500">
                                ₦{(m.pendingPayoutTotal || 0).toLocaleString()} / ₦{(m.lifetimePaidTotal || 0).toLocaleString()}
                              </td>
                              <td data-label="Actions" data-stack="true" className="p-4">
                                <div className="flex gap-2">
                                  <button
                                    onClick={() => viewMarketerDetail(m._id)}
                                    className="px-3 py-1.5 bg-green-500 text-gray-900 rounded-lg hover:bg-green-600 text-sm font-medium transition"
                                  >
                                    View
                                  </button>
                                  <button
                                    onClick={() => toggleMarketerBan(m._id, m.banned)}
                                    className={`px-3 py-1.5 rounded-lg text-sm font-medium transition ${
                                      m.banned
                                        ? "bg-green-500/15 text-green-700 border border-green-500/30 hover:bg-green-500/25"
                                        : "bg-red-500/15 text-red-600 border border-red-500/30 hover:bg-red-500/25"
                                    }`}
                                  >
                                    {m.banned ? "Unban" : "Ban"}
                                  </button>
                                  <button
                                    onClick={() => deleteMarketer(m._id, m.name)}
                                    className="px-3 py-1.5 bg-red-500/15 text-red-600 border border-red-500/30 rounded-lg hover:bg-red-500/25 text-sm font-medium flex items-center gap-1 transition"
                                  >
                                    <Trash2 size={14} />
                                    Delete
                                  </button>
                                </div>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>
              )}
            </div>
          )}

          {activeTab === "payouts" && (
            <div className="bg-white border border-gray-200 shadow-sm rounded-2xl overflow-hidden">
              <div className="p-6 border-b border-gray-200 flex flex-col gap-4">
                <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
                  <h2 className="text-xl font-bold text-gray-900">
                    Payouts <span className="text-gray-500 font-normal">({payouts.rows.length})</span>
                  </h2>
                  <span className="inline-flex w-fit items-center px-3 py-1.5 rounded-full text-sm font-semibold bg-amber-500/15 text-amber-800 border border-amber-500/30">
                    {payouts.toPay.count === 0
                      ? "Nothing to send right now"
                      : `₦${Number(payouts.toPay.total).toLocaleString()} to send · ${payouts.toPay.count} transfer${payouts.toPay.count === 1 ? "" : "s"}`}
                  </span>
                </div>
                <p className="text-sm text-gray-500">
                  Everything owed to marketers and vendors in one place. Send the money to the account shown (bank
                  transfer or the Paystack dashboard), then mark it paid. Marking paid, or rejecting, emails them
                  automatically.
                </p>
                <div className="flex flex-wrap gap-x-6 gap-y-2">
                  <div className="flex flex-wrap gap-2">
                    {[
                      { id: "all", label: "All" },
                      { id: "marketer", label: "Marketers" },
                      { id: "vendor", label: "Vendors" },
                    ].map((f) => (
                      <button
                        key={f.id}
                        onClick={() => setPayoutTypeFilter(f.id)}
                        className={`px-3 py-1.5 rounded-full text-sm font-medium border transition ${
                          payoutTypeFilter === f.id
                            ? "bg-green-500/15 text-green-700 border-green-500/30"
                            : "bg-gray-50 text-gray-500 border-gray-200 hover:bg-gray-100"
                        }`}
                      >
                        {f.label}
                      </button>
                    ))}
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {[
                      { id: "to_pay", label: "To pay" },
                      { id: "paid", label: "Paid" },
                      { id: "rejected", label: "Rejected" },
                    ].map((f) => (
                      <button
                        key={f.id}
                        onClick={() => setPayoutStatusFilter(f.id)}
                        className={`px-3 py-1.5 rounded-full text-sm font-medium border transition ${
                          payoutStatusFilter === f.id
                            ? "bg-green-500/15 text-green-700 border-green-500/30"
                            : "bg-gray-50 text-gray-500 border-gray-200 hover:bg-gray-100"
                        }`}
                      >
                        {f.label}
                      </button>
                    ))}
                  </div>
                </div>
              </div>
              {payoutsLoading ? (
                <div className="p-10 text-center text-gray-500 text-sm">Loading…</div>
              ) : payouts.rows.length === 0 ? (
                <EmptyState
                  icon={Wallet}
                  title={payoutStatusFilter === "to_pay" ? "Nothing to pay right now" : "Nothing here yet"}
                  message={
                    payoutStatusFilter === "to_pay"
                      ? "Marketer earnings are frozen into the list by the weekly job (or when a marketer asks to withdraw), and vendor withdrawals appear the moment they are requested."
                      : "Payouts you have marked paid or rejected will be listed here."
                  }
                />
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full sm:min-w-[960px] admin-table">
                    <thead className="bg-gray-50">
                      <tr>
                        <th className="text-left p-4 font-semibold text-gray-500 text-xs uppercase tracking-wide">Who</th>
                        <th className="text-left p-4 font-semibold text-gray-500 text-xs uppercase tracking-wide">Pay to</th>
                        <th className="text-left p-4 font-semibold text-gray-500 text-xs uppercase tracking-wide">Amount</th>
                        <th className="text-left p-4 font-semibold text-gray-500 text-xs uppercase tracking-wide">{payoutStatusFilter === "to_pay" ? "Waiting since" : "Details"}</th>
                        <th className="text-left p-4 font-semibold text-gray-500 text-xs uppercase tracking-wide">{payoutStatusFilter === "to_pay" ? "Actions" : "Status"}</th>
                      </tr>
                    </thead>
                    <tbody>
                      {payouts.rows.map((row) => (
                        <tr key={row.rowId} className="border-b border-gray-100 hover:bg-gray-50 transition-colors">
                          <td data-label="Who" data-stack="true" className="p-4">
                            <p className="font-medium text-gray-900">{row.party}</p>
                            <p className="text-xs text-gray-500">{row.email}</p>
                            <span
                              className={`mt-1 inline-block px-2 py-0.5 rounded-full text-[11px] font-semibold border ${
                                row.kind === "marketer"
                                  ? "bg-purple-500/10 text-purple-700 border-purple-500/30"
                                  : "bg-blue-500/10 text-blue-700 border-blue-500/30"
                              }`}
                            >
                              {row.kind === "marketer" ? "Marketer" : "Vendor"}
                            </span>
                          </td>
                          <td data-label="Pay to" data-stack="true" className="p-4 text-sm text-gray-600">
                            {row.hasBank ? (
                              <>
                                <p>{row.bank.bankName}</p>
                                <p className="text-xs text-gray-500">{row.bank.accountName}</p>
                                <button
                                  type="button"
                                  onClick={() => copyToClipboard(row.bank.accountNumber, "Account number")}
                                  className="mt-1 inline-flex items-center gap-1.5 px-2 py-1 rounded-md bg-gray-100 hover:bg-gray-200 text-xs font-mono text-gray-800 transition"
                                  title="Copy account number"
                                >
                                  {row.bank.accountNumber}
                                  <span className="text-[10px] font-sans text-gray-500">Copy</span>
                                </button>
                              </>
                            ) : (
                              <span className="px-2 py-1 rounded-full text-xs font-semibold bg-red-500/15 text-red-600 border border-red-500/30">
                                No payout details on file
                              </span>
                            )}
                          </td>
                          <td data-label="Amount" className="p-4">
                            <p className="font-semibold text-gray-900">₦{Number(row.amount).toLocaleString()}</p>
                            {row.kind === "marketer" && row.count > 1 && (
                              <p className="text-xs text-gray-500">{row.count} referral payouts</p>
                            )}
                            {row.kind === "vendor" && <p className="text-xs text-gray-500">Points withdrawal</p>}
                          </td>
                          <td data-label={payoutStatusFilter === "to_pay" ? "Waiting since" : "Details"} data-stack="true" className="p-4 text-sm text-gray-500">
                            <p>{new Date(row.date).toLocaleDateString("en-NG", { day: "numeric", month: "short", year: "numeric" })}</p>
                            {row.reference && <p className="text-xs text-gray-400">Ref: {row.reference}</p>}
                            {row.reason && <p className="text-xs text-gray-500 mt-1">Reason: {row.reason}</p>}
                          </td>
                          <td data-label={payoutStatusFilter === "to_pay" ? "Actions" : "Status"} data-stack="true" className="p-4">
                            {payoutStatusFilter === "to_pay" ? (
                              <div className="flex flex-wrap items-center gap-2">
                                <input
                                  type="text"
                                  placeholder="Transfer ref"
                                  aria-label="Transfer reference (optional)"
                                  value={payoutRefDrafts[row.rowId] || ""}
                                  onChange={(e) => setPayoutRefDrafts((prev) => ({ ...prev, [row.rowId]: e.target.value }))}
                                  className="px-2 py-1.5 rounded-lg border border-gray-200 text-xs w-32 focus:outline-none focus:ring-2 focus:ring-green-500/30"
                                />
                                <button
                                  onClick={() => markPayoutPaid(row)}
                                  disabled={payoutBusyId === row.rowId}
                                  className="px-3 py-1.5 rounded-lg text-xs font-semibold bg-green-600 text-white hover:bg-green-700 transition disabled:opacity-50"
                                >
                                  {payoutBusyId === row.rowId ? "Working…" : "Mark paid"}
                                </button>
                                <button
                                  onClick={() => rejectPayout(row)}
                                  disabled={payoutBusyId === row.rowId}
                                  className="px-3 py-1.5 rounded-lg text-xs font-semibold border border-red-300 text-red-600 hover:bg-red-50 transition disabled:opacity-50"
                                >
                                  Reject
                                </button>
                              </div>
                            ) : (
                              <span
                                className={`px-2.5 py-1 rounded-full text-xs font-semibold border ${
                                  row.status === "paid"
                                    ? "bg-green-500/15 text-green-700 border-green-500/30"
                                    : "bg-red-500/15 text-red-600 border-red-500/30"
                                }`}
                              >
                                {row.status === "paid" ? "Paid" : "Rejected"}
                              </span>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}

          {activeTab === "transactions" && (
            <div className="bg-white border border-gray-200 shadow-sm rounded-2xl overflow-hidden">
              <div className="p-6 border-b border-gray-200 flex flex-col gap-4">
                <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
                  <h2 className="text-xl font-bold text-gray-900">
                    Transactions <span className="text-gray-500 font-normal">({filteredTransactions.length})</span>
                  </h2>
                  <SearchField value={transactionSearch} onChange={setTransactionSearch} placeholder="Search by business, marketer, or reference" />
                </div>
                <div className="flex flex-wrap gap-2">
                  {[
                    { id: "all", label: "All" },
                    { id: "subscription", label: "Subscriptions" },
                    { id: "marketer_payout", label: "Marketer Payouts" },
                    { id: "points", label: "Points Ledger" },
                  ].map((f) => (
                    <button
                      key={f.id}
                      onClick={() => setTransactionTypeFilter(f.id)}
                      className={`px-3 py-1.5 rounded-full text-sm font-medium border transition ${
                        transactionTypeFilter === f.id
                          ? "bg-green-500/15 text-green-700 border-green-500/30"
                          : "bg-gray-50 text-gray-500 border-gray-200 hover:bg-gray-100"
                      }`}
                    >
                      {f.label}
                    </button>
                  ))}
                </div>
              </div>
              {transactionsLoading ? (
                <div className="p-10 text-center text-gray-500 text-sm">Loading…</div>
              ) : filteredTransactions.length === 0 ? (
                <EmptyState
                  icon={Receipt}
                  title="No transactions"
                  message="Subscription payments, marketer payouts, and points activity will show up here."
                />
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full sm:min-w-[820px] admin-table">
                    <thead className="bg-gray-50">
                      <tr>
                        <th className="text-left p-4 font-semibold text-gray-500 text-xs uppercase tracking-wide">Type</th>
                        <th className="text-left p-4 font-semibold text-gray-500 text-xs uppercase tracking-wide">Party</th>
                        <th className="text-left p-4 font-semibold text-gray-500 text-xs uppercase tracking-wide">Amount</th>
                        <th className="text-left p-4 font-semibold text-gray-500 text-xs uppercase tracking-wide">Status</th>
                        <th className="text-left p-4 font-semibold text-gray-500 text-xs uppercase tracking-wide">Date</th>
                        <th className="text-left p-4 font-semibold text-gray-500 text-xs uppercase tracking-wide">Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {filteredTransactions.map((t) => (
                        <tr key={`${t.kind}-${t.id}`} className="border-b border-gray-100 hover:bg-gray-50 transition-colors">
                          <td data-label="Type" className="p-4">
                            <span className="px-2.5 py-1 rounded-full text-xs font-semibold border bg-blue-500/15 text-blue-700 border-blue-500/30 capitalize">
                              {t.kind === "marketer_payout" ? "Marketer Payout" : t.kind === "points" ? `Points (${t.pointsType})` : `Subscription (${t.planType})`}
                            </span>
                          </td>
                          <td data-label="Party" className="p-4 font-medium text-gray-900">{t.party}</td>
                          <td data-label="Amount" className="p-4 text-gray-500">
                            {t.kind === "points" ? t.amount : `₦${Number(t.amount).toLocaleString()}`}
                          </td>
                          <td data-label="Status" className="p-4">
                            <span
                              className={`px-2.5 py-1 rounded-full text-xs font-semibold border capitalize ${
                                ["success", "paid"].includes(t.status)
                                  ? "bg-green-500/15 text-green-700 border-green-500/30"
                                  : ["failed", "rejected"].includes(t.status)
                                  ? "bg-red-500/15 text-red-600 border-red-500/30"
                                  : "bg-yellow-500/15 text-amber-700 border-yellow-500/30"
                              }`}
                            >
                              {t.status}
                            </span>
                          </td>
                          <td data-label="Date" className="p-4 text-gray-500 text-sm">
                            {new Date(t.date).toLocaleDateString("en-NG", { day: "numeric", month: "short", year: "numeric" })}
                          </td>
                          <td data-label="Actions" className="p-4">
                            {((t.kind === "points" && t.pointsType === "withdrawn_cash" && t.status === "pending") ||
                              (t.kind === "marketer_payout" && t.status === "batched")) && (
                              <button
                                onClick={() => {
                                  setPayoutTypeFilter(t.kind === "marketer_payout" ? "marketer" : "vendor");
                                  setPayoutStatusFilter("to_pay");
                                  setActiveTab("payouts");
                                }}
                                className="px-3 py-1.5 rounded-lg text-xs font-semibold border border-green-300 text-green-700 hover:bg-green-50 transition"
                              >
                                Pay in Payouts →
                              </button>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}

          {activeTab === "visibility" && (
            <div className="bg-white border border-gray-200 shadow-sm rounded-2xl overflow-hidden">
              <div className="p-6 border-b border-gray-200 flex flex-col gap-4">
                <div>
                  <h2 className="text-xl font-bold text-gray-900">Kill Switch — Per-Business Overrides</h2>
                  <p className="text-sm text-gray-500 mt-1">
                    Exempt individual businesses from the global Subscription Visibility Gate (Overview tab). An
                    exempted business is always shown regardless of subscription status.
                  </p>
                </div>
                <SearchField value={visibilitySearch} onChange={setVisibilitySearch} placeholder="Search by business name" />
              </div>
              {filteredVisibilityBusinesses.length === 0 ? (
                <EmptyState icon={ToggleLeft} title="No businesses" message="Businesses will appear here once vendors sign up." />
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full sm:min-w-[600px] admin-table">
                    <thead className="bg-gray-50">
                      <tr>
                        <th className="text-left p-4 font-semibold text-gray-500 text-xs uppercase tracking-wide">Business</th>
                        <th className="text-left p-4 font-semibold text-gray-500 text-xs uppercase tracking-wide">Subscription Status</th>
                        <th className="text-left p-4 font-semibold text-gray-500 text-xs uppercase tracking-wide">Exempt</th>
                      </tr>
                    </thead>
                    <tbody>
                      {filteredVisibilityBusinesses.map((biz) => (
                        <tr key={biz._id} className="border-b border-gray-100 hover:bg-gray-50 transition-colors">
                          <td data-label="Business" className="p-4 font-medium text-gray-900">{biz.name}</td>
                          <td data-label="Subscription" className="p-4 text-gray-500 capitalize">{biz.subscriptionStatus}</td>
                          <td data-label="Exempt" className="p-4">
                            <button
                              onClick={() => toggleVisibilityExempt(biz._id, biz.visibilityExempt)}
                              className={`relative inline-flex h-7 w-12 items-center rounded-full transition-colors ${
                                biz.visibilityExempt ? "bg-green-500" : "bg-gray-300"
                              }`}
                            >
                              <span
                                className={`inline-block h-5 w-5 transform rounded-full bg-white transition-transform ${
                                  biz.visibilityExempt ? "translate-x-6" : "translate-x-1"
                                }`}
                              />
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}

          {activeTab === "grandfather" && (
            <div className="bg-white border border-gray-200 shadow-sm rounded-2xl overflow-hidden">
              <div className="p-6 border-b border-gray-200 flex flex-col gap-4">
                <div>
                  <h2 className="text-xl font-bold text-gray-900">Grandfather Exemptions</h2>
                  <p className="text-sm text-gray-500 mt-1">
                    Give a specific business a time-boxed exemption from the subscription-visibility gate — e.g. a
                    current month or more of grace before they need to pay to stay visible.
                  </p>
                </div>
                <SearchField value={grandfatherSearch} onChange={setGrandfatherSearch} placeholder="Search by business name" />
              </div>
              {filteredGrandfatherBusinesses.length === 0 ? (
                <EmptyState icon={CalendarClock} title="No businesses" message="Businesses will appear here once vendors sign up." />
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full sm:min-w-[680px] admin-table">
                    <thead className="bg-gray-50">
                      <tr>
                        <th className="text-left p-4 font-semibold text-gray-500 text-xs uppercase tracking-wide">Business</th>
                        <th className="text-left p-4 font-semibold text-gray-500 text-xs uppercase tracking-wide">Exempt Until</th>
                        <th className="text-left p-4 font-semibold text-gray-500 text-xs uppercase tracking-wide">Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {filteredGrandfatherBusinesses.map((biz) => {
                        const draft =
                          grandfatherDrafts[biz._id] !== undefined
                            ? grandfatherDrafts[biz._id]
                            : biz.grandfatherExemptUntil
                            ? new Date(biz.grandfatherExemptUntil).toISOString().slice(0, 10)
                            : "";
                        const isActive = biz.grandfatherExemptUntil && new Date(biz.grandfatherExemptUntil) > new Date();
                        return (
                          <tr key={biz._id} className="border-b border-gray-100 hover:bg-gray-50 transition-colors">
                            <td data-label="Business" className="p-4 font-medium text-gray-900">{biz.name}</td>
                            <td data-label="Exempt Until" data-stack="true" className="p-4">
                              <span
                                className={`text-xs font-semibold mr-2 ${isActive ? "text-green-700" : "text-gray-400"}`}
                              >
                                {isActive ? "Active" : "None"}
                              </span>
                              <input
                                type="date"
                                value={draft}
                                onChange={(e) =>
                                  setGrandfatherDrafts((prev) => ({ ...prev, [biz._id]: e.target.value }))
                                }
                                className="px-2 py-1 bg-gray-50 border border-gray-200 rounded-lg text-sm text-gray-900"
                              />
                            </td>
                            <td data-label="Actions" data-stack="true" className="p-4">
                              <div className="flex gap-2">
                                <button
                                  onClick={() => saveGrandfatherExemption(biz._id, draft)}
                                  className="px-3 py-1.5 bg-green-500 text-gray-900 rounded-lg hover:bg-green-600 text-sm font-medium transition"
                                >
                                  Save
                                </button>
                                <button
                                  onClick={() => {
                                    setGrandfatherDrafts((prev) => ({ ...prev, [biz._id]: "" }));
                                    saveGrandfatherExemption(biz._id, "");
                                  }}
                                  className="px-3 py-1.5 bg-red-500/15 text-red-600 border border-red-500/30 rounded-lg hover:bg-red-500/25 text-sm font-medium transition"
                                >
                                  Clear
                                </button>
                              </div>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}

          {activeTab === "tax-ledger" && (
            <div className="bg-white border border-gray-200 shadow-sm rounded-2xl overflow-hidden">
              <div className="p-6 border-b border-gray-200 flex flex-col gap-4">
                <div>
                  <h2 className="text-xl font-bold text-gray-900">Tax Ledger</h2>
                  <p className="text-sm text-gray-500 mt-1">
                    VAT accrued on every paid order, ready to file. Mark entries remitted as you actually pay them —
                    no automated remittance yet, this is purely a place to track what's owed vs. already filed.
                  </p>
                </div>
                <div className="flex flex-wrap items-center gap-4">
                  <div className="flex flex-wrap gap-2">
                    {[
                      { id: "accrued", label: "Accrued" },
                      { id: "remitted", label: "Remitted" },
                      { id: "all", label: "All" },
                    ].map((f) => (
                      <button
                        key={f.id}
                        onClick={() => setTaxStatusFilter(f.id)}
                        className={`px-3 py-1.5 rounded-full text-sm font-medium border transition ${
                          taxStatusFilter === f.id
                            ? "bg-green-500/15 text-green-700 border-green-500/30"
                            : "bg-gray-50 text-gray-500 border-gray-200 hover:bg-gray-100"
                        }`}
                      >
                        {f.label}
                      </button>
                    ))}
                  </div>
                  <div className="flex gap-4 text-sm text-gray-600 ml-auto">
                    <span>
                      Accrued: <strong className="text-gray-900">₦{taxTotals.accrued.total.toLocaleString()}</strong>{" "}
                      ({taxTotals.accrued.count})
                    </span>
                    <span>
                      Remitted: <strong className="text-gray-900">₦{taxTotals.remitted.total.toLocaleString()}</strong>{" "}
                      ({taxTotals.remitted.count})
                    </span>
                  </div>
                </div>
              </div>
              {taxLoading ? (
                <div className="p-10 text-center text-gray-500 text-sm">Loading…</div>
              ) : taxEntries.length === 0 ? (
                <EmptyState icon={FileText} title="No tax entries" message="VAT from paid orders will show up here." />
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full sm:min-w-[820px] admin-table">
                    <thead className="bg-gray-50">
                      <tr>
                        <th className="text-left p-4 font-semibold text-gray-500 text-xs uppercase tracking-wide">Order Ref</th>
                        <th className="text-left p-4 font-semibold text-gray-500 text-xs uppercase tracking-wide">Order Total</th>
                        <th className="text-left p-4 font-semibold text-gray-500 text-xs uppercase tracking-wide">VAT</th>
                        <th className="text-left p-4 font-semibold text-gray-500 text-xs uppercase tracking-wide">Status</th>
                        <th className="text-left p-4 font-semibold text-gray-500 text-xs uppercase tracking-wide">Date</th>
                        <th className="text-left p-4 font-semibold text-gray-500 text-xs uppercase tracking-wide">Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {taxEntries.map((entry) => (
                        <tr key={entry._id} className="border-b border-gray-100 hover:bg-gray-50 transition-colors">
                          <td data-label="Order Ref" className="p-4 font-medium text-gray-900">{entry.orderReference}</td>
                          <td data-label="Order Total" className="p-4 text-gray-500">₦{Number(entry.orderTotal).toLocaleString()}</td>
                          <td data-label="VAT" className="p-4 text-gray-500">₦{Number(entry.taxAmount).toLocaleString()}</td>
                          <td data-label="Status" data-stack="true" className="p-4">
                            <span
                              className={`px-2.5 py-1 rounded-full text-xs font-semibold border capitalize ${
                                entry.taxStatus === "remitted"
                                  ? "bg-green-500/15 text-green-700 border-green-500/30"
                                  : "bg-yellow-500/15 text-amber-700 border-yellow-500/30"
                              }`}
                            >
                              {entry.taxStatus}
                            </span>
                            {entry.taxStatus === "remitted" && entry.remittanceNote && (
                              <p className="text-xs text-gray-400 mt-1 max-w-[200px]">{entry.remittanceNote}</p>
                            )}
                          </td>
                          <td data-label="Date" className="p-4 text-gray-500 text-sm">
                            {new Date(entry.createdAt).toLocaleDateString("en-NG", { day: "numeric", month: "short", year: "numeric" })}
                          </td>
                          <td data-label="Actions" data-stack="true" className="p-4">
                            {entry.taxStatus === "accrued" && (
                              <div className="flex items-center gap-2">
                                <input
                                  type="text"
                                  placeholder="Filing note (optional)"
                                  value={remittanceNoteDrafts[entry._id] || ""}
                                  onChange={(e) =>
                                    setRemittanceNoteDrafts((prev) => ({ ...prev, [entry._id]: e.target.value }))
                                  }
                                  className="px-2 py-1.5 rounded-lg border border-gray-200 text-xs w-36 focus:outline-none focus:ring-2 focus:ring-green-500/30"
                                />
                                <button
                                  onClick={() => markTaxRemitted(entry._id)}
                                  disabled={remittingId === entry._id}
                                  className="px-3 py-1.5 rounded-lg text-xs font-semibold bg-green-600 text-white hover:bg-green-700 transition disabled:opacity-50"
                                >
                                  {remittingId === entry._id ? "Saving…" : "Mark remitted"}
                                </button>
                              </div>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}
        </div>
      </div>


      {/* Toast — replaces alert() for non-blocking confirmations/errors */}
      {toast && (
        <div
          className={`fixed bottom-6 right-6 z-[60] flex items-center gap-3 px-4 py-3 rounded-xl border backdrop-blur-xl shadow-lg ${
            toast.type === "error"
              ? "bg-red-50 border-red-200 text-red-700"
              : "bg-green-50 border-green-200 text-green-700"
          }`}
        >
          {toast.type === "error" ? <XCircle size={18} /> : <CheckCircle size={18} />}
          <span className="text-sm font-medium">{toast.message}</span>
        </div>
      )}
    </div>
  );
};

export default AdminDashboard;