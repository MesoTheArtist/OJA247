import React, { useEffect, useRef, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { Eye, EyeOff, Check } from "lucide-react";
import Logo from "../assets/OJA247 VX1.png";

// Registration is three short steps instead of one 16-field page. All the
// data still lives in a single formData object, so going back never loses
// anything, and the same register() call fires at the end.
const STEPS = [
  { n: 1, label: "Account", title: "Create your account", hint: "You'll use this to log in to your dashboard." },
  { n: 2, label: "Business", title: "About your business", hint: "This is what customers see on your store." },
  { n: 3, label: "Stand out", title: "Make your store stand out", hint: "All optional. You can change your logo and banner later from your dashboard." },
];

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const inputClass =
  "w-full p-3 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-green-500 text-sm sm:text-base";
const labelClass = "block text-sm font-semibold text-gray-700 mb-2";

const BusinessForm = () => {
  const navigate = useNavigate();
  const { register } = useAuth();
  const [searchParams] = useSearchParams();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [step, setStep] = useState(1);
  const cardRef = useRef(null);

  const [formData, setFormData] = useState({
    // Auth fields
    email: "",
    password: "",
    confirmPassword: "",
    // Pre-filled from a shared referral link (?ref=CODE), but editable —
    // covers both "clicked a link" and "someone told me a code" cases
    referralCodeUsed: searchParams.get("ref") || "",

    // Business fields
    name: "",
    description: "",
    category: "",
    location: "",
    contact: "",
    logo: "",
    banner: "",
    socialLinks: {
      facebook: "",
      instagram: "",
      twitter: "",
      website: "",
    },
    highlights: [],
  });

  const [highlightInput, setHighlightInput] = useState("");
  const [logoPreview, setLogoPreview] = useState("");
  const [bannerPreview, setBannerPreview] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);

  // Bring the top of the card back into view whenever the step changes or an
  // error appears — on a phone the Continue button is far below the banner.
  useEffect(() => {
    cardRef.current?.scrollIntoView?.({ behavior: "smooth", block: "start" });
  }, [step, error]);

  const handleChange = (e) => {
    const { name, value } = e.target;
    if (name.includes("socialLinks.")) {
      const key = name.split(".")[1];
      setFormData((prev) => ({
        ...prev,
        socialLinks: { ...prev.socialLinks, [key]: value },
      }));
    } else {
      setFormData({ ...formData, [name]: value });
    }
  };

  const handleImageUpload = (e) => {
    const { name, files } = e.target;
    const file = files && files[0];
    if (!file) return;

    if (!file.type.startsWith("image/")) {
      setError("Please select a valid image file for your logo or banner.");
      return;
    }

    if (file.size > 5 * 1024 * 1024) {
      setError(
        "Please upload an image smaller than 5MB so registration can complete successfully.",
      );
      return;
    }

    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result;
      setFormData((prev) => ({ ...prev, [name]: result }));
      if (name === "logo") setLogoPreview(result);
      if (name === "banner") setBannerPreview(result);
      setError("");
    };
    reader.readAsDataURL(file);
  };

  const removeImage = (field) => {
    setFormData((prev) => ({ ...prev, [field]: "" }));
    if (field === "logo") setLogoPreview("");
    if (field === "banner") setBannerPreview("");
  };

  const addHighlight = () => {
    if (highlightInput.trim()) {
      setFormData({
        ...formData,
        highlights: [...formData.highlights, highlightInput.trim()],
      });
      setHighlightInput("");
    }
  };

  const removeHighlight = (index) => {
    setFormData({
      ...formData,
      highlights: formData.highlights.filter((_, i) => i !== index),
    });
  };

  // Returns an error message for a step, or "" when it's complete. Step 3 is
  // all optional.
  const validateStep = (n) => {
    if (n === 1) {
      if (!EMAIL_RE.test(formData.email.trim())) return "Please enter a valid email address.";
      if (formData.password.length < 6) return "Password must be at least 6 characters!";
      if (formData.password !== formData.confirmPassword) return "Passwords do not match!";
    }
    if (n === 2) {
      if (!formData.name.trim()) return "Please enter your business name.";
      if (!formData.description.trim()) return "Please add a short description of your business.";
      if (!formData.category) return "Please choose a category.";
      if (!formData.location.trim()) return "Please enter your location.";
      if (!formData.contact.trim()) return "Please enter a contact number.";
    }
    return "";
  };

  const goNext = () => {
    const problem = validateStep(step);
    if (problem) {
      setError(problem);
      return;
    }
    setError("");
    setStep((s) => Math.min(STEPS.length, s + 1));
  };

  const goBack = () => {
    setError("");
    setStep((s) => Math.max(1, s - 1));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();

    // On steps 1-2 the main button (and Enter in a field) is "Continue", not
    // "register" — never register half a form.
    if (step < STEPS.length) {
      goNext();
      return;
    }

    setError("");

    // Final check of everything, sending the person back to whichever step
    // is actually incomplete.
    for (const n of [1, 2]) {
      const problem = validateStep(n);
      if (problem) {
        setError(problem);
        setStep(n);
        return;
      }
    }

    setLoading(true);

    const businessData = {
      name: formData.name,
      description: formData.description,
      category: formData.category,
      location: formData.location,
      contact: formData.contact,
      logo: formData.logo,
      banner: formData.banner,
      socialLinks: formData.socialLinks,
      highlights: formData.highlights,
    };

    const result = await register(
      formData.email,
      formData.password,
      businessData,
      formData.referralCodeUsed.trim() || null,
    );

    if (result.success) {
      alert("Business registered successfully!");
      navigate(`/dashboard/${result.business._id}`);
    } else {
      setError(result.message);
      // "email already registered" and referral-code problems belong to step 1.
      if (/email|referral/i.test(result.message || "")) setStep(1);
    }

    setLoading(false);
  };

  const current = STEPS[step - 1];

  return (
    <div className="min-h-screen bg-gray-50 py-6 sm:py-12">
      <div className="max-w-3xl mx-auto px-4 sm:px-6">
        <div ref={cardRef} className="bg-white rounded-2xl shadow-lg p-4 sm:p-8 scroll-mt-4">
          <div className="flex justify-center mb-6">
            <img src={Logo} alt="OJA247" className="w-28" />
          </div>
          <h2 className="text-2xl sm:text-3xl font-bold mb-2 bg-gradient-to-r from-green-600 to-yellow-600 bg-clip-text text-transparent">
            Register Your Business
          </h2>
          <p className="text-sm sm:text-base text-gray-600 mb-6">
            Join OJA247 and reach thousands of customers
          </p>

          {/* Progress */}
          <ol className="grid grid-cols-3 gap-2 mb-8" aria-label="Registration progress">
            {STEPS.map((s) => {
              const done = s.n < step;
              const isCurrent = s.n === step;
              return (
                <li key={s.n} className="flex flex-col items-center text-center min-w-0">
                  <div className="flex items-center w-full">
                    <span className={`flex-1 h-0.5 ${s.n === 1 ? "opacity-0" : done || isCurrent ? "bg-green-600" : "bg-gray-200"}`} />
                    <button
                      type="button"
                      onClick={() => done && setStep(s.n)}
                      disabled={!done}
                      aria-label={done ? `Back to step ${s.n}: ${s.label}` : `Step ${s.n}: ${s.label}`}
                      aria-current={isCurrent ? "step" : undefined}
                      className={`w-8 h-8 shrink-0 rounded-full flex items-center justify-center text-sm font-bold transition ${
                        done
                          ? "bg-green-600 text-white hover:bg-green-700"
                          : isCurrent
                          ? "bg-green-600 text-white ring-4 ring-green-100"
                          : "bg-gray-100 text-gray-400"
                      }`}
                    >
                      {done ? <Check size={16} /> : s.n}
                    </button>
                    <span className={`flex-1 h-0.5 ${s.n === STEPS.length ? "opacity-0" : done ? "bg-green-600" : "bg-gray-200"}`} />
                  </div>
                  <span className={`mt-2 text-xs sm:text-sm font-medium truncate max-w-full ${isCurrent ? "text-green-700" : "text-gray-500"}`}>
                    {s.label}
                  </span>
                </li>
              );
            })}
          </ol>

          {error && (
            <div role="alert" className="mb-6 p-4 bg-red-50 border border-red-200 rounded-xl text-red-600 text-sm break-words">
              {error}
            </div>
          )}

          <form onSubmit={handleSubmit} noValidate className="space-y-6">
            <div>
              <h3 className="text-lg sm:text-xl font-bold text-gray-900">{current.title}</h3>
              <p className="text-sm text-gray-500 mt-1">{current.hint}</p>
            </div>

            {/* Step 1: account */}
            {step === 1 && (
              <div className="space-y-4">
                <div>
                  <label className={labelClass}>Email Address *</label>
                  <input
                    type="email"
                    name="email"
                    autoComplete="email"
                    placeholder="your@email.com"
                    value={formData.email}
                    onChange={handleChange}
                    className={inputClass}
                    required
                  />
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className={labelClass}>Password *</label>
                    <div className="relative">
                      <input
                        type={showPassword ? "text" : "password"}
                        name="password"
                        autoComplete="new-password"
                        placeholder="••••••••"
                        value={formData.password}
                        onChange={handleChange}
                        className={`${inputClass} pr-11`}
                        required
                        minLength={6}
                      />
                      <button
                        type="button"
                        onClick={() => setShowPassword((prev) => !prev)}
                        className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-500 hover:text-gray-700"
                        aria-label={showPassword ? "Hide password" : "Show password"}
                        tabIndex={-1}
                      >
                        {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                      </button>
                    </div>
                  </div>

                  <div>
                    <label className={labelClass}>Confirm Password *</label>
                    <div className="relative">
                      <input
                        type={showConfirmPassword ? "text" : "password"}
                        name="confirmPassword"
                        autoComplete="new-password"
                        placeholder="••••••••"
                        value={formData.confirmPassword}
                        onChange={handleChange}
                        className={`${inputClass} pr-11`}
                        required
                      />
                      <button
                        type="button"
                        onClick={() => setShowConfirmPassword((prev) => !prev)}
                        className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-500 hover:text-gray-700"
                        aria-label={showConfirmPassword ? "Hide password" : "Show password"}
                        tabIndex={-1}
                      >
                        {showConfirmPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                      </button>
                    </div>
                  </div>
                </div>

                <div>
                  <label className={labelClass}>Referral Code (Optional)</label>
                  <input
                    type="text"
                    name="referralCodeUsed"
                    placeholder="e.g., MKT-A1B2C3"
                    value={formData.referralCodeUsed}
                    onChange={handleChange}
                    className={`${inputClass} uppercase`}
                  />
                  <p className="text-xs text-gray-500 mt-1">
                    Were you referred by a marketer or another business? Enter their code here.
                  </p>
                </div>
              </div>
            )}

            {/* Step 2: business */}
            {step === 2 && (
              <div className="space-y-4">
                <div>
                  <label className={labelClass}>Business Name *</label>
                  <input
                    type="text"
                    name="name"
                    placeholder="e.g., Mama Chinedu Kitchen"
                    value={formData.name}
                    onChange={handleChange}
                    className={inputClass}
                    required
                  />
                </div>

                <div>
                  <label className={labelClass}>Description *</label>
                  <textarea
                    name="description"
                    placeholder="Tell us about your business..."
                    value={formData.description}
                    onChange={handleChange}
                    rows="3"
                    className={inputClass}
                    required
                  />
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className={labelClass}>Category *</label>
                    <select
                      name="category"
                      value={formData.category}
                      onChange={handleChange}
                      className={inputClass}
                      required
                    >
                      <option value="">Select a category</option>
                      <option value="Food">Food & Drinks</option>
                      <option value="Fashion">Fashion</option>
                      <option value="Tech">Tech & Electronics</option>
                      <option value="Beauty">Beauty & Health</option>
                      <option value="Fitness">Fitness</option>
                      <option value="Groceries">Groceries</option>
                      <option value="Other">Other</option>
                    </select>
                  </div>

                  <div>
                    <label className={labelClass}>Location *</label>
                    <input
                      type="text"
                      name="location"
                      placeholder="e.g., Lagos"
                      value={formData.location}
                      onChange={handleChange}
                      className={inputClass}
                      required
                    />
                  </div>
                </div>

                <div>
                  <label className={labelClass}>Contact Number *</label>
                  <input
                    type="tel"
                    name="contact"
                    autoComplete="tel"
                    placeholder="e.g., +234 800 000 0000"
                    value={formData.contact}
                    onChange={handleChange}
                    className={inputClass}
                    required
                  />
                  <p className="text-xs text-gray-500 mt-1">WhatsApp number recommended</p>
                </div>
              </div>
            )}

            {/* Step 3: optional extras */}
            {step === 3 && (
              <div className="space-y-8">
                <div>
                  <h4 className="text-base font-bold text-gray-900 mb-3">Branding</h4>
              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-semibold text-gray-700 mb-2">
                    Logo Image
                  </label>
                  {logoPreview ? (
                    <div className="flex items-center gap-4">
                      <img
                        src={logoPreview}
                        alt="Logo preview"
                        className="w-16 h-16 sm:w-20 sm:h-20 object-cover rounded-lg border border-gray-300"
                      />
                      <button
                        type="button"
                        onClick={() => removeImage("logo")}
                        className="text-sm text-red-600 hover:text-red-700 font-medium"
                      >
                        Remove
                      </button>
                    </div>
                  ) : (
                    <input
                      type="file"
                      name="logo"
                      accept="image/*"
                      onChange={handleImageUpload}
                      className="w-full p-2 sm:p-3 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-green-500 text-xs sm:text-sm file:mr-2 sm:file:mr-4 file:py-1.5 sm:file:py-2 file:px-3 sm:file:px-4 file:rounded-lg file:border-0 file:bg-green-50 file:text-green-700 file:font-medium hover:file:bg-green-100"
                    />
                  )}
                </div>

                <div>
                  <label className="block text-sm font-semibold text-gray-700 mb-2">
                    Banner Image
                  </label>
                  {bannerPreview ? (
                    <div className="space-y-2">
                      <img
                        src={bannerPreview}
                        alt="Banner preview"
                        className="w-full h-28 sm:h-32 object-cover rounded-lg border border-gray-300"
                      />
                      <button
                        type="button"
                        onClick={() => removeImage("banner")}
                        className="text-sm text-red-600 hover:text-red-700 font-medium"
                      >
                        Remove
                      </button>
                    </div>
                  ) : (
                    <input
                      type="file"
                      name="banner"
                      accept="image/*"
                      onChange={handleImageUpload}
                      className="w-full p-2 sm:p-3 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-green-500 text-xs sm:text-sm file:mr-2 sm:file:mr-4 file:py-1.5 sm:file:py-2 file:px-3 sm:file:px-4 file:rounded-lg file:border-0 file:bg-green-50 file:text-green-700 file:font-medium hover:file:bg-green-100"
                    />
                  )}
                </div>
              </div>
                </div>

                <div>
                  <h4 className="text-base font-bold text-gray-900 mb-3">Social media</h4>
              <div className="space-y-4">
                <input
                  type="url"
                  name="socialLinks.facebook"
                  placeholder="Facebook URL"
                  value={formData.socialLinks.facebook}
                  onChange={handleChange}
                  className="w-full p-3 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-green-500 text-sm sm:text-base"
                />
                <input
                  type="url"
                  name="socialLinks.instagram"
                  placeholder="Instagram URL"
                  value={formData.socialLinks.instagram}
                  onChange={handleChange}
                  className="w-full p-3 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-green-500 text-sm sm:text-base"
                />
                <input
                  type="url"
                  name="socialLinks.twitter"
                  placeholder="Twitter URL"
                  value={formData.socialLinks.twitter}
                  onChange={handleChange}
                  className="w-full p-3 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-green-500 text-sm sm:text-base"
                />
                <input
                  type="url"
                  name="socialLinks.website"
                  placeholder="Website URL"
                  value={formData.socialLinks.website}
                  onChange={handleChange}
                  className="w-full p-3 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-green-500 text-sm sm:text-base"
                />
              </div>
                </div>

                <div>
                  <h4 className="text-base font-bold text-gray-900 mb-3">Business highlights</h4>
              <div className="flex flex-col sm:flex-row gap-2 mb-4">
                <input
                  type="text"
                  value={highlightInput}
                  onChange={(e) => setHighlightInput(e.target.value)}
                  placeholder="e.g., Fast Delivery, Affordable Prices"
                  className="flex-1 p-3 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-green-500 text-sm sm:text-base"
                  onKeyDown={(e) =>
                    e.key === "Enter" && (e.preventDefault(), addHighlight())
                  }
                />
                <button
                  type="button"
                  onClick={addHighlight}
                  className="w-full sm:w-auto px-6 py-3 bg-green-500 text-white rounded-lg hover:bg-green-600 font-medium transition-colors"
                >
                  Add
                </button>
              </div>

              {formData.highlights.length > 0 && (
                <div className="flex flex-wrap gap-2">
                  {formData.highlights.map((highlight, index) => (
                    <span
                      key={index}
                      className="inline-flex items-center gap-2 px-3 py-1.5 sm:px-4 sm:py-2 bg-green-100 text-green-700 rounded-full text-xs sm:text-sm"
                    >
                      {highlight}
                      <button
                        type="button"
                        onClick={() => removeHighlight(index)}
                        className="text-green-600 hover:text-green-800 font-bold"
                      >
                        ×
                      </button>
                    </span>
                  ))}
                </div>
              )}
                </div>
              </div>
            )}

            {/* Navigation. Both the Continue and Register buttons submit the
                form, so pressing Enter in a field does the same thing as
                clicking the main button; handleSubmit decides whether that
                means "next step" or "register". */}
            <div className="flex flex-col-reverse sm:flex-row gap-3 sm:gap-4">
              {step === 1 ? (
                <button
                  key="cancel"
                  type="button"
                  onClick={() => navigate("/")}
                  className="w-full sm:w-auto px-6 py-3 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 font-medium transition-colors"
                >
                  Cancel
                </button>
              ) : (
                <button
                  key="back"
                  type="button"
                  onClick={goBack}
                  disabled={loading}
                  className="w-full sm:w-auto px-6 py-3 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 font-medium transition-colors disabled:opacity-60"
                >
                  Back
                </button>
              )}

              {step < STEPS.length ? (
                <button
                  key="continue"
                  type="submit"
                  className="w-full flex-1 py-3 rounded-lg font-bold text-white bg-gradient-to-r from-green-600 to-emerald-600 hover:from-green-700 hover:to-emerald-700 shadow-lg transition-colors"
                >
                  Continue
                </button>
              ) : (
                <button
                  key="submit"
                  type="submit"
                  disabled={loading}
                  className={`w-full flex-1 py-3 rounded-lg font-bold text-white transition-colors ${
                    loading
                      ? "bg-gray-400 cursor-not-allowed"
                      : "bg-gradient-to-r from-green-600 to-emerald-600 hover:from-green-700 hover:to-emerald-700"
                  } shadow-lg`}
                >
                  {loading ? "Registering..." : "Register Business"}
                </button>
              )}
            </div>

            {step === 1 && (
              <div className="text-center pt-4 border-t">
                <p className="text-xs sm:text-sm text-gray-600">
                  Already have an account?{" "}
                  <button
                    type="button"
                    onClick={() => navigate("/login")}
                    className="text-green-600 font-semibold hover:text-green-700"
                  >
                    Login here
                  </button>
                </p>
              </div>
            )}
          </form>
        </div>
      </div>
    </div>
  );
};

export default BusinessForm;  