import { useState, useMemo, useRef, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import axiosInstance from "../services/api";
import { useCart } from "../context/CartContext";

const MAX_RECEIPT_BYTES = 4 * 1024 * 1024; // the host rejects requests over ~4.5 MB

// Turns a failed order request into a message that says what went wrong.
function describeOrderError(error) {
  const res = error?.response;
  if (!res) {
    return error?.code === "ECONNABORTED"
      ? "The request timed out before the server answered. Check your connection and try again."
      : "We couldn't reach the server (network or connection problem). Check your internet and try again.";
  }
  if (res.status === 413) {
    return "Your receipt file is too large for the server. Please use a file under 4 MB (a smaller screenshot works).";
  }
  if (res.status === 429) return "Too many attempts. Please wait a few minutes and try again.";
  const message = typeof res.data?.message === "string" ? res.data.message : null;
  const code = res.data?.code ? ` [${res.data.code}]` : "";
  if (message) return `${message}${code}`;
  return `The server returned an unexpected response (status ${res.status}). Please try again.`;
}

// The reference the customer puts in their transfer narration. Made here, before
// the order exists, so it can be shown on the payment step. 10 random characters.
function makeReference() {
  const chars = "abcdefghijklmnopqrstuvwxyz0123456789";
  const bytes = new Uint8Array(10);
  crypto.getRandomValues(bytes);
  return `oja247-${Array.from(bytes, (b) => chars[b % chars.length]).join("")}`;
}

function Checkout() {
  const navigate = useNavigate();
  const { cartItems, subtotal, clearCart } = useCart();

  const [formData, setFormData] = useState({
    fullName: "",
    phone: "",
    email: "",
    address: "",
    city: "",
    state: "",
    note: "",
  });

  const [deliveryMethod, setDeliveryMethod] = useState("delivery");

  // "details" collects who and where; "payment" shows where to transfer the
  // money and takes the receipt.
  const [step, setStep] = useState("details");
  const referenceRef = useRef(makeReference());
  const [payDetails, setPayDetails] = useState(null);
  const [payError, setPayError] = useState("");
  const [loadingPay, setLoadingPay] = useState(false);
  const [receiptFile, setReceiptFile] = useState(null);
  const [submitting, setSubmitting] = useState(false);
  const [copied, setCopied] = useState("");

  // Group cart items by business, so each vendor's delivery fee can be
  // calculated independently based on the buyer's state.
  // Falls back to businessId (a populated ref from the product) when
  // `business` wasn't attached at add-to-cart time.
  const vendorGroups = useMemo(() => {
    const groups = {};

    cartItems.forEach((item) => {
      const business = item.business || item.businessId;
      const key = business?._id || "unknown";

      if (!groups[key]) {
        groups[key] = {
          business,
          items: [],
          itemsSubtotal: 0,
        };
      }

      groups[key].items.push(item);
      groups[key].itemsSubtotal += Number(item.price || 0) * item.quantity;
    });

    return Object.values(groups);
  }, [cartItems]);

  // Delivery fee per vendor: compares buyer's state to the vendor's location.
  // Falls back to 0 if a vendor has no fees set, and skips entirely on pickup.
  const getVendorDeliveryFee = (business) => {
    if (deliveryMethod === "pickup") return 0;
    if (!business) return 0;

    const buyerState = formData.state.trim().toLowerCase();
    const vendorState = (business.location || "").trim().toLowerCase();

    if (!buyerState) return 0; // buyer hasn't picked a state yet

    const isInState = buyerState === vendorState;
    const fee = isInState ? business.deliveryFeeInState : business.deliveryFeeOutState;
    return Number(fee) || 0;
  };

  const vendorGroupsWithFees = useMemo(
    () =>
      vendorGroups.map((group) => ({
        ...group,
        deliveryFee: getVendorDeliveryFee(group.business),
      })),
    [vendorGroups, formData.state, deliveryMethod]
  );

  const totalDeliveryFee = useMemo(
    () => vendorGroupsWithFees.reduce((sum, group) => sum + group.deliveryFee, 0),
    [vendorGroupsWithFees]
  );

  // Paid straight to the seller's own bank account: items plus delivery,
  // with no service fee or VAT added at checkout.
  const total = subtotal + totalDeliveryFee;

  const storeId = vendorGroups[0]?.business?._id || null;
  const hasMultipleStores = vendorGroups.length > 1;

  // Load the seller's bank details when the payment step opens.
  useEffect(() => {
    if (step !== "payment" || !storeId) return;
    let cancelled = false;

    const load = async () => {
      setLoadingPay(true);
      setPayError("");
      try {
        const { data } = await axiosInstance.get(`/api/orders/payment-details/${storeId}`);
        if (!cancelled) setPayDetails(data);
      } catch (error) {
        if (!cancelled) {
          setPayDetails(null);
          setPayError(
            error.response?.data?.message || "We could not load this store's payment details. Please try again."
          );
        }
      } finally {
        if (!cancelled) setLoadingPay(false);
      }
    };

    load();
    return () => {
      cancelled = true;
    };
  }, [step, storeId]);

  if (cartItems.length === 0) {
    return (
      <div className="min-h-screen bg-gray-50 p-6">
        <div className="max-w-4xl mx-auto bg-white rounded-2xl shadow-sm border border-gray-100 p-10 text-center">
          <h1 className="text-2xl font-bold text-gray-900 mb-3">Your cart is empty</h1>
          <p className="text-gray-500 mb-6">Add products before checking out.</p>
          <button
            onClick={() => navigate("/products")}
            className="inline-block bg-green-600 hover:bg-green-700 text-white px-5 py-3 rounded-lg font-medium"
          >
            Browse Products
          </button>
        </div>
      </div>
    );
  }

  const handleChange = (e) => {
    const { name, value } = e.target;
    setFormData((prev) => ({ ...prev, [name]: value }));
  };

  const goToPayment = (e) => {
    e.preventDefault();

    if (deliveryMethod === "delivery" && !formData.state.trim()) {
      alert("Please enter your state so we can calculate delivery fees.");
      return;
    }
    if (hasMultipleStores) return;

    setStep("payment");
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const copyText = async (label, text) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(label);
      setTimeout(() => setCopied(""), 1500);
    } catch {
      /* clipboard can be blocked; the text is still on screen to copy by hand */
    }
  };

  const handleReceiptChange = (e) => {
    const file = e.target.files?.[0] || null;
    if (file && file.size > MAX_RECEIPT_BYTES) {
      alert("That file is too big. Please upload a receipt under 4 MB.");
      e.target.value = "";
      setReceiptFile(null);
      return;
    }
    setReceiptFile(file);
  };

  const handlePlaceOrder = async (e) => {
    e.preventDefault();
    if (!receiptFile) {
      alert("Please upload your payment receipt before placing the order.");
      return;
    }

    setSubmitting(true);
    try {
      const payload = {
        reference: referenceRef.current,
        customer: {
          fullName: formData.fullName,
          phone: formData.phone,
          email: formData.email,
          address: formData.address,
          city: formData.city,
          state: formData.state,
          note: formData.note,
        },
        // Only ids and quantities go up. Prices and delivery are worked out on
        // the server, so what the customer saw is checked, not trusted.
        items: cartItems.map((item) => ({ productId: item._id, quantity: item.quantity })),
        deliveryMethod,
        expectedTotal: Number(total),
      };

      const form = new FormData();
      form.append("payload", JSON.stringify(payload));
      form.append("receipt", receiptFile);

      // The shared axios instance defaults to a JSON Content-Type, which makes
      // axios turn a FormData body into JSON and silently drop the file. Say
      // multipart explicitly so the receipt actually reaches the server.
      await axiosInstance.post("/api/orders/direct", form, {
        headers: { "Content-Type": "multipart/form-data" },
      });

      clearCart();
      navigate(
        `/payment-status?status=awaiting&reference=${encodeURIComponent(referenceRef.current)}&email=${encodeURIComponent(formData.email)}`
      );
    } catch (error) {
      console.error("Order creation error:", error);
      alert(describeOrderError(error));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen bg-gray-50 p-4 sm:p-6">
      <div className="max-w-6xl mx-auto">
        <button
          onClick={() => (step === "payment" ? setStep("details") : navigate("/cart"))}
          className="mb-6 text-sm font-medium text-gray-600 hover:text-gray-800"
        >
          {step === "payment" ? "← Back to your details" : "← Back to cart"}
        </button>

        <div className="mb-6">
          <h1 className="text-2xl sm:text-3xl font-bold text-gray-900">Checkout</h1>
          <p className="text-gray-500 mt-1">
            {step === "details" ? "Step 1 of 2: your delivery details." : "Step 2 of 2: pay the seller and upload your receipt."}
          </p>
        </div>

        <div className="grid lg:grid-cols-[1.2fr_0.8fr] gap-6">
          {step === "details" ? (
          <form onSubmit={goToPayment} className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5 sm:p-6">
            <div className="grid sm:grid-cols-2 gap-4">
              <div className="sm:col-span-2">
                <label className="block text-sm font-medium text-gray-700 mb-2">Full name</label>
                <input
                  type="text"
                  name="fullName"
                  required
                  value={formData.fullName}
                  onChange={handleChange}
                  className="w-full px-3 py-3 border border-gray-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-green-500"
                  placeholder="John Doe"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Phone number</label>
                <input
                  type="tel"
                  name="phone"
                  required
                  value={formData.phone}
                  onChange={handleChange}
                  className="w-full px-3 py-3 border border-gray-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-green-500"
                  placeholder="0803 000 0000"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Email</label>
                <input
                  type="email"
                  name="email"
                  required
                  value={formData.email}
                  onChange={handleChange}
                  className="w-full px-3 py-3 border border-gray-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-green-500"
                  placeholder="you@example.com"
                />
              </div>

              <div className="sm:col-span-2">
                <label className="block text-sm font-medium text-gray-700 mb-2">Delivery address</label>
                <textarea
                  name="address"
                  required
                  rows="3"
                  value={formData.address}
                  onChange={handleChange}
                  className="w-full px-3 py-3 border border-gray-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-green-500"
                  placeholder="12 Market Road, Ikeja, Lagos"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">City</label>
                <input
                  type="text"
                  name="city"
                  required
                  value={formData.city}
                  onChange={handleChange}
                  className="w-full px-3 py-3 border border-gray-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-green-500"
                  placeholder="Ikeja"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">State</label>
                <input
                  type="text"
                  name="state"
                  required={deliveryMethod === "delivery"}
                  value={formData.state}
                  onChange={handleChange}
                  className="w-full px-3 py-3 border border-gray-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-green-500"
                  placeholder="Lagos"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Delivery method</label>
                <select
                  value={deliveryMethod}
                  onChange={(e) => setDeliveryMethod(e.target.value)}
                  className="w-full px-3 py-3 border border-gray-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-green-500"
                >
                  <option value="delivery">Home Delivery</option>
                  <option value="pickup">Pickup</option>
                </select>
              </div>

              <div className="sm:col-span-2">
                <label className="block text-sm font-medium text-gray-700 mb-2">Order note (optional)</label>
                <textarea
                  name="note"
                  rows="3"
                  value={formData.note}
                  onChange={handleChange}
                  className="w-full px-3 py-3 border border-gray-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-green-500"
                  placeholder="Any delivery instructions?"
                />
              </div>
            </div>

            {hasMultipleStores && (
              <p className="mt-4 text-sm text-red-600">
                Your cart has items from more than one store. Each order can only be from one store, so please{" "}
                <button type="button" onClick={() => navigate("/cart")} className="underline font-medium">
                  go back to your cart
                </button>{" "}
                and keep one store's items.
              </p>
            )}

            <button
              type="submit"
              disabled={hasMultipleStores}
              className="mt-6 w-full bg-green-600 hover:bg-green-700 disabled:opacity-50 text-white py-3 rounded-xl font-medium"
            >
              Continue to payment
            </button>
          </form>
        ) : (
          <form onSubmit={handlePlaceOrder} className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5 sm:p-6">
            <h2 className="text-lg font-semibold text-gray-900 mb-1">Pay {vendorGroups[0]?.business?.name || "the seller"} by bank transfer</h2>
            <p className="text-sm text-gray-500 mb-5">
              Your money goes straight to the seller's own bank account. Transfer the exact amount below, then upload
              your receipt.
            </p>

            {loadingPay && <p className="text-sm text-gray-500">Loading the seller's bank details...</p>}

            {payError && (
              <div className="rounded-xl bg-red-50 border border-red-100 p-4 text-sm text-red-700">{payError}</div>
            )}

            {payDetails && (
              <div className="space-y-4">
                <div className="rounded-xl bg-green-50 border border-green-100 p-4">
                  <p className="text-xs uppercase tracking-wide text-green-700 font-semibold">Amount to transfer</p>
                  <div className="flex items-center justify-between gap-3">
                    <p className="text-2xl font-black text-gray-900">₦{Math.round(total).toLocaleString()}</p>
                    <button
                      type="button"
                      onClick={() => copyText("amount", String(Math.round(total)))}
                      className="text-xs font-semibold text-green-700"
                    >
                      {copied === "amount" ? "Copied" : "Copy"}
                    </button>
                  </div>
                </div>

                <div className="rounded-xl border border-gray-200 divide-y divide-gray-100 text-sm">
                  {[
                    ["Bank", payDetails.bankName, "bank"],
                    ["Account name", payDetails.accountName, "name"],
                    ["Account number", payDetails.accountNumber, "number"],
                  ].map(([label, value, key]) => (
                    <div key={key} className="flex items-center justify-between gap-3 px-4 py-3">
                      <div>
                        <p className="text-xs text-gray-400">{label}</p>
                        <p className="font-semibold text-gray-900 break-all">{value}</p>
                      </div>
                      <button
                        type="button"
                        onClick={() => copyText(key, value)}
                        className="text-xs font-semibold text-green-700 shrink-0"
                      >
                        {copied === key ? "Copied" : "Copy"}
                      </button>
                    </div>
                  ))}
                </div>

                <div className="rounded-xl bg-amber-50 border border-amber-100 p-4 text-sm text-amber-900">
                  <p className="font-semibold mb-1">Put this reference in your transfer narration</p>
                  <div className="flex items-center justify-between gap-3">
                    <p className="font-mono font-bold">{referenceRef.current}</p>
                    <button
                      type="button"
                      onClick={() => copyText("ref", referenceRef.current)}
                      className="text-xs font-semibold text-amber-800"
                    >
                      {copied === "ref" ? "Copied" : "Copy"}
                    </button>
                  </div>
                  <p className="mt-2 text-xs text-amber-800">
                    Pay only to the account shown here, and check the account name matches the store before you send.
                  </p>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Upload your payment receipt <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="file"
                    required
                    accept=".jpg,.jpeg,.png,.webp,.pdf,image/jpeg,image/png,image/webp,application/pdf"
                    onChange={handleReceiptChange}
                    className="block w-full text-sm text-gray-700 file:mr-3 file:rounded-lg file:border-0 file:bg-green-600 file:px-4 file:py-2 file:text-white file:font-medium"
                  />
                  <p className="text-xs text-gray-400 mt-1">
                    A screenshot or PDF of your transfer (JPG, PNG or PDF, up to 5 MB). Your order can't be placed
                    without it.
                  </p>
                </div>

                <button
                  type="submit"
                  disabled={submitting || !receiptFile}
                  className="w-full bg-green-600 hover:bg-green-700 disabled:opacity-50 text-white py-3 rounded-xl font-medium"
                >
                  {submitting ? "Placing your order..." : "I've paid, place my order"}
                </button>
                <p className="text-xs text-gray-400 text-center">
                  The seller will check their bank and confirm your payment, and we will email you.
                </p>
              </div>
            )}
          </form>
        )}

          <aside className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5 sm:p-6 h-fit">
            <h2 className="text-xl font-semibold text-gray-900 mb-4">Order Summary</h2>

            <div className="space-y-5 mb-5">
              {vendorGroupsWithFees.map((group) => (
                <div key={group.business?._id || "unknown"} className="border border-gray-100 rounded-xl p-3">
                  <p className="text-sm font-semibold text-gray-800 mb-2">
                    {group.business?.name || "Unknown vendor"}
                  </p>

                  <div className="space-y-2">
                    {group.items.map((item) => (
                      <div key={item._id} className="flex items-start justify-between gap-3 text-sm">
                        <div>
                          <p className="text-gray-700">{item.name}</p>
                          <p className="text-gray-400">Qty: {item.quantity}</p>
                        </div>
                        <p className="text-gray-900">
                          ₦{(Number(item.price || 0) * item.quantity).toLocaleString()}
                        </p>
                      </div>
                    ))}
                  </div>

                  {deliveryMethod === "delivery" && (
                    <div className="flex justify-between text-xs text-gray-500 mt-2 pt-2 border-t border-gray-100">
                      <span>Delivery ({group.business?.name || "vendor"})</span>
                      <span>
                        {formData.state
                          ? `₦${group.deliveryFee.toLocaleString()}`
                          : "Enter state to calculate"}
                      </span>
                    </div>
                  )}
                </div>
              ))}
            </div>

            <div className="space-y-2 text-sm text-gray-600">
              <div className="flex justify-between">
                <span>Items Subtotal</span>
                <span>₦{subtotal.toLocaleString()}</span>
              </div>
              <div className="flex justify-between">
                <span>Total Delivery</span>
                <span>₦{totalDeliveryFee.toLocaleString()}</span>
              </div>
              <div className="border-t border-gray-200 pt-3 flex justify-between text-lg font-bold text-gray-900">
                <span>Total</span>
                <span>₦{total.toLocaleString(undefined, { maximumFractionDigits: 0 })}</span>
              </div>
            </div>
          </aside>
        </div>
      </div>
    </div>
  );
}

export default Checkout;