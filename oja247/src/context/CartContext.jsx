import { createContext, useContext, useState, useEffect, useMemo } from "react";

const CartContext = createContext();

export function CartProvider({ children }) {
  const [cart, setCart] = useState(() => {
    const saved = localStorage.getItem("cart");
    return saved ? JSON.parse(saved) : [];
  });

  // Keep localStorage in sync with cart state — runs after every update,
  // so individual actions below can stay simple state setters.
  useEffect(() => {
    localStorage.setItem("cart", JSON.stringify(cart));
  }, [cart]);

  // Which store a cart line belongs to. Same lookup Checkout uses.
  const storeOf = (item) => (item?.business || item?.businessId)?._id || null;

  // A cart holds items from ONE store only — OJA247 gives each vendor their
  // own storefront, it isn't a shared basket across sellers.
  // The store the cart currently belongs to (null when empty).
  const cartStore = useMemo(() => {
    const first = cart[0];
    if (!first) return null;
    const b = first.business || first.businessId;
    return { _id: b?._id || null, name: b?.name || "another store" };
  }, [cart]);

  // `business` should be passed whenever available — it's used at checkout
  // to calculate delivery fees. Expected shape:
  // { _id, name, location, deliveryFeeInState, deliveryFeeOutState }
  // Returns { ok: true } when added, or { ok: false, reason: "other-store",
  // currentStoreName } when the cart already holds another store's items
  // (nothing is changed — the caller decides whether to start a new cart).
  const addToCart = (product, business = null) => {
    const incomingStore = business?._id || (product.business || product.businessId)?._id || null;

    if (cart.length > 0 && String(storeOf(cart[0]) || "") !== String(incomingStore || "")) {
      return { ok: false, reason: "other-store", currentStoreName: cartStore?.name };
    }

    setCart((prev) => {
      const existing = prev.find((item) => item._id === product._id);

      if (existing) {
        return prev.map((item) =>
          item._id === product._id
            ? { ...item, quantity: item.quantity + 1 }
            : item
        );
      }

      return [...prev, { ...product, business, quantity: 1 }];
    });
    return { ok: true };
  };

  // Empties the cart and starts a new one with this item — used after the
  // customer agrees to switch stores.
  const startNewCartWith = (product, business = null) => {
    setCart([{ ...product, business, quantity: 1 }]);
  };

  const removeFromCart = (productId) => {
    setCart((prev) => prev.filter((item) => item._id !== productId));
  };

  // delta is typically +1 or -1 (from the +/- buttons in CartPage).
  // Quantity is clamped to a minimum of 1 — use removeFromCart to delete an item.
  const updateQuantity = (productId, delta) => {
    setCart((prev) =>
      prev.map((item) =>
        item._id === productId
          ? { ...item, quantity: Math.max(1, item.quantity + delta) }
          : item
      )
    );
  };

  const clearCart = () => {
    setCart([]);
  };

  const subtotal = useMemo(
    () =>
      cart.reduce(
        (sum, item) => sum + Number(item.price || 0) * item.quantity,
        0
      ),
    [cart]
  );

  const itemCount = useMemo(
    () => cart.reduce((count, item) => count + item.quantity, 0),
    [cart]
  );

  return (
    <CartContext.Provider
      value={{
        cart,
        cartItems: cart, // alias — CartPage/Checkout destructure `cartItems`
        addToCart,
        startNewCartWith,
        cartStore,
        removeFromCart,
        updateQuantity,
        clearCart,
        subtotal,
        itemCount,
      }}
    >
      {children}
    </CartContext.Provider>
  );
}

export function useCart() {
  const context = useContext(CartContext);
  if (!context) {
    throw new Error("useCart must be used within a CartProvider");
  }
  return context;
}