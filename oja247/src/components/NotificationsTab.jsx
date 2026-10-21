import React, { useCallback, useEffect, useState } from "react";
import { CheckCheck } from "lucide-react";
import axiosInstance from "../services/api";
import { TYPE_STYLE, timeAgo, dayLabel } from "../utils/notificationDisplay";

// Full notification history for the admin: everything from the last 50 days,
// grouped by day, filterable, loaded a page at a time.

const PAGE_SIZE = 30;

const NotificationsTab = ({ onOpenTab }) => {
  const [items, setItems] = useState([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [hasMore, setHasMore] = useState(false);
  const [historyDays, setHistoryDays] = useState(50);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState("");
  const [unreadOnly, setUnreadOnly] = useState(false);
  const [type, setType] = useState("");

  const fetchPage = useCallback(
    async (before) => {
      const params = { limit: PAGE_SIZE };
      if (unreadOnly) params.unread = "true";
      if (type) params.type = type;
      if (before) params.before = before;
      const res = await axiosInstance.get("/api/admin/notifications", { params });
      return res.data;
    },
    [unreadOnly, type]
  );

  // Reload from the top whenever a filter changes.
  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError("");
    fetchPage()
      .then((data) => {
        if (cancelled) return;
        setItems(data.items || []);
        setUnreadCount(data.unreadCount || 0);
        setHasMore(Boolean(data.hasMore));
        if (data.historyDays) setHistoryDays(data.historyDays);
      })
      .catch(() => !cancelled && setError("Could not load notifications. Please try again."))
      .finally(() => !cancelled && setLoading(false));
    return () => {
      cancelled = true;
    };
  }, [fetchPage]);

  const loadMore = async () => {
    if (!items.length) return;
    setLoadingMore(true);
    try {
      const data = await fetchPage(items[items.length - 1].createdAt);
      setItems((prev) => [...prev, ...(data.items || [])]);
      setHasMore(Boolean(data.hasMore));
    } catch {
      setError("Could not load more. Please try again.");
    } finally {
      setLoadingMore(false);
    }
  };

  const markRead = (item) => {
    if (item.readAt) return;
    const now = new Date().toISOString();
    setItems((prev) => prev.map((n) => (n._id === item._id ? { ...n, readAt: now } : n)));
    setUnreadCount((count) => Math.max(0, count - 1));
    axiosInstance.patch(`/api/admin/notifications/${item._id}/read`).catch(() => {});
  };

  const openItem = (item) => {
    markRead(item);
    if (item.tab && onOpenTab) onOpenTab(item.tab);
  };

  const markAllRead = () => {
    const now = new Date().toISOString();
    setItems((prev) => prev.map((n) => ({ ...n, readAt: n.readAt || now })));
    setUnreadCount(0);
    axiosInstance.patch("/api/admin/notifications/read-all").catch(() => {});
  };

  // Group the loaded items by calendar day, keeping newest first.
  const groups = [];
  items.forEach((item) => {
    const label = dayLabel(item.createdAt);
    const last = groups[groups.length - 1];
    if (last && last.label === label) last.items.push(item);
    else groups.push({ label, items: [item] });
  });

  return (
    <div className="bg-white border border-gray-200 shadow-sm rounded-2xl overflow-hidden">
      <div className="p-6 border-b border-gray-200 flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
        <div>
          <h2 className="text-xl font-bold text-gray-900">
            Notifications{" "}
            {unreadCount > 0 && <span className="text-sm font-semibold text-red-600">({unreadCount} unread)</span>}
          </h2>
          <p className="text-sm text-gray-500 mt-1">
            Everything from the last {historyDays} days. Older notifications are removed automatically.
          </p>
        </div>
        <button
          type="button"
          onClick={markAllRead}
          disabled={unreadCount === 0}
          className="self-start md:self-auto flex items-center gap-1.5 px-4 py-2 rounded-xl border border-gray-200 text-sm font-semibold text-green-700 hover:bg-green-50 disabled:text-gray-300 disabled:hover:bg-transparent disabled:cursor-default"
        >
          <CheckCheck size={16} /> Mark all read
        </button>
      </div>

      <div className="px-6 py-3 border-b border-gray-100 flex flex-wrap items-center gap-3">
        <div className="flex rounded-xl border border-gray-200 overflow-hidden text-sm font-semibold">
          {[
            { label: "All", value: false },
            { label: "Unread", value: true },
          ].map((option) => (
            <button
              type="button"
              key={option.label}
              onClick={() => setUnreadOnly(option.value)}
              className={`px-4 py-1.5 ${unreadOnly === option.value ? "bg-green-600 text-white" : "bg-white text-gray-600 hover:bg-gray-50"}`}
            >
              {option.label}
            </button>
          ))}
        </div>
        <select
          value={type}
          onChange={(e) => setType(e.target.value)}
          className="px-3 py-1.5 rounded-xl border border-gray-200 bg-white text-sm text-gray-700"
          aria-label="Filter by type"
        >
          <option value="">All types</option>
          {Object.entries(TYPE_STYLE).map(([value, style]) => (
            <option key={value} value={value}>
              {style.label}
            </option>
          ))}
        </select>
      </div>

      {error && <p className="px-6 py-3 text-sm text-red-600 bg-red-50">{error}</p>}

      {loading ? (
        <p className="p-10 text-center text-sm text-gray-400">Loading...</p>
      ) : items.length === 0 ? (
        <p className="p-10 text-center text-sm text-gray-400">
          {unreadOnly || type ? "Nothing matches these filters." : "No notifications in the last " + historyDays + " days."}
        </p>
      ) : (
        <div>
          {groups.map((group) => (
            <div key={group.label}>
              <p className="px-6 py-2 bg-gray-50 text-xs font-bold uppercase tracking-wide text-gray-500 border-b border-gray-100">
                {group.label}
              </p>
              {group.items.map((item) => {
                const style = TYPE_STYLE[item.type] || TYPE_STYLE.order_placed;
                const Icon = style.icon;
                return (
                  <button
                    type="button"
                    key={item._id}
                    onClick={() => openItem(item)}
                    className={`w-full text-left flex gap-3 px-6 py-3.5 border-b border-gray-50 hover:bg-gray-50 transition ${
                      item.readAt ? "" : "bg-green-50/50"
                    }`}
                  >
                    <span className={`shrink-0 w-9 h-9 rounded-full flex items-center justify-center ${style.cls}`}>
                      <Icon size={16} />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="flex items-start justify-between gap-2">
                        <span className={`text-sm text-gray-900 ${item.readAt ? "font-medium" : "font-bold"}`}>{item.title}</span>
                        <span className="text-[11px] text-gray-400 shrink-0 mt-0.5">{timeAgo(item.createdAt)}</span>
                      </span>
                      {item.message && <span className="block text-xs text-gray-500 mt-0.5 break-words">{item.message}</span>}
                      <span className="block text-[11px] text-gray-400 mt-1">
                        {style.label} · {new Date(item.createdAt).toLocaleString("en-NG", { day: "numeric", month: "short", hour: "numeric", minute: "2-digit" })}
                        {!item.readAt && " · unread"}
                      </span>
                    </span>
                  </button>
                );
              })}
            </div>
          ))}
          {hasMore && (
            <div className="p-4 text-center">
              <button
                type="button"
                onClick={loadMore}
                disabled={loadingMore}
                className="px-5 py-2 rounded-xl border border-gray-200 text-sm font-semibold text-gray-700 hover:bg-gray-50 disabled:opacity-60"
              >
                {loadingMore ? "Loading..." : "Load older"}
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export default NotificationsTab;