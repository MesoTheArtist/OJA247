import React, { useEffect, useRef, useState, useCallback } from "react";
import { Bell, CheckCheck } from "lucide-react";
import axiosInstance from "../services/api";
import { TYPE_STYLE, timeAgo } from "../utils/notificationDisplay";

// Admin notification center: a bell with an unread badge in the top bar and a
// dropdown list of recent activity (sign-ups, orders, disputes, ...).
// Clicking an item marks it read and jumps to the dashboard tab it is about.

const POLL_MS = 60 * 1000;

const NotificationBell = ({ onOpenTab }) => {
  const [open, setOpen] = useState(false);
  const [items, setItems] = useState([]);
  const [unread, setUnread] = useState(0);
  const [loading, setLoading] = useState(false);
  const wrapRef = useRef(null);

  const refreshCount = useCallback(() => {
    axiosInstance
      .get("/api/admin/notifications/unread-count")
      .then((res) => setUnread(res.data.unreadCount || 0))
      .catch(() => {});
  }, []);

  const loadList = useCallback(() => {
    setLoading(true);
    axiosInstance
      .get("/api/admin/notifications", { params: { limit: 30 } })
      .then((res) => {
        setItems(res.data.items || []);
        setUnread(res.data.unreadCount || 0);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  // Keep the badge fresh while the dashboard is open (skip when the tab is hidden).
  useEffect(() => {
    refreshCount();
    const timer = setInterval(() => {
      if (!document.hidden) refreshCount();
    }, POLL_MS);
    return () => clearInterval(timer);
  }, [refreshCount]);

  // Close when clicking outside.
  useEffect(() => {
    if (!open) return undefined;
    const onDown = (event) => {
      if (wrapRef.current && !wrapRef.current.contains(event.target)) setOpen(false);
    };
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, [open]);

  const openItem = (item) => {
    if (!item.readAt) {
      setItems((prev) => prev.map((n) => (n._id === item._id ? { ...n, readAt: new Date().toISOString() } : n)));
      setUnread((count) => Math.max(0, count - 1));
      axiosInstance.patch(`/api/admin/notifications/${item._id}/read`).catch(() => {});
    }
    if (item.tab && onOpenTab) onOpenTab(item.tab);
    setOpen(false);
  };

  const markAllRead = () => {
    setItems((prev) => prev.map((n) => ({ ...n, readAt: n.readAt || new Date().toISOString() })));
    setUnread(0);
    axiosInstance.patch("/api/admin/notifications/read-all").catch(() => loadList());
  };

  return (
    <div className="relative" ref={wrapRef}>
      <button
        type="button"
        onClick={() => {
          if (!open) loadList();
          setOpen(!open);
        }}
        aria-label={unread ? `Notifications, ${unread} unread` : "Notifications"}
        className="relative p-2.5 rounded-xl border border-gray-200 bg-white hover:bg-gray-50 text-gray-600 transition"
      >
        <Bell size={20} />
        {unread > 0 && (
          <span className="absolute -top-1 -right-1 min-w-[18px] h-[18px] px-1 rounded-full bg-red-500 text-white text-[11px] font-bold flex items-center justify-center">
            {unread > 99 ? "99+" : unread}
          </span>
        )}
      </button>

      {open && (
        <div className="absolute right-0 top-full mt-2 w-[22rem] max-w-[calc(100vw-2rem)] bg-white border border-gray-200 rounded-2xl shadow-xl z-50 overflow-hidden">
          <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100">
            <p className="text-sm font-bold text-gray-900">Notifications</p>
            <button
              type="button"
              onClick={markAllRead}
              disabled={unread === 0}
              className="flex items-center gap-1 text-xs font-semibold text-green-700 hover:text-green-800 disabled:text-gray-300 disabled:cursor-default"
            >
              <CheckCheck size={14} /> Mark all read
            </button>
          </div>

          <div className="max-h-[26rem] overflow-y-auto">
            {loading && items.length === 0 ? (
              <p className="px-4 py-8 text-center text-sm text-gray-400">Loading...</p>
            ) : items.length === 0 ? (
              <p className="px-4 py-8 text-center text-sm text-gray-400">Nothing yet. New sign-ups and activity will show up here.</p>
            ) : (
              items.map((item) => {
                const style = TYPE_STYLE[item.type] || TYPE_STYLE.order_placed;
                const Icon = style.icon;
                return (
                  <button
                    type="button"
                    key={item._id}
                    onClick={() => openItem(item)}
                    className={`w-full text-left flex gap-3 px-4 py-3 border-b border-gray-50 hover:bg-gray-50 transition ${
                      item.readAt ? "" : "bg-green-50/50"
                    }`}
                  >
                    <span className={`shrink-0 w-9 h-9 rounded-full flex items-center justify-center ${style.cls}`}>
                      <Icon size={16} />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="flex items-start justify-between gap-2">
                        <span className={`text-sm text-gray-900 ${item.readAt ? "font-medium" : "font-bold"}`}>{item.title}</span>
                        {!item.readAt && <span className="mt-1.5 w-2 h-2 rounded-full bg-green-500 shrink-0" />}
                      </span>
                      {item.message && <span className="block text-xs text-gray-500 mt-0.5 break-words">{item.message}</span>}
                      <span className="block text-[11px] text-gray-400 mt-1">{timeAgo(item.createdAt)}</span>
                    </span>
                  </button>
                );
              })
            )}
          </div>

          <button
            type="button"
            onClick={() => {
              if (onOpenTab) onOpenTab("notifications");
              setOpen(false);
            }}
            className="w-full px-4 py-3 border-t border-gray-100 text-sm font-semibold text-green-700 hover:bg-gray-50"
          >
            View full history (last 50 days)
          </button>
        </div>
      )}
    </div>
  );
};

export default NotificationBell;