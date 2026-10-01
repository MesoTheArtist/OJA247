import React, { useEffect, useState } from "react";
import { X, ShoppingBag, LifeBuoy, Star, Heart, BadgeCheck, Ban, CheckCircle2, Pencil, Check, Trash2 } from "lucide-react";
import axiosInstance from "../services/api";

const SectionTitle = ({ icon, label, count }) => {
  const Icon = icon;
  return (
    <div className="flex items-center gap-2 text-sm font-semibold text-gray-800 mb-2">
      <Icon size={15} className="text-gray-400" /> {label} <span className="text-gray-400 font-normal">({count})</span>
    </div>
  );
};

// Full drill-in for one customer — orders, disputes, reviews, follows —
// plus the two admin levers that aren't available anywhere else: ban/unban
// (reuses the same endpoint the Users tab uses) and manually marking the
// email verified (a support tool for when the confirmation email fails to
// deliver, or ownership was proven some other way).
const CustomerDetailModal = ({ customerId, onClose, onChanged }) => {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState({ fullName: "", phone: "" });

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      setLoading(true);
      setError("");
      try {
        const res = await axiosInstance.get(`/api/admin/customers/${customerId}`);
        if (!cancelled) setData(res.data);
      } catch (err) {
        console.error("Error fetching customer detail:", err);
        if (!cancelled) setError("Couldn't load this customer. Please try again.");
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    load();
    return () => {
      cancelled = true;
    };
  }, [customerId]);

  useEffect(() => {
    const onKey = (e) => e.key === "Escape" && onClose();
    document.addEventListener("keydown", onKey);
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = prevOverflow;
    };
  }, [onClose]);

  const toggleBan = async () => {
    if (!data) return;
    const { customer } = data;
    if (!window.confirm(`${customer.banned ? "Unban" : "Ban"} customer "${customer.email}"?`)) return;
    setBusy(true);
    try {
      await axiosInstance.patch(`/api/admin/users/${customer._id}/ban`, { banned: !customer.banned });
      setData((prev) => ({ ...prev, customer: { ...prev.customer, banned: !customer.banned } }));
      onChanged?.();
    } catch (err) {
      alert(err.response?.data?.message || "Couldn't update this customer's status.");
    } finally {
      setBusy(false);
    }
  };

  const startEdit = () => {
    setDraft({ fullName: data.customer.fullName || "", phone: data.customer.phone || "" });
    setEditing(true);
  };

  const saveEdit = async () => {
    setBusy(true);
    try {
      const res = await axiosInstance.patch(`/api/admin/customers/${data.customer._id}`, draft);
      setData((prev) => ({ ...prev, customer: { ...prev.customer, ...res.data.customer } }));
      setEditing(false);
      onChanged?.();
    } catch (err) {
      alert(err.response?.data?.message || "Couldn't save those changes.");
    } finally {
      setBusy(false);
    }
  };

  const deleteAccount = async () => {
    if (!data) return;
    const { customer } = data;
    const ok = window.prompt(
      `This permanently deletes ${customer.email}'s account. Their orders stay (just unlinked, so the vendor's records are untouched) but this cannot be undone.\n\nType the email to confirm:`
    );
    if ((ok || "").trim().toLowerCase() !== (customer.email || "").trim().toLowerCase()) {
      if (ok !== null) alert("Email didn't match — nothing was deleted.");
      return;
    }
    setBusy(true);
    try {
      await axiosInstance.delete(`/api/admin/customers/${customer._id}`);
      onChanged?.();
      onClose();
    } catch (err) {
      alert(err.response?.data?.message || "Couldn't delete this account.");
      setBusy(false);
    }
  };

  const verifyEmail = async () => {
    if (!data) return;
    if (!window.confirm(`Manually mark ${data.customer.email} as verified? Only do this if you've confirmed ownership some other way.`))
      return;
    setBusy(true);
    try {
      const res = await axiosInstance.patch(`/api/admin/customers/${data.customer._id}/verify-email`);
      setData((prev) => ({ ...prev, customer: { ...prev.customer, emailVerified: true } }));
      onChanged?.();
      if (res.data.linkedOrders > 0) {
        alert(`Email verified. ${res.data.linkedOrders} past order(s) were linked to this account.`);
      }
    } catch (err) {
      alert(err.response?.data?.message || "Couldn't verify this email.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/50 p-0 sm:p-4" onClick={onClose}>
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Customer details"
        className="bg-white w-full sm:max-w-2xl max-h-[92vh] overflow-y-auto rounded-t-3xl sm:rounded-3xl p-6 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between mb-5">
          <h2 className="text-xl font-black text-gray-900">Customer</h2>
          <button onClick={onClose} aria-label="Close" className="p-1.5 rounded-lg text-gray-400 hover:text-gray-700 hover:bg-gray-100">
            <X size={20} />
          </button>
        </div>

        {loading && (
          <div className="flex justify-center py-12">
            <div className="w-6 h-6 border-2 border-green-500 border-t-transparent rounded-full animate-spin" />
          </div>
        )}

        {error && <div className="p-3 bg-red-50 border border-red-200 rounded-xl text-red-600 text-sm">{error}</div>}

        {data && (
          <>
            <div className="bg-gray-50 rounded-2xl p-5 mb-6">
              <div className="flex items-start justify-between flex-wrap gap-3">
                <div className="flex-1 min-w-0">
                  {editing ? (
                    <div className="space-y-2 mb-2 max-w-xs">
                      <input
                        type="text"
                        value={draft.fullName}
                        onChange={(e) => setDraft((d) => ({ ...d, fullName: e.target.value }))}
                        placeholder="Full name"
                        className="w-full px-3 py-1.5 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-transparent"
                      />
                      <input
                        type="text"
                        value={draft.phone}
                        onChange={(e) => setDraft((d) => ({ ...d, phone: e.target.value }))}
                        placeholder="Phone"
                        className="w-full px-3 py-1.5 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-transparent"
                      />
                      <div className="flex gap-2">
                        <button
                          onClick={saveEdit}
                          disabled={busy}
                          className="flex items-center gap-1 px-3 py-1.5 text-xs font-semibold bg-green-600 hover:bg-green-700 disabled:opacity-50 text-white rounded-lg transition"
                        >
                          <Check size={13} /> Save
                        </button>
                        <button
                          onClick={() => setEditing(false)}
                          className="px-3 py-1.5 text-xs font-semibold text-gray-600 hover:bg-gray-100 rounded-lg transition"
                        >
                          Cancel
                        </button>
                      </div>
                    </div>
                  ) : (
                    <div className="flex items-center gap-2">
                      <p className="font-bold text-gray-900">{data.customer.fullName || "No name on file"}</p>
                      <button
                        onClick={startEdit}
                        aria-label="Edit name and phone"
                        className="text-gray-400 hover:text-gray-600"
                      >
                        <Pencil size={13} />
                      </button>
                    </div>
                  )}
                  <p className="text-sm text-gray-600">{data.customer.email}</p>
                  {!editing && data.customer.phone && <p className="text-sm text-gray-500">{data.customer.phone}</p>}
                  <div className="flex items-center gap-2 mt-2 flex-wrap">
                    <span
                      className={`flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold border ${
                        data.customer.emailVerified
                          ? "bg-green-500/15 text-green-700 border-green-500/30"
                          : "bg-yellow-500/15 text-amber-700 border-yellow-500/30"
                      }`}
                    >
                      <BadgeCheck size={12} /> {data.customer.emailVerified ? "Email verified" : "Email unverified"}
                    </span>
                    <span
                      className={`flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold border ${
                        data.customer.banned
                          ? "bg-red-500/15 text-red-600 border-red-500/30"
                          : "bg-blue-500/15 text-blue-700 border-blue-500/30"
                      }`}
                    >
                      {data.customer.banned ? "Banned" : "Active"}
                    </span>
                  </div>
                </div>
                <div className="text-right text-sm text-gray-500">
                  Joined {new Date(data.customer.createdAt).toLocaleDateString()}
                </div>
              </div>

              <div className="flex gap-2 mt-4 flex-wrap">
                {!data.customer.emailVerified && (
                  <button
                    onClick={verifyEmail}
                    disabled={busy}
                    className="flex items-center gap-1.5 px-3.5 py-2 text-sm font-semibold bg-white border border-gray-200 rounded-xl hover:bg-gray-100 disabled:opacity-50 transition"
                  >
                    <CheckCircle2 size={14} /> Mark email verified
                  </button>
                )}
                <button
                  onClick={toggleBan}
                  disabled={busy}
                  className={`flex items-center gap-1.5 px-3.5 py-2 text-sm font-semibold rounded-xl border disabled:opacity-50 transition ${
                    data.customer.banned
                      ? "bg-green-500/15 text-green-700 border-green-500/30 hover:bg-green-500/25"
                      : "bg-red-500/15 text-red-600 border-red-500/30 hover:bg-red-500/25"
                  }`}
                >
                  <Ban size={14} /> {data.customer.banned ? "Unban" : "Ban"} customer
                </button>
                <button
                  onClick={deleteAccount}
                  disabled={busy}
                  className="flex items-center gap-1.5 px-3.5 py-2 text-sm font-semibold rounded-xl border bg-gray-50 text-gray-500 border-gray-200 hover:bg-red-50 hover:text-red-600 hover:border-red-200 disabled:opacity-50 transition"
                >
                  <Trash2 size={14} /> Delete account
                </button>
              </div>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-5 gap-3 mb-6">
              {[
                { label: "Orders", value: data.stats.orderCount },
                { label: "Spent", value: `₦${Number(data.stats.totalSpent).toLocaleString()}` },
                { label: "Following", value: data.stats.followingCount },
                { label: "Reviews", value: data.stats.reviewCount },
                { label: "Disputes", value: data.stats.disputeCount },
              ].map((s) => (
                <div key={s.label} className="bg-white border border-gray-100 rounded-xl p-3 text-center">
                  <p className="text-lg font-black text-gray-900">{s.value}</p>
                  <p className="text-xs text-gray-500">{s.label}</p>
                </div>
              ))}
            </div>

            <div className="space-y-6">
              <div>
                <SectionTitle icon={ShoppingBag} label="Orders" count={data.orders.length} />
                {data.orders.length === 0 ? (
                  <p className="text-sm text-gray-400">No orders yet.</p>
                ) : (
                  <div className="space-y-1.5">
                    {data.orders.slice(0, 10).map((o) => (
                      <div key={o._id} className="flex items-center justify-between text-sm bg-gray-50 rounded-lg px-3 py-2">
                        <span className="text-gray-700">{o.reference}</span>
                        <span className="text-gray-500 capitalize">{o.status}</span>
                        <span className="font-semibold text-gray-900">₦{Number(o.total || 0).toLocaleString()}</span>
                      </div>
                    ))}
                    {data.orders.length > 10 && (
                      <p className="text-xs text-gray-400 pt-1">+ {data.orders.length - 10} more</p>
                    )}
                  </div>
                )}
              </div>

              <div>
                <SectionTitle icon={LifeBuoy} label="Disputes" count={data.disputes.length} />
                {data.disputes.length === 0 ? (
                  <p className="text-sm text-gray-400">No disputes filed.</p>
                ) : (
                  <div className="space-y-1.5">
                    {data.disputes.map((d) => (
                      <div key={d._id} className="flex items-center justify-between text-sm bg-gray-50 rounded-lg px-3 py-2">
                        <span className="text-gray-700">{d.businessName || d.businessId}</span>
                        <span className="text-gray-500 capitalize">{d.status}</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              <div>
                <SectionTitle icon={Star} label="Reviews" count={data.reviews.length} />
                {data.reviews.length === 0 ? (
                  <p className="text-sm text-gray-400">No reviews written.</p>
                ) : (
                  <div className="space-y-1.5">
                    {data.reviews.map((r) => (
                      <div key={r._id} className="flex items-center justify-between text-sm bg-gray-50 rounded-lg px-3 py-2">
                        <span className="text-gray-700">{r.businessName || r.businessId}</span>
                        <span className="text-gray-500">{r.rating}★</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              <div>
                <SectionTitle icon={Heart} label="Following" count={data.follows.length} />
                {data.follows.length === 0 ? (
                  <p className="text-sm text-gray-400">Not following any vendors.</p>
                ) : (
                  <div className="flex flex-wrap gap-2">
                    {data.follows.map((f) => (
                      <span key={f._id} className="text-sm bg-gray-50 rounded-lg px-3 py-1.5 text-gray-700">
                        {f.businessId?.name || "Vendor"}
                      </span>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
};

export default CustomerDetailModal;