import React, { useEffect } from "react";
import { X } from "lucide-react";
import DisputeForm from "./DisputeForm";

// Modal wrapper around DisputeForm. onClose(filed) — `filed` is true when a
// dispute was actually submitted, so the parent can refresh its order list.
const DisputeModal = ({ order, email, onClose }) => {
  useEffect(() => {
    const onKey = (e) => e.key === "Escape" && onClose(false);
    document.addEventListener("keydown", onKey);
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = prevOverflow;
    };
  }, [onClose]);

  return (
    <div
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/50 p-0 sm:p-4"
      onClick={() => onClose(false)}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Report a problem with your order"
        className="bg-white w-full sm:max-w-lg max-h-[92vh] overflow-y-auto rounded-t-3xl sm:rounded-3xl p-6 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between mb-5">
          <div>
            <h2 className="text-xl font-black text-gray-900">Report a problem</h2>
            <p className="text-sm text-gray-500">Order {order.reference}</p>
          </div>
          <button
            onClick={() => onClose(false)}
            aria-label="Close"
            className="p-1.5 rounded-lg text-gray-400 hover:text-gray-700 hover:bg-gray-100"
          >
            <X size={20} />
          </button>
        </div>
        <DisputeForm order={order} email={email} onDone={onClose} />
      </div>
    </div>
  );
};

export default DisputeModal;