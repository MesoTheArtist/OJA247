import React, { useEffect, useState } from "react";
import { LifeBuoy, Clock, CheckCircle2, AlertTriangle } from "lucide-react";
import axiosInstance from "../services/api";
import { useDialog } from "./DialogProvider";

const REASON_LABELS = {
  item_not_received: "Never received it",
  wrong_item: "Wrong item",
  damaged: "Arrived damaged",
  not_as_described: "Not as described",
  payment_not_confirmed: "Payment not confirmed",
  other: "Other",
};

const STATUS_STYLES = {
  open: { label: "Awaiting your response", cls: "bg-orange-50 text-orange-700 border-orange-200", icon: Clock },
  escalated: { label: "Escalated to admin", cls: "bg-red-50 text-red-700 border-red-200", icon: AlertTriangle },
  resolved: { label: "Resolved", cls: "bg-green-50 text-green-700 border-green-200", icon: CheckCircle2 },
  unresolved: { label: "Closed — unresolved", cls: "bg-gray-100 text-gray-600 border-gray-200", icon: AlertTriangle },
};

const SELF_RESOLVE_WINDOW_DAYS = 7; // mirrors Dispute.SELF_RESOLVE_WINDOW_DAYS

// Vendor's own disputes, with a resolve action for anything still "open".
// Once a dispute auto-escalates (backend's weekly cron, 7-day timeout) it
// moves to admin — the vendor can still see it here, just can't act on it.
const VendorDisputesTab = ({ businessId }) => {
  const { notify } = useDialog();
  const [disputes, setDisputes] = useState([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState("open");
  const [drafts, setDrafts] = useState({}); // disputeId -> { note, refunded }
  const [resolvingId, setResolvingId] = useState(null);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!businessId) return;
    let cancelled = false;
    const load = async () => {
      setLoading(true);
      setError("");
      try {
        const res = await axiosInstance.get(`/api/disputes/business/${businessId}`);
        if (!cancelled) setDisputes(res.data.disputes || []);
      } catch (err) {
        console.error("Error fetching disputes:", err);
        if (!cancelled) setError("Couldn't load disputes. Please refresh and try again.");
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    load();
    return () => {
      cancelled = true;
    };
  }, [businessId]);

  const setDraft = (id, patch) => setDrafts((prev) => ({ ...prev, [id]: { ...prev[id], ...patch } }));

  const resolve = async (id) => {
    const draft = drafts[id] || {};
    if (!draft.note || !draft.note.trim()) return;
    setResolvingId(id);
    try {
      const res = await axiosInstance.patch(`/api/disputes/${id}/resolve`, {
        note: draft.note.trim(),
        refunded: Boolean(draft.refunded),
      });
      setDisputes((prev) => prev.map((d) => (d._id === id ? res.data.dispute : d)));
      setDrafts((prev) => ({ ...prev, [id]: { note: "", refunded: false } }));
    } catch (err) {
      notify({ title: "Couldn't resolve dispute", message: err.response?.data?.message || "Please try again.", tone: "error" });
    } finally {
      setResolvingId(null);
    }
  };

  const filtered = statusFilter === "all" ? disputes : disputes.filter((d) => d.status === statusFilter);
  const openCount = disputes.filter((d) => d.status === "open").length;

  if (loading) {
    return (
      <div className="flex justify-center py-12">
        <div className="w-6 h-6 border-2 border-green-500 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (error) {
    return <div className="p-4 bg-red-50 border border-red-200 rounded-xl text-red-600 text-sm">{error}</div>;
  }

  return (
    <div>
      <div className="flex items-center gap-2 mb-5 flex-wrap">
        {[
          { id: "open", label: `Awaiting response${openCount ? ` (${openCount})` : ""}` },
          { id: "escalated", label: "Escalated" },
          { id: "resolved", label: "Resolved" },
          { id: "unresolved", label: "Unresolved" },
          { id: "all", label: "All" },
        ].map((f) => (
          <button
            key={f.id}
            onClick={() => setStatusFilter(f.id)}
            className={`px-3.5 py-1.5 rounded-xl text-sm font-semibold border transition ${
              statusFilter === f.id
                ? "bg-green-600 text-white border-green-600"
                : "bg-white text-gray-600 border-gray-200 hover:bg-gray-50"
            }`}
          >
            {f.label}
          </button>
        ))}
      </div>

      {filtered.length === 0 ? (
        <div className="text-center py-16 bg-white rounded-2xl border border-gray-100">
          <LifeBuoy className="mx-auto text-gray-300 mb-3" size={40} />
          <h3 className="text-lg font-medium text-gray-900">Nothing here</h3>
          <p className="mt-1 text-sm text-gray-500">
            {statusFilter === "open" ? "No disputes are waiting on you right now." : "No disputes with this status."}
          </p>
        </div>
      ) : (
        <div className="space-y-4">
          {filtered.map((dispute) => {
            const statusInfo = STATUS_STYLES[dispute.status] || STATUS_STYLES.open;
            const StatusIcon = statusInfo.icon;
            const daysLeft =
              dispute.status === "open"
                ? Math.max(
                    0,
                    SELF_RESOLVE_WINDOW_DAYS -
                      Math.floor((Date.now() - new Date(dispute.createdAt).getTime()) / (24 * 60 * 60 * 1000))
                  )
                : null;

            return (
              <div key={dispute._id} className="bg-white border border-gray-100 rounded-2xl p-4 sm:p-5">
                <div className="flex items-start justify-between gap-4 flex-wrap">
                  <div className="min-w-0">
                    <p className="font-semibold text-gray-900 text-sm break-words">
                      Order {dispute.orderReference} · {REASON_LABELS[dispute.reason] || dispute.reason}
                    </p>
                    <p className="text-xs text-gray-400 mt-0.5">
                      Filed {new Date(dispute.createdAt).toLocaleDateString("en-NG", {
                        day: "numeric",
                        month: "short",
                        year: "numeric",
                      })}{" "}
                      by {dispute.customer?.fullName || "a customer"}
                    </p>
                  </div>
                  <span
                    className={`flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold border ${statusInfo.cls}`}
                  >
                    <StatusIcon size={13} /> {statusInfo.label}
                  </span>
                </div>

                <p className="text-sm text-gray-700 mt-3 break-words">{dispute.description}</p>

                {dispute.itemIds?.length > 0 && (
                  <p className="text-xs text-gray-500 mt-2">{dispute.itemIds.length} item(s) named in this dispute</p>
                )}

                {dispute.evidence?.length > 0 && (
                  <div className="flex gap-2 mt-3 flex-wrap">
                    {dispute.evidence.map((ev) => (
                      <a key={ev.url} href={ev.url} target="_blank" rel="noopener noreferrer">
                        <img
                          src={ev.url}
                          alt="Dispute evidence"
                          className="w-16 h-16 object-cover rounded-lg border border-gray-200"
                        />
                      </a>
                    ))}
                  </div>
                )}

                <div className="mt-3 text-xs text-gray-500 flex items-center gap-x-3 gap-y-1 flex-wrap">
                  <span className="break-all">{dispute.customer?.email}</span>
                  <span>{dispute.customer?.phone}</span>
                </div>

                {dispute.status === "open" && (
                  <div className="mt-4 pt-4 border-t border-gray-100">
                    {daysLeft !== null && (
                      <p className="text-xs text-orange-600 font-medium mb-2">
                        {daysLeft > 0
                          ? `${daysLeft} day${daysLeft === 1 ? "" : "s"} left to resolve before this escalates to admin`
                          : "This is due to auto-escalate to admin soon"}
                      </p>
                    )}
                    <textarea
                      value={drafts[dispute._id]?.note || ""}
                      onChange={(e) => setDraft(dispute._id, { note: e.target.value })}
                      rows={2}
                      maxLength={2000}
                      placeholder="How was this sorted out with the customer?"
                      className="w-full px-3 py-2 text-sm border border-gray-200 rounded-xl focus:ring-2 focus:ring-green-500 focus:border-transparent resize-none"
                    />
                    <div className="flex items-center justify-between mt-2 flex-wrap gap-2">
                      <label className="flex items-center gap-2 text-sm text-gray-600">
                        <input
                          type="checkbox"
                          checked={Boolean(drafts[dispute._id]?.refunded)}
                          onChange={(e) => setDraft(dispute._id, { refunded: e.target.checked })}
                          className="accent-green-600"
                        />
                        I refunded the customer
                      </label>
                      <button
                        onClick={() => resolve(dispute._id)}
                        disabled={resolvingId === dispute._id || !(drafts[dispute._id]?.note || "").trim()}
                        className="px-4 py-2 text-sm font-semibold bg-green-600 hover:bg-green-700 disabled:opacity-50 text-white rounded-xl transition"
                      >
                        {resolvingId === dispute._id ? "Saving…" : "Mark resolved"}
                      </button>
                    </div>
                  </div>
                )}

                {dispute.vendorResponse?.note && (
                  <div className="mt-4 ml-2 sm:ml-4 pl-3 sm:pl-4 border-l-2 border-green-100">
                    <p className="text-xs font-semibold text-green-700 mb-1">Your response</p>
                    <p className="text-sm text-gray-600 break-words">{dispute.vendorResponse.note}</p>
                  </div>
                )}

                {dispute.adminResolution?.note && (
                  <div className="mt-4 ml-2 sm:ml-4 pl-3 sm:pl-4 border-l-2 border-gray-200">
                    <p className="text-xs font-semibold text-gray-500 mb-1">Admin note</p>
                    <p className="text-sm text-gray-600 break-words">{dispute.adminResolution.note}</p>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};

export default VendorDisputesTab;