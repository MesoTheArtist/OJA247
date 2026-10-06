import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "./index.css";
import App from "./App.jsx";
import { AuthProvider } from "./context/AuthContext";
import { CartProvider } from "./context/CartContext";
import { DialogProvider } from "./components/DialogProvider";

createRoot(document.getElementById("root")).render(
  <StrictMode>
    <AuthProvider>
      <CartProvider>
        <DialogProvider>
          <App />
        </DialogProvider>
      </CartProvider>
    </AuthProvider>
  </StrictMode>
);