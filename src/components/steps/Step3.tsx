'use client';

import { useEffect, useState } from 'react';
import { api } from '@/lib/api';
import { digitsOnly, formatCurrency } from '@/lib/format';
import { validateAccountNumber, validateRoutingNumber, required } from '@/lib/validation';
import type {
  ConsentTemplate,
  FieldErrors,
  LookupOptions,
  SubmitRequestPart,
} from '@/lib/types';
import { SectionCard } from '../SectionCard';
import { TrustMarkers } from '../TrustMarkers';
import { ConsentCheckbox } from '../ConsentCheckbox';
import { TextField } from '../fields/TextField';
import { SelectField } from '../fields/SelectField';
import { RadioGroup } from '../fields/RadioGroup';

/** What the wizard holds on to so Back can put this screen back as it was. */
export interface Step3Snapshot {
  routingNumber: string;
  bankName: string;
  accountNumber: string;
  confirmAccountNumber: string;
  accountType: '' | 'checking' | 'savings';
  accountStatusSelfReported: string;
  accountAge: string;
  consents: Record<string, boolean>;
}

interface Props {
  options: LookupOptions;
  consentTemplates: ConsentTemplate[];
  /** The amount asked for, so the last screen still shows what it is funding. */
  requestedAmount?: number;
  /** Whatever was on this screen last time, so Back loses nothing. */
  initial?: Step3Snapshot;
  /** Validated - this is the one that sends the whole application. */
  onSubmit: (part: SubmitRequestPart) => void;
  /** Fires on every keystroke; the wizard is the one holding the answers. */
  onChange: (snapshot: Step3Snapshot) => void;
  onBack: () => void;
  /** The submit is in flight. */
  submitting?: boolean;
  /** Field errors the server raised against this screen, after submit. */
  serverErrors?: FieldErrors;
  serverBanner?: string | null;
}

/**
 * Screen 3 - bank & funding, and the screen that submits.
 *
 * Instant Account Verification (Plaid / MX / Finicity) is not used on this
 * build; these manual fields are the only path. The bank name is looked up
 * from the routing number and rendered read-only - we never ask the applicant
 * to type it. The routing lookup is the only request this screen makes before
 * the applicant presses submit, which is the one that stores the application.
 */
