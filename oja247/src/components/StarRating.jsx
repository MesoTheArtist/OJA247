import React from "react";

// Shared star display — used on the storefront header (BusinessDetails) and
// in the reviews list/form. size in px; interactive + onChange turns it into
// a clickable 1-5 picker for the review form, otherwise it's read-only.
const StarRating = ({ rating, size = 16, interactive = false, onChange }) => {
  const rounded = interactive ? rating : Math.round((rating || 0) * 2) / 2;
  return (
    <span className="inline-flex items-center gap-0.5" aria-hidden={!interactive}>
      {[1, 2, 3, 4, 5].map((i) => (
        <svg
          key={i}
          viewBox="0 0 20 20"
          width={size}
          height={size}
          fill={i <= rounded ? "#f59e0b" : "#e5e7eb"}
          className={interactive ? "cursor-pointer transition-colors" : ""}
          onClick={interactive ? () => onChange(i) : undefined}
          role={interactive ? "button" : undefined}
          aria-label={interactive ? `${i} star${i === 1 ? "" : "s"}` : undefined}
        >
          <path d="M10 1.5l2.6 5.27 5.82.85-4.21 4.1.99 5.79L10 14.9l-5.2 2.61.99-5.79-4.21-4.1 5.82-.85L10 1.5z" />
        </svg>
      ))}
    </span>
  );
};

export default StarRating;