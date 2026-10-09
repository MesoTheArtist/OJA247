import React, { useCallback, useEffect, useRef, useState } from "react";
import { RefreshCw, Clock, AlertTriangle, Store, Ban } from "lucide-react";
import axiosInstance from "../services/api";

const naira = (n) => `₦${Number(n || 0).toLocaleString("en-NG")}`;

const timeAgo = (iso) => {
  if (!iso) return "never";
  const hours = Math.floor((Date.now() - new Date(iso).getTime()) / (60 * 60 * 1000));
  if (hours < 1) return "under an hour ago";
  if (hours < 24) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
};

const Tile = ({ icon: Icon, label, value, tone = "gray" }) => {
  const tones = {
    gray: "bg-white border-gray-200 text-gray-900",
    red: "bg-red-50 border-red-200 text-red-800",
    amber: "bg-amber-50 border-amber-200 text-amber-800",
  };
  return (
    <div className={`rounded-xl border p-4 ${tones[tone]}`}>
      <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide opacity-70">
        <Icon size={14} /> {label}
      </div>
      <div className="mt-1 text-2xl font-black">{value}</div>
    </div>
  );
};

const Badge = ({ children, tone }) => {
  const tones = {
    red: "bg-red-100 text-red-700",
    amber: "bg-amber-100 text-amber-800",
    gray: "bg-gray-100 text-gray-700",
  };
  return <span className={`inline-block rounded-full px-2 py-0.5 text-[11px] font-semibold ${tones[tone]}`}>{children}</span>;
};

// Admin tab: bank-transfer orders still waiting for the vendor to confirm or
// reject the payment, oldest first, and which vendors are slow to answer.
const WaitingOrdersTab = ({ showToast }) => {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);

  // The dashboard builds a new showToast on every render, so keep the latest
  // one in a ref. Depending on it directly would reload (and, on an error,
  // re-toast and reload again) in a loop.
  const showToastRef = useRef(showToast);
  showToastRef.current = showToast;

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await axiosInstance.get("/api/admin/waiting-orders");
      setData(res.data);
    } catch (error) {
      showToastRef.current?.("Couldn't load waiting orders.", "error");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const summary = data?.summary;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-bold text-gray-900">Waiting orders</h2>
          <p className="text-sm text-gray-500">
            Bank-transfer orders the vendor hasn't confirmed or rejected yet, oldest first.
          </p>
        </div>
        <button
          onClick={load}
          disabled={loading}
          className="inline-flex items-center gap-2 rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-60"
        >
          <RefreshCw size={15} className={loading ? "animate-spin" : ""} /> Refresh
        </button>
      </div>

      {summary && (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          <Tile icon={Clock} label="Waiting now" value={summary.waitingCount} />
          <Tile icon={AlertTriangle} label="Over 3 days" value={summary.over3Days} tone={summary.over3Days ? "red" : "gray"} />
          <Tile icon={Store} label="Vendors involved" value={summary.vendorsInvolved} />
          <Tile icon={Ban} label="Banned vendors' orders" value={summary.bannedVendorOrders} tone={summary.bannedVendorOrders ? "amber" : "gray"} />
        </div>
      )}

      {loading && !data && <p className="text-sm text-gray-500">Loading…</p>}

      {data && data.orders.length === 0 && (
        <div className="rounded-xl border border-gray-200 bg-white p-10 text-center text-gray-500">
          Nothing is waiting. Every transfer order has been answered.
        </div>
      )}

      {data && data.vendors.length > 0 && (
        <div className="rounded-xl border border-gray-200 bg-white overflow-hidden">
          <div className="px-4 py-3 border-b border-gray-100 font-semibold text-gray-900">Vendors with waiting orders</div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 text-left text-xs uppercase tracking-wide text-gray-500">
                <tr>
                  <th className="px-4 py-2">Store</th>
                  <th className="px-4 py-2">Waiting</th>
                  <th className="px-4 py-2">Over 3 days</th>
                  <th className="px-4 py-2">Oldest</th>
                  <th className="px-4 py-2">Usually answers in</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {data.vendors.map((v) => (
                  <tr key={v.businessId}>
                    <td className="px-4 py-2 font-medium text-gray-900">
                      {v.businessName} {v.vendorBanned && <Badge tone="amber">Banned</Badge>}
                    </td>
                    <td className="px-4 py-2">{v.waiting}</td>
                    <td className="px-4 py-2">{v.over3Days ? <Badge tone="red">{v.over3Days}</Badge> : "0"}</td>
                    <td className="px-4 py-2">{v.oldestDays}d</td>
                    <td className="px-4 py-2 text-gray-600">
                      {v.avgConfirmHours === null
                        ? "no history yet"
                        : `${v.avgConfirmHours}h (${v.confirmedLast90Days} confirmed, last 90 days)`}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {data && data.orders.length > 0 && (
        <div className="rounded-xl border border-gray-200 bg-white overflow-hidden">
          <div className="px-4 py-3 border-b border-gray-100 font-semibold text-gray-900">Orders</div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 text-left text-xs uppercase tracking-wide text-gray-500">
                <tr>
                  <th className="px-4 py-2">Order</th>
                  <th className="px-4 py-2">Store</th>
                  <th className="px-4 py-2">Customer</th>
                  <th className="px-4 py-2">Amount</th>
                  <th className="px-4 py-2">Waiting</th>
                  <th className="px-4 py-2">Last reminder</th>
                  <th className="px-4 py-2">Flags</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {data.orders.map((o) => (
                  <tr key={o._id} className={o.daysWaiting >= 3 ? "bg-red-50/40" : ""}>
                    <td className="px-4 py-2 font-mono text-xs">{o.reference}</td>
                    <td className="px-4 py-2 font-medium text-gray-900">{o.businessName}</td>
                    <td className="px-4 py-2">
                      <div>{o.customerName || "—"}</div>
                      <div className="text-xs text-gray-500">{o.customerEmail}</div>
                    </td>
                    <td className="px-4 py-2">{naira(o.total)}</td>
                    <td className="px-4 py-2">
                      <Badge tone={o.daysWaiting >= 3 ? "red" : "gray"}>{o.daysWaiting}d</Badge>
                    </td>
                    <td className="px-4 py-2 text-gray-600">{timeAgo(o.lastRemindedAt)}</td>
                    <td className="px-4 py-2 space-x-1">
                      {o.vendorBanned && <Badge tone="amber">Vendor banned</Badge>}
                      {o.disputeOpen && <Badge tone="red">Dispute open</Badge>}
                      {o.adminAlerted && <Badge tone="gray">Admin alerted</Badge>}
                      {o.duplicateReceipt && <Badge tone="amber">Receipt reused</Badge>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
};

export default WaitingOrdersTab;