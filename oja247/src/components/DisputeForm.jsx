import React, { useState } from "react";
import { CheckCircle2 } from "lucide-react";
import axiosInstance from "../services/api";
import ImageUpload from "./ImageUpload";
import { SELF_RESOLVE_WINDOW_DAYS, getDisputableVendors } from "../utils/disputes";

const REASONS = [
  { value: "item_not_received", label: "I never received it" },
  { value: "wrong_item", label: "I got the wrong item" },
  { value: "damaged", label: "It arrived damaged" },
  { value: "not_as_described", label: "It isn't what was described" },
  { value: "other", label: "Something else" },
];

// Files a dispute against one vendor on one order. `email` is the email on
// the order — the backend uses it (with the reference) to verify the
// person filing is the buyer, for guests and signed-in customers alike.
const DisputeForm = ({ order, email, onDone }) => {
  // Vendors that already have an active dispute on this order are left out.
  const vendors = getDisputableVendors(order);
  const [businessId, setBusinessId] = useState(vendors[0]?.businessId || "");
  const [itemIds, setItemIds] = useState([]);
  const [reason, setReason] = useState("");
  const [description, setDescription] = useState("");
  const [evidence, setEvidence] = useState([]);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [filedWith, setFiledWith] = useState(null);

  const vendorItems = (order.items || []).filter((i) => i.businessId === businessId);
  const vendorName = vendors.find((v) => v.businessId === businessId)?.businessName || "the vendor";

  const changeVendor = (id) => {
    setBusinessId(id);
    setItemIds([]); // items belong to one vendor — never carry a selection across
  };

  const toggleItem = (id) =>
    setItemIds((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError("");
    if (!reason) return setError("Choose what went wrong.");
    if (description.trim().length < 10) return setError("Tell us a bit more about what happened.");

    setSubmitting(true);
    try {
      await axiosInstance.post("/api/disputes", {
        orderReference: order.reference,
        email,
        businessId,
        itemIds, // empty = the whole order from this vendor
        reason,
        description: description.trim(),
        evidence,
      });
      setFiledWith(vendorName);
    } catch (err) {
      setError(err.response?.data?.message || "Couldn't file your dispute. Please try again.");
    } finally {
      setSubmitting(false);
    }
  };

  if (filedWith) {
    return (
      <div className="text-center py-6">
        <CheckCircle2 className="mx-auto text-green-500 mb-3" size={44} />
        <h3 className="text-lg font-bold text-gray-900 mb-2">Dispute filed</h3>
        <p className="text-sm text-gray-600 mb-6 max-w-sm mx-auto">
          We've emailed you a confirmation and told {filedWith}. They have {SELF_RESOLVE_WINDOW_DAYS} days to sort
          it out with you directly. If they don't, it goes to our team for review.
        </p>
        <button
          onClick={() => onDone(true)}
          className="px-6 py-2.5 bg-green-600 hover:bg-green-700 text-white font-semibold rounded-xl transition"
        >
          Done
        </button>
      </div>
    );
  }

  if (vendors.length === 0) {
    return <p className="text-sm text-gray-600">This order has no vendor details to file a dispute against.</p>;
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-5">
      {error && (
        <div className="p-3 bg-red-50 border border-red-200 rounded-xl text-red-600 text-sm">{error}</div>
      )}

      {vendors.length > 1 && (
        <div>
          <label className="block text-sm font-semibold text-gray-800 mb-1.5">Which vendor is this about?</label>
          <select
            value={businessId}
            onChange={(e) => changeVendor(e.target.value)}
            className="w-full px-3 py-2.5 border border-gray-300 rounded-xl focus:ring-2 focus:ring-green-500 focus:border-transparent"
          >
            {vendors.map((v) => (
              <option key={v.businessId} value={v.businessId}>
                {v.businessName || "Vendor"}
              </option>
            ))}
          </select>
        </div>
      )}

      {vendorItems.length > 0 && (
        <fieldset>
          <legend className="text-sm font-semibold text-gray-800 mb-1.5">
            Which items? <span className="font-normal text-gray-500">Leave empty if it's the whole order.</span>
          </legend>
          <div className="space-y-2">
            {vendorItems.map((item) => (
              <label
                key={item.productId}
                className="flex items-center gap-3 p-3 border border-gray-200 rounded-xl cursor-pointer hover:bg-gray-50"
              >
                <input
                  type="checkbox"
                  checked={itemIds.includes(item.productId)}
                  onChange={() => toggleItem(item.productId)}
                  className="w-4 h-4 accent-green-600"
                />
                <span className="text-sm text-gray-800 flex-1 min-w-0 truncate">{item.name}</span>
                <span className="text-xs text-gray-500">×{item.quantity}</span>
              </label>
            ))}
          </div>
        </fieldset>
      )}

      <div>
        <label className="block text-sm font-semibold text-gray-800 mb-1.5">What went wrong?</label>
        <div className="space-y-2">
          {REASONS.map((r) => (
            <label
              key={r.value}
              className={`flex items-center gap-3 p-3 border rounded-xl cursor-pointer transition ${
                reason === r.value ? "border-green-500 bg-green-50" : "border-gray-200 hover:bg-gray-50"
              }`}
            >
              <input
                type="radio"
                name="reason"
                value={r.value}
                checked={reason === r.value}
                onChange={() => setReason(r.value)}
                className="accent-green-600"
              />
              <span className="text-sm text-gray-800">{r.label}</span>
            </label>
          ))}
        </div>
      </div>

      <div>
        <label htmlFor="dispute-description" className="block text-sm font-semibold text-gray-800 mb-1.5">
          Tell us what happened
        </label>
        <textarea
          id="dispute-description"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          rows={4}
          maxLength={2000}
          placeholder="When did it arrive, what's wrong, and what have you already tried with the vendor?"
          className="w-full px-3 py-2.5 border border-gray-300 rounded-xl focus:ring-2 focus:ring-green-500 focus:border-transparent resize-none"
        />
      </div>

      <div>
        <label className="block text-sm font-semibold text-gray-800 mb-1.5">
          Photos <span className="font-normal text-gray-500">Optional, up to 5.</span>
        </label>
        <ImageUpload
          multiple
          maxFiles={5}
          onImagesUploaded={(urls) => setEvidence((prev) => [...prev, ...urls].slice(0, 5))}
        />
        {evidence.length > 0 && (
          <div className="flex gap-2 mt-3 flex-wrap">
            {evidence.map((url) => (
              <div key={url} className="relative">
                <img src={url} alt="Evidence" className="w-16 h-16 object-cover rounded-lg border border-gray-200" />
                <button
                  type="button"
                  aria-label="Remove photo"
                  onClick={() => setEvidence((prev) => prev.filter((u) => u !== url))}
                  className="absolute -top-1.5 -right-1.5 w-5 h-5 rounded-full bg-gray-800 text-white text-xs leading-none"
                >
                  ×
                </button>
              </div>
            ))}
          </div>
        )}
      </div>

      <p className="text-xs text-gray-500">
        Oja247 doesn't process refunds. {vendorName} and you settle any refund directly; we track the dispute and step
        in if it isn't resolved.
      </p>

      <div className="flex gap-3 justify-end">
        <button
          type="button"
          onClick={() => onDone(false)}
          className="px-5 py-2.5 border border-gray-300 text-gray-700 font-semibold rounded-xl hover:bg-gray-50 transition"
        >
          Cancel
        </button>
        <button
          type="submit"
          disabled={submitting}
          className="px-6 py-2.5 bg-green-600 hover:bg-green-700 disabled:opacity-60 text-white font-semibold rounded-xl transition"
        >
          {submitting ? "Filing…" : "File dispute"}
        </button>
      </div>
    </form>
  );
};

export default DisputeForm;