export function Step3({
  options,
  consentTemplates,
  requestedAmount,
  initial,
  onSubmit,
  onChange,
  onBack,
  submitting = false,
  serverErrors,
  serverBanner,
}: Props) {
  const [routing, setRouting] = useState(initial?.routingNumber ?? '');
  const [bankName, setBankName] = useState(initial?.bankName ?? '');
  const [lookingUp, setLookingUp] = useState(false);
  const [account, setAccount] = useState(initial?.accountNumber ?? '');
  const [confirmAccount, setConfirmAccount] = useState(initial?.confirmAccountNumber ?? '');
  const [accountType, setAccountType] = useState<'' | 'checking' | 'savings'>(
    initial?.accountType ?? '',
  );
  const [accountStatus, setAccountStatus] = useState(initial?.accountStatusSelfReported ?? '');
  const [accountAge, setAccountAge] = useState(initial?.accountAge ?? '');
  const [consents, setConsents] = useState<Record<string, boolean>>(initial?.consents ?? {});
  const [errors, setErrors] = useState<FieldErrors>({});
  const [banner, setBanner] = useState<string | null>(null);

  // The wizard holds the answers; this screen only edits them.
  useEffect(() => {
    onChange({
      routingNumber: routing,
      bankName,
      accountNumber: account,
      confirmAccountNumber: confirmAccount,
      accountType,
      accountStatusSelfReported: accountStatus,
      accountAge,
      consents,
    });
  }, [
    routing,
    bankName,
    account,
    confirmAccount,
    accountType,
    accountStatus,
    accountAge,
    consents,
    onChange,
  ]);

  // Errors raised by the server against this screen land here after submit.
  useEffect(() => {
    if (serverErrors && Object.keys(serverErrors).length) setErrors(serverErrors);
    setBanner(serverBanner ?? null);
  }, [serverErrors, serverBanner]);

  const setError = (key: string, message: string | null) =>
    setErrors((e) => ({ ...e, [key]: message ?? '' }));

  /** Field 44 - populated from the FedACH lookup, never typed. */
  const lookupRouting = async () => {
    const local = validateRoutingNumber(routing);
    setError('routingNumber', local);
    setBankName('');
    if (local) return;

    setLookingUp(true);
    try {
      const res = await api.get<{ valid: boolean; bankName: string | null; inFedachFile?: boolean }>(
        `/lookup/routing?value=${digitsOnly(routing)}`,
      );
      if (!res.valid) {
        setError('routingNumber', 'That routing number is not valid. Please check the 9 digits.');
      } else if (res.bankName) {
        setBankName(res.bankName);
      } else {
        // Not in the participant file - a soft signal, so we let it through
        // and flag it for verification rather than blocking.
        setBankName('Bank not recognised - we will verify this manually');
      }
    } catch {
      /* a lookup outage must not block funding */
    } finally {
      setLookingUp(false);
    }
  };

  const validateAll = (): FieldErrors => {
    const e: FieldErrors = {};
    const routingError = validateRoutingNumber(routing);
    if (routingError) e.routingNumber = routingError;

    const accountError = validateAccountNumber(account);
    if (accountError) e.accountNumber = accountError;
    else if (digitsOnly(account) !== digitsOnly(confirmAccount)) {
      e.confirmAccountNumber = 'The account numbers do not match.';
    }

    const typeError = required(accountType, 'Select your account type.');
    if (typeError) e.accountType = typeError;

    const statusError = required(accountStatus, 'Select your account status.');
    if (statusError) e.accountStatusSelfReported = statusError;

    const ageError = required(accountAge, 'Select how long you have had this account.');
    if (ageError) e.accountAge = ageError;

    for (const t of consentTemplates) {
      if (!consents[t.type]) e[`consents.${t.type}`] = 'You must agree to continue.';
    }
    return e;
  };

  const submit = (event: React.FormEvent) => {
    event.preventDefault();
    setBanner(null);

    const found = validateAll();
    if (Object.keys(found).length) {
      setErrors(found);
      document
        .querySelector('[aria-invalid="true"], [role="alert"]')
        ?.scrollIntoView({ behavior: 'smooth', block: 'center' });
      return;
    }

    // This hands the last of the answers to the wizard, which posts all three
    // screens together. The wizard owns the request, because a field error can
    // come back against any of them.
    onSubmit({
      routingNumber: digitsOnly(routing),
      bankName: bankName || undefined,
      accountNumber: digitsOnly(account),
      confirmAccountNumber: digitsOnly(confirmAccount),
      accountType,
      accountStatusSelfReported: accountStatus,
      accountAge,
      consents: consentTemplates.map((t) => ({
        type: t.type,
        accepted: !!consents[t.type],
        versionId: t.versionId,
        timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
      })),
    });
  };

  return (
    <form onSubmit={submit} noValidate className="space-y-6">
      {banner && (
        <div role="alert" className="rounded-lg border border-red-300 bg-red-50 p-4 text-sm text-red-800">
          {banner}
        </div>
      )}

      {/* No decision is made on submit, so this promises none. What actually
          happens next is the bank verification email. */}
      <div className="rounded-xl border border-brand-300 bg-brand-50 p-5">
        <p className="text-sm font-semibold text-brand-900">Last screen</p>
        <p className="mt-1 text-sm leading-relaxed text-brand-900">
          Tell us where to deposit{' '}
          {requestedAmount ? (
            <strong>{formatCurrency(requestedAmount)}</strong>
          ) : (
            'your loan'
          )}
          . When you submit, we email you a link to confirm this account is yours - that is the
          last thing we need from you.
        </p>
      </div>

      <SectionCard
        title="Where should we send the money?"
        description="Use the checking or savings account where you want your funds deposited."
      >
        <TrustMarkers variant="bank" />

        <TextField
          id="routingNumber"
          label="Routing number"
          required
          value={routing}
          onChange={(v) => setRouting(v.replace(/\D/g, '').slice(0, 9))}
          onBlur={lookupRouting}
          inputMode="numeric"
          maxLength={9}
          placeholder="9 digits"
          autoComplete="off"
          sensitive
          hint="The 9-digit number on the bottom left of your cheque."
          error={errors.routingNumber}
        />

        <TextField
          id="bankName"
          label="Bank name"
          required
          value={lookingUp ? 'Looking up...' : bankName}
          onChange={() => undefined}
          readOnly
          hint="Filled in automatically from your routing number."
        />

        <TextField
          id="accountNumber"
          label="Account number"
          required
          value={account}
          onChange={(v) => setAccount(v.replace(/\D/g, '').slice(0, 17))}
          onBlur={() => setError('accountNumber', validateAccountNumber(account))}
          inputMode="numeric"
          maxLength={17}
          autoComplete="off"
          sensitive
          error={errors.accountNumber}
        />

        <TextField
          id="confirmAccountNumber"
          label="Confirm account number"
          required
          value={confirmAccount}
          onChange={(v) => setConfirmAccount(v.replace(/\D/g, '').slice(0, 17))}
          onBlur={() =>
            setError(
              'confirmAccountNumber',
              digitsOnly(account) === digitsOnly(confirmAccount)
                ? null
                : 'The account numbers do not match.',
            )
          }
          disablePaste
          inputMode="numeric"
          maxLength={17}
          autoComplete="off"
          sensitive
          hint="Please re-type it - paste is disabled so typos get caught."
          error={errors.confirmAccountNumber}
        />

        <RadioGroup
          id="accountType"
          label="Account type"
          required
          value={accountType}
          options={options.accountTypes as { value: 'checking' | 'savings'; label: string }[]}
          onChange={(v) => setAccountType(v)}
          error={errors.accountType}
        />

        <SelectField
          id="accountStatusSelfReported"
          label="Is this account currently positive or negative?"
          required
          value={accountStatus}
          options={options.accountStatuses}
          onChange={(v) => setAccountStatus(String(v))}
          error={errors.accountStatusSelfReported}
        />

        <SelectField
          id="accountAge"
          label="How long have you had this account?"
          required
          value={accountAge}
          options={options.accountAges}
          onChange={(v) => setAccountAge(String(v))}
          error={errors.accountAge}
        />
      </SectionCard>

      <SectionCard title="Payment authorisation">
        {consentTemplates.map((t) => (
          <ConsentCheckbox
            key={t.type}
            template={t}
            checked={!!consents[t.type]}
            onChange={(v) => {
              setConsents((c) => ({ ...c, [t.type]: v }));
              setErrors((e) => ({ ...e, [`consents.${t.type}`]: '' }));
            }}
            error={errors[`consents.${t.type}`]}
          />
        ))}
      </SectionCard>

      <div className="flex flex-col-reverse gap-3 sm:flex-row">
        <button
          type="button"
          onClick={onBack}
          disabled={submitting}
          className="rounded-lg border border-slate-300 px-6 py-4 text-base font-medium text-slate-700 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-60 sm:w-auto"
        >
          Back
        </button>
        <button
          type="submit"
          disabled={submitting}
          className="flex-1 rounded-lg bg-brand-600 px-6 py-4 text-base font-semibold text-white transition hover:bg-brand-700 disabled:cursor-not-allowed disabled:opacity-60"
        >
          {submitting ? 'Submitting your application...' : 'Submit my application'}
        </button>
      </div>
    </form>
  );
}
