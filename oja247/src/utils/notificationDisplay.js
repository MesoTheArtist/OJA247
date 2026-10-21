import { UserPlus, ShoppingCart, AlertTriangle, ShieldCheck, Wallet } from "lucide-react";

// Shared by the bell dropdown and the full Notifications page.

export const TYPE_STYLE = {
  signup_vendor: { icon: UserPlus, cls: "bg-green-100 text-green-700", label: "New vendor" },
  signup_customer: { icon: UserPlus, cls: "bg-blue-100 text-blue-700", label: "New customer" },
  signup_marketer: { icon: UserPlus, cls: "bg-purple-100 text-purple-700", label: "New marketer" },
  order_placed: { icon: ShoppingCart, cls: "bg-amber-100 text-amber-700", label: "Transfer order" },
  dispute_filed: { icon: AlertTriangle, cls: "bg-red-100 text-red-700", label: "Dispute filed" },
  dispute_escalated: { icon: AlertTriangle, cls: "bg-red-100 text-red-700", label: "Dispute needs you" },
  verification_submitted: { icon: ShieldCheck, cls: "bg-teal-100 text-teal-700", label: "Verification" },
  subscription_paid: { icon: Wallet, cls: "bg-emerald-100 text-emerald-700", label: "Subscription paid" },
};

export function timeAgo(date) {
  const seconds = Math.max(0, Math.floor((Date.now() - new Date(date).getTime()) / 1000));
  if (seconds < 60) return "just now";
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}d ago`;
  return new Date(date).toLocaleDateString();
}

// "Today", "Yesterday", or a date, for grouping the history list.
export function dayLabel(date) {
  const d = new Date(date);
  const startOf = (x) => new Date(x.getFullYear(), x.getMonth(), x.getDate()).getTime();
  const diffDays = Math.round((startOf(new Date()) - startOf(d)) / (24 * 60 * 60 * 1000));
  if (diffDays === 0) return "Today";
  if (diffDays === 1) return "Yesterday";
  return d.toLocaleDateString("en-NG", { weekday: "short", day: "numeric", month: "short", year: "numeric" });
}