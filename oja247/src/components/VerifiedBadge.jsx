// Small blue "Verified" tick shown next to a vendor's name on cards and lists
// (the store page has its own, larger version). Text sits beside the icon so
// it's readable on mobile, where a hover title never shows.
export default function VerifiedBadge({ className = "" }) {
  return (
    <span
      className={`inline-flex items-center gap-0.5 pl-1 pr-1.5 py-0.5 bg-blue-500 rounded-full flex-shrink-0 ${className}`}
      title="Verified vendor"
    >
      <svg className="w-3 h-3 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth="3">
        <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
      </svg>
      <span className="text-[10px] font-semibold text-white leading-none">Verified</span>
    </span>
  );
}