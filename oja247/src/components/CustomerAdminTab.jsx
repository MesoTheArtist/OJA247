import React, { useEffect, useMemo, useState } from "react";
import { Users, Search, BadgeCheck, Ban, Eye, Trash2 } from "lucide-react";
import axiosInstance from "../services/api";
import CustomerDetailModal from "./CustomerDetailModal";
import { useDialog } from "./DialogProvider";

const SearchField = ({ value, onChange }) => (
  <div className="relative w-full sm:w-72">
    <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
    <input
      type="text"
      value={value}
      onChange={(e) => onChange(e.target.value)}
      placeholder="Search by name, email, or phone"
      className="w-full pl-9 pr-3 py-2 text-sm border border-gray-200 rounded-xl focus:ring-2 focus:ring-green-500 focus:border-transparent"
    />
  </div>
);

// Admin's Customers tab — separate from the generic Users list, with the
// counters (orders, spend, follows, reviews, disputes) an admin actually
// needs, plus a drill-in for full detail and account-level actions.
const CustomerAdminTab = ({ showToast }) => {
  const { confirm } = useDialog();
  const [customers, setCustomers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [search, setSearch] = useState("");
  const [sortBy, setSortBy] = useState("joined"); // joined | spent | orders
  const [selectedId, setSelectedId] = useState(null);
  const [banningId, setBanningId] = useState(null);

  const fetchCustomers = async () => {
    setLoading(true);
    setError("");
    try {
      const res = await axiosInstance.get("/api/admin/customers");
      setCustomers(res.data.customers || []);
    } catch (err) {
      console.error("Error fetching customers:", err);
      setError("Couldn't load customers. Please refresh and try again.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchCustomers();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    let list = customers;
    if (q) {
      list = list.filter(
        (c) =>
          c.email?.toLowerCase().includes(q) ||
          c.fullName?.toLowerCase().includes(q) ||
          c.phone?.toLowerCase().includes(q)
      );
    }
    const sorted = [...list];
    if (sortBy === "spent") sorted.sort((a, b) => b.totalSpent - a.totalSpent);
    else if (sortBy === "orders") sorted.sort((a, b) => b.orderCount - a.orderCount);
    else sorted.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
    return sorted;
  }, [customers, search, sortBy]);

  const deleteCustomer = async (customer) => {
    const ok = window.prompt(
      `This permanently deletes ${customer.email}'s account. Their orders stay (just unlinked) but this cannot be undone.\n\nType the email to confirm:`
    );
    if ((ok || "").trim().toLowerCase() !== (customer.email || "").trim().toLowerCase()) {
      if (ok !== null) showToast?.("Email didn't match — nothing was deleted", "error");
      return;
    }
    try {
      await axiosInstance.delete(`/api/admin/customers/${customer._id}`);
      setCustomers((prev) => prev.filter((c) => c._id !== customer._id));
      showToast?.("Customer account deleted");
    } catch (error) {
      console.error("Error deleting customer:", error);
      showToast?.(error.response?.data?.message || "Failed to delete customer", "error");
    }
  };

  const toggleBan = async (customer) => {
    const banning = !customer.banned;
    const ok = await confirm({
      title: banning ? "Ban customer?" : "Unban customer?",
      message: `${banning ? "Ban" : "Unban"} customer "${customer.email}"?`,
      confirmLabel: banning ? "Ban" : "Unban",
      tone: banning ? "danger" : "default",
    });
    if (!ok) return;
    setBanningId(customer._id);
    try {
      await axiosInstance.patch(`/api/admin/users/${customer._id}/ban`, { banned: !customer.banned });
      setCustomers((prev) => prev.map((c) => (c._id === customer._id ? { ...c, banned: !customer.banned } : c)));
      showToast?.(`Customer ${customer.banned ? "unbanned" : "banned"}`);
    } catch (error) {
      console.error("Error toggling customer ban:", error);
      showToast?.("Failed to update customer status", "error");
    } finally {
      setBanningId(null);
    }
  };

  return (
    <div className="bg-white border border-gray-200 shadow-sm rounded-2xl overflow-hidden">
      <div className="p-6 border-b border-gray-200 flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
        <h2 className="text-xl font-bold text-gray-900">
          Customers <span className="text-gray-500 font-normal">({filtered.length})</span>
        </h2>
        <div className="flex flex-col sm:flex-row gap-3">
          <SearchField value={search} onChange={setSearch} />
          <select
            value={sortBy}
            onChange={(e) => setSortBy(e.target.value)}
            className="px-3 py-2 text-sm border border-gray-200 rounded-xl focus:ring-2 focus:ring-green-500 focus:border-transparent"
          >
            <option value="joined">Newest first</option>
            <option value="spent">Highest spend</option>
            <option value="orders">Most orders</option>
          </select>
        </div>
      </div>

      {loading ? (
        <div className="flex justify-center py-16">
          <div className="w-6 h-6 border-2 border-green-500 border-t-transparent rounded-full animate-spin" />
        </div>
      ) : error ? (
        <div className="p-6 text-sm text-red-600">{error}</div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-16">
          <Users className="mx-auto text-gray-300 mb-3" size={40} />
          <h3 className="text-lg font-medium text-gray-900">{search ? "No matching customers" : "No customers yet"}</h3>
          <p className="mt-1 text-sm text-gray-500">
            {search ? `Nothing matches "${search}".` : "Customer accounts will appear here as people sign up."}
          </p>
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full sm:min-w-[900px] admin-table">
            <thead className="bg-gray-50">
              <tr>
                <th className="text-left p-4 font-semibold text-gray-500 text-xs uppercase tracking-wide">Customer</th>
                <th className="text-left p-4 font-semibold text-gray-500 text-xs uppercase tracking-wide">Verified</th>
                <th className="text-left p-4 font-semibold text-gray-500 text-xs uppercase tracking-wide">Orders</th>
                <th className="text-left p-4 font-semibold text-gray-500 text-xs uppercase tracking-wide">Spent</th>
                <th className="text-left p-4 font-semibold text-gray-500 text-xs uppercase tracking-wide">Following</th>
                <th className="text-left p-4 font-semibold text-gray-500 text-xs uppercase tracking-wide">Disputes</th>
                <th className="text-left p-4 font-semibold text-gray-500 text-xs uppercase tracking-wide">Joined</th>
                <th className="text-left p-4 font-semibold text-gray-500 text-xs uppercase tracking-wide">Actions</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((c) => (
                <tr key={c._id} className="border-b border-gray-100 hover:bg-gray-50 transition-colors">
                  <td data-label="Customer" data-stack="true" className="p-4">
                    <p className="font-medium text-gray-900">{c.fullName || "No name"}</p>
                    <p className="text-sm text-gray-500">{c.email}</p>
                    {c.phone && <p className="text-xs text-gray-400">{c.phone}</p>}
                  </td>
                  <td data-label="Verified" className="p-4">
                    <span
                      className={`flex items-center gap-1 w-fit ml-auto sm:ml-0 px-2 py-0.5 rounded-full text-xs font-semibold border ${
                        c.emailVerified
                          ? "bg-green-500/15 text-green-700 border-green-500/30"
                          : "bg-yellow-500/15 text-amber-700 border-yellow-500/30"
                      }`}
                    >
                      <BadgeCheck size={12} /> {c.emailVerified ? "Yes" : "No"}
                    </span>
                  </td>
                  <td data-label="Orders" className="p-4 text-sm text-gray-700">{c.orderCount}</td>
                  <td data-label="Spent" className="p-4 text-sm font-semibold text-gray-900">
                    ₦{Number(c.totalSpent).toLocaleString()}
                  </td>
                  <td data-label="Following" className="p-4 text-sm text-gray-700">{c.followingCount}</td>
                  <td data-label="Disputes" className="p-4 text-sm text-gray-700">
                    {c.disputeCount > 0 ? (
                      <span className="text-orange-600 font-semibold">{c.disputeCount}</span>
                    ) : (
                      c.disputeCount
                    )}
                  </td>
                  <td data-label="Joined" className="p-4 text-sm text-gray-500">
                    {new Date(c.createdAt).toLocaleDateString()}
                  </td>
                  <td data-label="Actions" data-stack="true" className="p-4">
                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => setSelectedId(c._id)}
                        className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-sm font-medium bg-gray-100 text-gray-700 hover:bg-gray-200 transition"
                      >
                        <Eye size={14} /> View
                      </button>
                      <button
                        onClick={() => toggleBan(c)}
                        disabled={banningId === c._id}
                        className={`flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-sm font-medium transition disabled:opacity-50 ${
                          c.banned
                            ? "bg-green-500/15 text-green-700 border border-green-500/30 hover:bg-green-500/25"
                            : "bg-red-500/15 text-red-600 border border-red-500/30 hover:bg-red-500/25"
                        }`}
                      >
                        <Ban size={14} /> {c.banned ? "Unban" : "Ban"}
                      </button>
                      <button
                        onClick={() => deleteCustomer(c)}
                        className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-sm font-medium bg-gray-100 text-gray-500 hover:bg-red-50 hover:text-red-600 transition"
                      >
                        <Trash2 size={14} />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {selectedId && (
        <CustomerDetailModal customerId={selectedId} onClose={() => setSelectedId(null)} onChanged={fetchCustomers} />
      )}
    </div>
  );
};

export default CustomerAdminTab;