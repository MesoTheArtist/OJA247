import { BrowserRouter as Router, Routes, Route } from "react-router-dom";
import PageWrapper from "./components/PageWrapper.jsx";
import ScrollToTop from "./components/ScrollToTop.jsx";
import Navbar from "./components/Navbar";
import Footer from "./components/Footer";
import LandingPage from "./pages/LandingPage";
import ExplorePage from "./pages/ExplorePage";
import Products from "./pages/Products";
import ProductDetails from "./pages/ProductDetails";
import BusinessForm from "./pages/BusinessForm";
import BusinessDetails from "./pages/BusinessDetails";
import BusinessDashboard from "./pages/BusinessDashboard";
import LoginPage from "./pages/LoginPage";
import ProtectedRoute from "./components/ProtectedRoute";
import AdminDashboard from "./pages/AdminDashboard";
import About from "./pages/About";
import CartPage from "./pages/CartPage";
import Checkout from "./pages/Checkout";
import PaymentStatusPage from "./pages/PaymentStatusPage";
import MarketerRegisterForm from "./pages/MarketerRegisterForm";
import MarketerLoginPage from "./pages/MarketerLoginPage";
import MarketerDashboard from "./pages/MarketerDashboard";
import ForgotPasswordForm from "./pages/ForgotPasswordForm";
import ResetPasswordForm from "./pages/ResetPasswordForm";
import CustomerAuthPage from "./pages/CustomerAuthPage";
import OrderHistoryPage from "./pages/OrderHistoryPage";
import ReportProblemPage from "./pages/ReportProblemPage";
import JoinPage from "./pages/JoinPage";
import ConfirmReceiptPage from "./pages/ConfirmReceiptPage";
import UnsubscribePage from "./pages/UnsubscribePage";
import VerifyEmailPage from "./pages/VerifyEmailPage";

function App() {
  return (
    <Router>
      <Navbar />
      <ScrollToTop />
      <PageWrapper>
        <Routes>
          <Route path="/" element={<LandingPage />} />
          <Route path="/explore" element={<ExplorePage />} />
          <Route path="/products" element={<Products />} />
          <Route path="/product/:id" element={<ProductDetails />} />
          <Route path="/about" element={<About />} />
          <Route path="/business/:id" element={<BusinessDetails />} />
          <Route path="/cart" element={<CartPage />} />
          <Route path="/checkout" element={<Checkout />} />
          <Route path="/payment-status" element={<PaymentStatusPage />} />
          {/* Auth Routes */}
          <Route path="/login" element={<LoginPage />} />
          <Route path="/business-form" element={<BusinessForm />} />
          <Route path="/register-marketer" element={<MarketerRegisterForm />} />
          <Route path="/marketer-login" element={<MarketerLoginPage />} />
          <Route path="/marketer-dashboard" element={<MarketerDashboard />} />
          <Route path="/forgot-password" element={<ForgotPasswordForm type="vendor" />} />
          <Route path="/marketer-forgot-password" element={<ForgotPasswordForm type="marketer" />} />
          <Route path="/customer-forgot-password" element={<ForgotPasswordForm type="customer" />} />
          <Route path="/reset-password" element={<ResetPasswordForm />} />
          <Route path="/account" element={<CustomerAuthPage />} />
          <Route path="/orders" element={<OrderHistoryPage />} />
          <Route path="/report-problem" element={<ReportProblemPage />} />
          <Route path="/join" element={<JoinPage />} />
          <Route path="/verify-email" element={<VerifyEmailPage />} />
          <Route path="/confirm-receipt" element={<ConfirmReceiptPage />} />
          <Route path="/unsubscribe" element={<UnsubscribePage />} />
          {/* Protected Routes */}
          <Route
            path="/dashboard/:businessId"
            element={
              <ProtectedRoute>
                <BusinessDashboard />
              </ProtectedRoute>
            }
          />
          <Route
            path="/admin"
            element={
              <ProtectedRoute adminOnly>
                <AdminDashboard />
              </ProtectedRoute>
            }
          />
        </Routes>
      </PageWrapper>
      <Footer />
    </Router>
  );
}

export default App;