import React from "react";
import LegalLayout from "../components/LegalLayout";
import termsText from "../content/legal/terms.md?raw";
import vendorTermsText from "../content/legal/vendor-terms.md?raw";
import privacyText from "../content/legal/privacy.md?raw";
import deliveryText from "../content/legal/delivery.md?raw";
import prohibitedText from "../content/legal/prohibited-items.md?raw";
import helpText from "../content/legal/help.md?raw";

// The wording lives in src/content/legal/*.md. Edit those files (or paste in
// revised text from a lawyer) and update the date here when you do.
const UPDATED = "9 October 2026";

export const TermsPage = () => (
  <LegalLayout title="Terms & Conditions" updated={UPDATED} content={termsText} />
);

export const VendorTermsPage = () => (
  <LegalLayout
    title="Seller Terms"
    subtitle="For businesses that sell on OJA247."
    updated={UPDATED}
    content={vendorTermsText}
  />
);

export const ProhibitedItemsPage = () => (
  <LegalLayout
    title="Prohibited Items"
    subtitle="What may not be sold on OJA247."
    updated={UPDATED}
    content={prohibitedText}
  />
);

export const PrivacyPage = () => (
  <LegalLayout title="Privacy Policy" updated={UPDATED} content={privacyText} />
);

export const DeliveryPage = () => (
  <LegalLayout title="Delivery & Payment Information" updated={UPDATED} content={deliveryText} />
);

export const HelpPage = () => (
  <LegalLayout title="Help Center" content={helpText} />
);