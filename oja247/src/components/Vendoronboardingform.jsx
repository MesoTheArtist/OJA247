import React, { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import axiosInstance from '../services/api';
import { useDialog } from "./DialogProvider";

// Combined vendor onboarding form: payout info + KYC docs in one flow.
// Basic tier (NIN + bank match) is required to submit.
// Verified tier fields (CAC + address proof) are optional here — a vendor
// can list immediately on Basic and upgrade within the 30-day window.

const styles = `
.vof-card {
  max-width: 560px;
  width: 100%;
  box-sizing: border-box;
  overflow-wrap: anywhere;
  margin: 0 auto;
  padding: 2rem;
  background: #ffffff;
  border-radius: 12px;
  border: 1px solid #e5ece6;
  font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
  color: #16332b;
}

.vof-header h1 {
  font-size: 1.5rem;
  margin: 0 0 0.25rem;
  color: #14532d;
}

.vof-header p {
  margin: 0 0 1.5rem;
  color: #5c6560;
  font-size: 0.95rem;
}

.vof-card fieldset {
  border: none;
  min-width: 0;
  padding: 0;
  margin: 0 0 1.75rem;
}

.vof-card legend {
  font-size: 0.8rem;
  font-weight: 600;
  letter-spacing: 0.04em;
  text-transform: uppercase;
  color: #16a34a;
  padding: 0 0 0.75rem;
  margin: 0;
  width: 100%;
  border-bottom: 2px solid #f2c94c;
}

.vof-field {
  display: block;
  margin-bottom: 1rem;
}

.vof-field span {
  display: block;
  font-size: 0.85rem;
  font-weight: 500;
  margin-bottom: 0.35rem;
  color: #33403a;
}

.vof-field em {
  font-style: normal;
  color: #8b9490;
  font-weight: 400;
}

.vof-field input[type="text"],
.vof-field input[type="email"],
.vof-field input[type="tel"],
.vof-field select {
  width: 100%;
  padding: 0.65rem 0.75rem;
  border: 1px solid #d6e0d8;
  border-radius: 8px;
  font-size: 0.95rem;
  background: #fbfdfc;
  box-sizing: border-box;
  transition: border-color 0.15s ease, box-shadow 0.15s ease;
}

.vof-field input:focus,
.vof-field select:focus {
  outline: none;
  border-color: #16a34a;
  box-shadow: 0 0 0 3px rgba(242, 201, 76, 0.35);
}

.vof-field input[type="file"] {
  font-size: 0.85rem;
  width: 100%;
  max-width: 100%;
  box-sizing: border-box;
}

.vof-row {
  display: grid;
  grid-template-columns: minmax(0, 1fr) minmax(0, 1fr);
  gap: 1rem;
}

@media (max-width: 480px) {
  .vof-row {
    grid-template-columns: minmax(0, 1fr);
  }
  .vof-card {
    padding: 1.1rem;
  }
}

.vof-skeleton {
  height: 42px;
  border-radius: 8px;
  background: linear-gradient(90deg, #eaf3ec 25%, #f7fbf4 37%, #eaf3ec 63%);
  background-size: 400% 100%;
  animation: vof-shimmer 1.4s ease infinite;
}

@keyframes vof-shimmer {
  0% { background-position: 100% 0; }
  100% { background-position: 0 0; }
}

.vof-account-status {
  min-height: 1.2rem;
  font-size: 0.85rem;
  margin-top: -0.5rem;
}

.vof-muted {
  color: #8b9490;
}

.vof-confirmed {
  color: #16a34a;
  font-weight: 500;
}

.vof-error {
  color: #b3261e;
}

.vof-submit-error {
  margin-bottom: 1rem;
}

.vof-tier-note {
  font-size: 0.85rem;
  color: #6b5a12;
  background: #fdf6da;
  border: 1px solid #f2c94c;
  border-radius: 8px;
  padding: 0.75rem;
  margin: 0 0 1rem;
}

.vof-filename {
  display: block;
  word-break: break-all;
  font-size: 0.8rem;
  color: #5c6560;
  margin-top: 0.25rem;
}

.vof-submit {
  width: 100%;
  padding: 0.85rem;
  background: #16a34a;
  color: #ffffff;
  border: none;
  border-radius: 8px;
  font-size: 1rem;
  font-weight: 600;
  cursor: pointer;
  transition: background 0.15s ease;
}

.vof-submit:hover:not(:disabled) {
  background: #15803d;
}

.vof-submit:focus-visible {
  outline: none;
  box-shadow: 0 0 0 3px rgba(242, 201, 76, 0.5);
}

.vof-submit:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}

.vof-success h2 {
  color: #14532d;
  margin-top: 0;
}

.vof-success::before {
  content: "";
  display: block;
  height: 3px;
  width: 48px;
  background: #f2c94c;
  border-radius: 2px;
  margin-bottom: 0.75rem;
}

.vof-note {
  font-size: 0.9rem;
  color: #16332b;
  background: #eef7f1;
  border-radius: 8px;
  padding: 0.75rem;
}

.vof-steps {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  margin-bottom: 1.5rem;
}

.vof-step-dot {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 1.75rem;
  height: 1.75rem;
  border-radius: 50%;
  font-size: 0.8rem;
  font-weight: 600;
  flex-shrink: 0;
  background: #eef2ef;
  color: #8b9490;
}

.vof-step-dot.vof-step-done {
  background: #16a34a;
  color: #ffffff;
}

.vof-step-dot.vof-step-current {
  background: #f2c94c;
  color: #5c4a06;
}

.vof-step-line {
  flex: 1;
  height: 2px;
  background: #eef2ef;
}

.vof-step-line.vof-step-done {
  background: #16a34a;
}

.vof-step-label {
  font-size: 0.8rem;
  font-weight: 600;
  color: #5c6560;
  margin: -0.75rem 0 1.5rem;
}

.vof-step-nav {
  display: flex;
  gap: 0.75rem;
}

.vof-step-nav .vof-submit {
  flex: 1;
}

.vof-btn-back {
  flex: 1;
  padding: 0.85rem;
  background: #ffffff;
  color: #33403a;
  border: 1px solid #d6e0d8;
  border-radius: 8px;
  font-size: 1rem;
  font-weight: 600;
  cursor: pointer;
  transition: background 0.15s ease;
}

.vof-btn-back:hover {
  background: #f7faf8;
}
`;

export default function VendorOnboardingForm({ onSubmitted, existing = null } = {}) {
  const { notify, prompt } = useDialog();
  const { business, isAuthenticated } = useAuth();

  const [banks, setBanks] = useState([]);
  const [banksLoading, setBanksLoading] = useState(true);
  const [banksError, setBanksError] = useState(null);

  const [form, setForm] = useState({
    business_name: '',
    contact_email: '',
    contact_phone: '',
    contact_whatsapp: '',
    bank_code: '',
    account_number: '',
  });

  const [accountName, setAccountName] = useState('');
  const [resolvingAccount, setResolvingAccount] = useState(false);
  const [accountError, setAccountError] = useState(null);

  const [nin, setNin] = useState('');
  const [cacFile, setCacFile] = useState(null);
  const [addressProofFile, setAddressProofFile] = useState(null);
  const [selfieFile, setSelfieFile] = useState(null);

  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState(null);
  const [result, setResult] = useState(null);

  // A vendor who has already submitted sees a summary first, not a blank
  // form; "Update details" opens the form with everything prefilled so
  // adding a document never means retyping what they already gave us.
  const [editing, setEditing] = useState(false);

  // Three steps, one per fieldset below — About / Get paid / Verify. Reset
  // to the first step whenever the form (re)opens for a fresh or repeat
  // submission, so re-editing never starts halfway through.
  const [step, setStep] = useState(0);
  const [stepError, setStepError] = useState(null);
  const STEPS = ['About your business', 'Get paid', 'Verify your identity'];

  // What has to be true before leaving each step. Doesn't duplicate
  // handleSubmit's own checks — those still run as the final safety net —
  // this just stops someone advancing past a step with something missing,
  // so a problem shows up next to the field that needs it instead of as a
  // generic error after pressing submit on the last screen.
  function stepValidationError(i) {
    if (i === 0) {
      if (!form.business_name.trim()) return 'Add your business name.';
      if (!form.contact_email.trim()) return 'Add a contact email.';
      if (!form.contact_phone.trim()) return 'Add a contact phone number.';
      return null;
    }
    if (i === 1) {
      if (!form.bank_code) return 'Select your bank.';
      if (form.account_number.length !== 10) return 'Enter your 10-digit account number.';
      if (resolvingAccount) return 'Still checking your account — give it a second.';
      if (!accountName) return accountError || 'We need to confirm this account before continuing.';
      return null;
    }
    if (i === 2) {
      if (!nin) return 'NIN is required to list on OJA247.';
      return null;
    }
    return null;
  }

  function goNext() {
    const problem = stepValidationError(step);
    if (problem) {
      setStepError(problem);
      return;
    }
    setStepError(null);
    setStep((s) => Math.min(s + 1, STEPS.length - 1));
  }

  function goBack() {
    setStepError(null);
    setStep((s) => Math.max(s - 1, 0));
  }

  useEffect(() => {
    if (!existing) return;
    setForm({
      business_name: existing.businessName || '',
      contact_email: existing.contactEmail || '',
      contact_phone: existing.contactPhone || '',
      contact_whatsapp:
        existing.contactWhatsapp && existing.contactWhatsapp !== existing.contactPhone
          ? existing.contactWhatsapp
          : '',
      bank_code: existing.bankCode || '',
      account_number: existing.accountNumber || '',
    });
    setNin(existing.nin || '');
  }, [existing]);

  // Load banks for the dropdown
  useEffect(() => {
    let cancelled = false;
    setBanksLoading(true);
    axiosInstance
      .get('/api/vendors/banks')
      .then(({ data: res }) => {
        if (cancelled) return;
        if (res.status) {
          setBanks(res.data);
        } else {
          setBanksError(res.message || 'Could not load banks.');
        }
      })
      .catch(() => {
        if (!cancelled) setBanksError('Could not load banks. Check your connection.');
      })
      .finally(() => {
        if (!cancelled) setBanksLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  // Auto-resolve account name once both bank + full account number are entered
  useEffect(() => {
    setAccountName('');
    setAccountError(null);

    if (!form.bank_code || form.account_number.length !== 10) return;

    let cancelled = false;
    setResolvingAccount(true);

    const timeout = setTimeout(() => {
      axiosInstance
        .get('/api/vendors/resolve-account', {
          params: { account_number: form.account_number, bank_code: form.bank_code },
        })
        .then(({ data: res }) => {
          if (cancelled) return;
          if (res.status) {
            setAccountName(res.data.account_name);
          } else {
            setAccountError(res.message || 'Could not verify this account.');
          }
        })
        .catch(() => {
          if (!cancelled) setAccountError('Could not verify this account.');
        })
        .finally(() => {
          if (!cancelled) setResolvingAccount(false);
        });
    }, 500); // debounce

    return () => {
      cancelled = true;
      clearTimeout(timeout);
    };
  }, [form.bank_code, form.account_number]);

  function updateField(field, value) {
    setForm((prev) => ({ ...prev, [field]: value }));
  }

  function handleFileChange(setter, maxSizeMB = 5) {
    return (e) => {
      const file = e.target.files?.[0];
      if (!file) return setter(null);
      if (file.size > maxSizeMB * 1024 * 1024) {
        notify({ title: "File too big", message: `Max size is ${maxSizeMB}MB.`, tone: "error" });
        e.target.value = '';
        return setter(null);
      }
      setter(file);
    };
  }

  async function handleSubmit(e, currentPassword) {
    e?.preventDefault?.();
    setSubmitError(null);

    // Belt-and-braces: goNext already stops anyone reaching the last step
    // with step 0/1 incomplete, but handleSubmit can still fire directly
    // (e.g. pressing Enter in a field), so re-check everything, not just
    // this step, and send them back to whichever step actually has the
    // problem rather than a generic message.
    for (let i = 0; i < STEPS.length; i += 1) {
      const problem = stepValidationError(i);
      if (problem) {
        setStep(i);
        setStepError(problem);
        return;
      }
    }

    setSubmitting(true);

    const selectedBank = banks.find((b) => b.code === form.bank_code);
    const payload = new FormData();
    payload.append('business_id', business._id);
    payload.append('business_name', form.business_name);
    payload.append('contact_email', form.contact_email);
    payload.append('contact_phone', form.contact_phone);
    payload.append('contact_whatsapp', form.contact_whatsapp || form.contact_phone);
    payload.append('bank_code', form.bank_code);
    payload.append('bank_name', selectedBank?.name || '');
    payload.append('account_number', form.account_number);
    payload.append('account_name', accountName);
    payload.append('nin', nin);
    if (cacFile) payload.append('cac_document', cacFile);
    if (addressProofFile) payload.append('address_proof', addressProofFile);
    if (selfieFile) payload.append('selfie', selfieFile);
    if (currentPassword) payload.append('current_password', currentPassword);

    try {
      const { data } = await axiosInstance.post('/api/vendors', payload, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });

      if (!data.status) {
        throw new Error(data.message || 'Something went wrong.');
      }

      setResult(data.data);
      onSubmitted?.(data.data);
    } catch (err) {
      const code = err.response?.data?.code;
      if (code === 'PASSWORD_REQUIRED' || code === 'PASSWORD_INCORRECT') {
        // Changing the payout bank account needs the password again.
        setSubmitting(false);
        const typed = await prompt({
          title: 'Confirm your password',
          message:
            code === 'PASSWORD_INCORRECT'
              ? "That password wasn't right. Enter it again to change your bank details."
              : 'For your security, enter your password to change your bank details.',
          placeholder: 'Your password',
          inputType: 'password',
          confirmLabel: 'Confirm',
        });
        if (typed) {
          await handleSubmit(null, typed);
          return;
        }
        setSubmitError('Your bank details were not changed because no password was entered.');
        return;
      }
      setSubmitError(err.response?.data?.message || err.message);
    } finally {
      setSubmitting(false);
    }
  }

  if (!isAuthenticated || !business) {
    return (
      <div className="vof-card vof-success">
        <style>{styles}</style>
        <h2>Log in to set up your store</h2>
        <p>Vendor onboarding is tied to your business account — log in (or register a business) first.</p>
      </div>
    );
  }

  if (result) {
    return (
      <div className="vof-card vof-success">
        <style>{styles}</style>
        <h2>You're in.</h2>
        <p>
          Your store is live on the <strong>{result.verificationTier === 'verified' ? 'Verified' : 'Basic'}</strong>{' '}
          tier.
        </p>
        {result.verificationTier === 'basic' && (
          <p className="vof-note">
            Add your CAC document, address proof, and a selfie any time to move up to Verified — it unlocks
            the Verified badge on your storefront. We'll send the occasional reminder until it's done.
          </p>
        )}
      </div>
    );
  }

  if (existing && !editing) {
    const tier = existing.verificationTier;
    const docs = [
      { label: 'CAC document', done: Boolean(existing.cacDocumentUrl) },
      { label: 'Proof of address', done: Boolean(existing.addressProofUrl) },
      { label: 'Selfie', done: Boolean(existing.selfieUrl) },
    ];
    const missingDocs = docs.filter((d) => !d.done);
    return (
      <div className="vof-card">
        <style>{styles}</style>
        <header className="vof-header">
          <h1>Your payout &amp; verification details</h1>
          <p>
            Tier: <strong style={{ textTransform: 'capitalize' }}>{tier}</strong> · Review:{' '}
            <strong style={{ textTransform: 'capitalize' }}>{existing.reviewStatus}</strong>
          </p>
        </header>

        <fieldset>
          <legend>Payout account</legend>
          <p>
            {existing.bankName || 'Bank'} · ****{String(existing.accountNumber || '').slice(-4)}
            {existing.accountName ? ` · ${existing.accountName}` : ''}
          </p>
          {existing.payoutHold && (
            <p className="vof-error">Payouts are on hold pending admin review of your bank change.</p>
          )}
        </fieldset>

        <fieldset>
          <legend>Documents</legend>
          {docs.map((d) => (
            <p key={d.label}>
              {d.done ? '✓' : '○'} {d.label} {d.done ? '' : '(not added yet)'}
            </p>
          ))}
          {missingDocs.length > 0 && (
            <p className="vof-tier-note">
              Add the missing document{missingDocs.length > 1 ? 's' : ''} to reach <strong>Verified</strong>.
            </p>
          )}
        </fieldset>

        <button type="button" className="vof-submit" onClick={() => setEditing(true)}>
          {missingDocs.length > 0 ? 'Add documents / update details' : 'Update details'}
        </button>
      </div>
    );
  }

  return (
    <form className="vof-card" onSubmit={handleSubmit}>
      <style>{styles}</style>
      <header className="vof-header">
        <h1>{existing ? 'Update your details' : 'Set up your store'}</h1>
        <p>
          {existing
            ? 'Your saved details are filled in — just change what you need or add a missing document.'
            : 'Payout details and ID verification — one form, five minutes.'}
        </p>
      </header>

      <div className="vof-steps">
        {STEPS.map((label, i) => (
          <React.Fragment key={label}>
            <div
              className={`vof-step-dot ${i < step ? 'vof-step-done' : ''} ${i === step ? 'vof-step-current' : ''}`}
              aria-current={i === step ? 'step' : undefined}
            >
              {i < step ? '✓' : i + 1}
            </div>
            {i < STEPS.length - 1 && <div className={`vof-step-line ${i < step ? 'vof-step-done' : ''}`} />}
          </React.Fragment>
        ))}
      </div>
      <p className="vof-step-label">
        Step {step + 1} of {STEPS.length} — {STEPS[step]}
      </p>

      {step === 0 && (
      <fieldset>
        <legend>About your business</legend>

        <label className="vof-field">
          <span>Business name</span>
          <input
            type="text"
            required
            value={form.business_name}
            onChange={(e) => updateField('business_name', e.target.value)}
            placeholder="e.g. Adaeze Fabrics"
          />
        </label>

        <div className="vof-row">
          <label className="vof-field">
            <span>Email</span>
            <input
              type="email"
              required
              value={form.contact_email}
              onChange={(e) => updateField('contact_email', e.target.value)}
            />
          </label>
          <label className="vof-field">
            <span>Phone</span>
            <input
              type="tel"
              required
              value={form.contact_phone}
              onChange={(e) => updateField('contact_phone', e.target.value)}
              placeholder="080..."
            />
          </label>
        </div>

        <label className="vof-field">
          <span>WhatsApp number (if different from phone)</span>
          <input
            type="tel"
            value={form.contact_whatsapp}
            onChange={(e) => updateField('contact_whatsapp', e.target.value)}
            placeholder="Order alerts go here"
          />
        </label>
      </fieldset>
      )}

      {step === 1 && (
      <fieldset>
        <legend>Get paid</legend>

        <label className="vof-field">
          <span>Bank</span>
          {banksLoading ? (
            <div className="vof-skeleton" />
          ) : banksError ? (
            <p className="vof-error">{banksError}</p>
          ) : (
            <select
              required
              value={form.bank_code}
              onChange={(e) => updateField('bank_code', e.target.value)}
            >
              <option value="">Select your bank</option>
              {banks.map((b) => (
                <option key={b.code} value={b.code}>
                  {b.name}
                </option>
              ))}
            </select>
          )}
        </label>

        <label className="vof-field">
          <span>Account number</span>
          <input
            type="text"
            required
            inputMode="numeric"
            maxLength={10}
            value={form.account_number}
            onChange={(e) => updateField('account_number', e.target.value.replace(/\D/g, ''))}
            placeholder="10-digit NUBAN"
          />
        </label>

        <div className="vof-account-status">
          {resolvingAccount && <span className="vof-muted">Checking account…</span>}
          {accountName && <span className="vof-confirmed">✓ {accountName}</span>}
          {accountError && <span className="vof-error">{accountError}</span>}
        </div>
      </fieldset>
      )}

      {step === 2 && (
      <fieldset>
        <legend>Verify your identity</legend>

        <label className="vof-field">
          <span>NIN (National Identification Number)</span>
          <input
            type="text"
            required
            inputMode="numeric"
            maxLength={11}
            value={nin}
            onChange={(e) => setNin(e.target.value.replace(/\D/g, ''))}
            placeholder="11 digits"
          />
        </label>

        <p className="vof-tier-note">
          This gets you to <strong>Basic</strong> — you can list right away. Add the two documents below
          any time to reach <strong>Verified</strong> and unlock the Verified badge.
        </p>

        <div className="vof-row">
          <label className="vof-field vof-upload">
            <span>CAC document <em>{existing?.cacDocumentUrl ? '(✓ uploaded — choose a file only to replace it)' : '(optional now)'}</em></span>
            <input type="file" accept=".pdf,.jpg,.jpeg,.png" onChange={handleFileChange(setCacFile)} />
            {cacFile && <span className="vof-filename">{cacFile.name}</span>}
          </label>
          <label className="vof-field vof-upload">
            <span>Proof of address <em>{existing?.addressProofUrl ? '(✓ uploaded — choose a file only to replace it)' : '(optional now)'}</em></span>
            <input
              type="file"
              accept=".pdf,.jpg,.jpeg,.png"
              onChange={handleFileChange(setAddressProofFile)}
            />
            {addressProofFile && <span className="vof-filename">{addressProofFile.name}</span>}
          </label>
        </div>

        <label className="vof-field vof-upload">
          <span>Headshot / selfie <em>{existing?.selfieUrl ? '(✓ uploaded — choose a file only to replace it)' : '(optional now)'}</em></span>
          <input type="file" accept=".jpg,.jpeg,.png" onChange={handleFileChange(setSelfieFile)} />
          {selfieFile && <span className="vof-filename">{selfieFile.name}</span>}
        </label>
      </fieldset>
      )}

      {stepError && <p className="vof-error vof-submit-error">{stepError}</p>}
      {step === STEPS.length - 1 && submitError && (
        <p className="vof-error vof-submit-error">{submitError}</p>
      )}

      <div className="vof-step-nav">
        {step > 0 && (
          <button type="button" className="vof-btn-back" onClick={goBack}>
            Back
          </button>
        )}
        {step < STEPS.length - 1 ? (
          <button type="button" className="vof-submit" onClick={goNext}>
            Continue
          </button>
        ) : (
          <button type="submit" className="vof-submit" disabled={submitting}>
            {submitting ? (existing ? 'Saving…' : 'Setting up your store…') : existing ? 'Save changes' : 'Set up my store'}
          </button>
        )}
      </div>
    </form>
  );
}