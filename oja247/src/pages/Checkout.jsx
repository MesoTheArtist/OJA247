import { useState, useMemo } from "react";
import PaystackPop from "@paystack/inline-js";
import { useNavigate } from "react-router-dom";
import axiosInstance from "../services/api";
import { useCart } from "../context/CartContext";

const SERVICE_FEE_RATE = 0.05; // 5% PSS / Platform Service Fee
const VAT_RATE = 0.075; // Nigeria standard VAT

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

  const serviceFee = subtotal * SERVICE_FEE_RATE;
  const vat = (subtotal + serviceFee) * VAT_RATE;
  const total = subtotal + serviceFee + vat + totalDeliveryFee;

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

  const handleSubmit = async (e) => {
    e.preventDefault();

    if (deliveryMethod === "delivery" && !formData.state.trim()) {
      alert("Please enter your state so we can calculate delivery fees.");
      return;
    }

    const reference = `oja247-${Date.now()}`;

    let accessCode = null;
    try {
      const { data } = await axiosInstance.post("/api/orders", {
        reference,
        customer: {
          fullName: formData.fullName,
          phone: formData.phone,
          email: formData.email,
          address: formData.address,
          city: formData.city,
          state: formData.state,
          note: formData.note,
        },
        items: cartItems.map((item) => ({
          productId: item._id,
          businessId: (item.business || item.businessId)?._id || null,
          name: item.name,
          category: item.category || "",
          quantity: item.quantity,
          price: Number(item.price || 0),
          image: item.images?.[0] || item.image || "",
        })),
        vendors: vendorGroupsWithFees.map((group) => ({
          businessId: group.business?._id || null,
          businessName: group.business?.name || "",
          itemsSubtotal: group.itemsSubtotal,
          deliveryFee: group.deliveryFee,
        })),
        subtotal: Number(subtotal),
        serviceFee: Number(serviceFee),
        vat: Number(vat),
        deliveryFee: Number(totalDeliveryFee),
        total: Number(total),
        deliveryMethod,
      });

      accessCode = data.accessCode;
    } catch (error) {
      console.error("Order creation error:", error);
      alert(error.response?.data?.message || "We could not create your order. Please try again.");
      return;
    }

    if (!accessCode) {
      alert("We could not start your payment. Please try again.");
      return;
    }

    // The server already started this payment with the vendor split attached,
    // so the popup only has to finish it.
    const popup = new PaystackPop();
    popup.resumeTransaction(accessCode, {
      onSuccess: async (transaction) => {
        const paidReference = transaction?.reference || reference;
        try {
          const verificationResponse = await axiosInstance.post(`/api/orders/verify/${paidReference}`);

          if (verificationResponse.data?.order?.paymentStatus === "paid") {
            clearCart();
            navigate(`/payment-status?status=success&reference=${paidReference}`);
            return;
          }
        } catch (error) {
          console.error("Payment verification error:", error);
        }

        navigate(`/payment-status?status=failure&reference=${paidReference}`);
      },
      onCancel: () => {
        console.log("Paystack checkout closed by user");
        navigate(`/payment-status?status=failure&reference=${reference}`);
      },
      onError: (error) => {
        console.error("Paystack popup error:", error);
        alert("The payment window could not load. Please try again.");
      },
    });
  };

  return (
    <div className="min-h-screen bg-gray-50 p-4 sm:p-6">
      <div className="max-w-6xl mx-auto">
        <button
          onClick={() => navigate("/cart")}
          className="mb-6 text-sm font-medium text-gray-600 hover:text-gray-800"
        >
          ← Back to cart
        </button>

        <div className="mb-6">
          <h1 className="text-2xl sm:text-3xl font-bold text-gray-900">Checkout</h1>
          <p className="text-gray-500 mt-1">Complete your order details below.</p>
        </div>

        <div className="grid lg:grid-cols-[1.2fr_0.8fr] gap-6">
          <form onSubmit={handleSubmit} className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5 sm:p-6">
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

            <button
              type="submit"
              className="mt-6 w-full bg-green-600 hover:bg-green-700 text-white py-3 rounded-xl font-medium"
            >
              Place Order
            </button>
          </form>

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
                <span>Service Fee (5%)</span>
                <span>₦{serviceFee.toLocaleString(undefined, { maximumFractionDigits: 0 })}</span>
              </div>
              <div className="flex justify-between">
                <span>VAT (7.5%)</span>
                <span>₦{vat.toLocaleString(undefined, { maximumFractionDigits: 0 })}</span>
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