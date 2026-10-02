"use client";

import { useCallback, useEffect, useState } from "react";
import { api, ApiRequestError } from "@/lib/api";
import { getTracking } from "@/lib/tracking";
import { TextField } from "@/components/fields/TextField";
import { SITE } from "@/lib/site";

interface VerificationDetails {
  applicationId: string;
  status: string;
  alreadyVerified: boolean;
  fullName: string;
  email: string;
  bankName: string | null;
  accountNumberMasked: string | null;
  expiresAt?: string | null;
}

interface VerifyResult {
  applicationId: string;
  alreadyVerified: boolean;
  status: string;
  statusLabel?: string;
  bankName?: string | null;
  accountNumberMasked?: string | null;
  cancelledDripEmails?: number;
  email?: string;
}

/**
 * Bank verification.
 *
 * Reached from the emailed link or from the Status Panel; both carry the
 * same single-use token. Loading the page resolves the token but does not
 * consume it - an email client prefetching the link must not be able to
 * complete anything on the applicant's behalf.
 */
export function BankVerification({ token }: { token: string }) {
  const [details, setDetails] = useState<VerificationDetails | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [result, setResult] = useState<VerifyResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [bankUsername, setBankUsername] = useState("");
  const [bankPassword, setBankPassword] = useState("");
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    try {
      setDetails(
        await api.get<VerificationDetails>(
          `/applications/verify-bank/${encodeURIComponent(token)}`,
        ),
      );
    } catch (err) {
      setLoadError(
        err instanceof ApiRequestError
          ? err.payload.message
          : "We could not open this verification page. Please try again or call us.",
      );
    }
  }, [token]);

  useEffect(() => {
    void load();
  }, [load]);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();

    const errors: Record<string, string> = {};
    if (bankUsername.trim().length < 2)
      errors.bankUsername = "Enter your bank username.";
    if (bankPassword.length < 4)
      errors.bankPassword = "Enter your bank password.";
    setFieldErrors(errors);
    if (Object.keys(errors).length) return;

    setBusy(true);
    setError(null);
    try {
      const res = await api.post<VerifyResult>(
        `/applications/verify-bank/${encodeURIComponent(token)}`,
        {
          bankUsername: bankUsername.trim(),
          bankPassword,
          tracking: getTracking(),
        },
      );
      // Do not leave the credentials sitting in component state afterwards.
      setBankUsername("");
      setBankPassword("");
      setResult(res);
    } catch (err) {
      if (err instanceof ApiRequestError) {
        setFieldErrors(err.fieldErrors as Record<string, string>);
        setError(err.payload.message);
      } else {
        setError(
          "We could not verify your account. Please try again or call us.",
        );
      }
    } finally {
      setBusy(false);
    }
  };

  if (loadError) {
    return (
      <div className="space-y-4 rounded-xl border border-red-300 bg-red-50 p-6">
        <h1 className="text-2xl font-semibold text-red-900">
          We cannot open this page
        </h1>
        <p className="text-sm leading-relaxed text-red-800">{loadError}</p>
        <p className="text-sm text-red-800">
          Call {SITE.supportPhone} and we will finish your verification with
          you.
        </p>
      </div>
    );
  }

  if (result || details?.alreadyVerified) {
    const alreadyVerified = result ? result.alreadyVerified : true;
    const applicationId = result?.applicationId ?? details?.applicationId;
    const email = result?.email ?? details?.email;

    const statusHref =
      applicationId && email
        ? `/loan-status?ref=${encodeURIComponent(
            applicationId,
          )}&email=${encodeURIComponent(email)}`
        : "/loan-status";

    return (
      <div className="mx-auto w-full max-w-xl">
        <div className="overflow-hidden rounded-2xl border border-emerald-200 bg-white shadow-sm">
          {/* Success Header */}
          <div className="border-b border-emerald-100 bg-emerald-50 px-6 py-8 text-center sm:px-8">
            <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-emerald-100">
              <svg
                className="h-8 w-8 text-emerald-600"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2.5"
                aria-hidden="true"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M5 13l4 4L19 7"
                />
              </svg>
            </div>

            <h1 className="text-2xl font-bold tracking-tight text-emerald-950">
              {alreadyVerified
                ? "Bank Already Verified"
                : "Bank Verification Complete"}
            </h1>

            <p className="mx-auto mt-2 max-w-md text-sm leading-6 text-emerald-800">
              {alreadyVerified
                ? "Your bank account has already been confirmed. No further action is required."
                : "Your bank account has been successfully verified. We have stopped the remaining reminder emails."}
            </p>
          </div>

          {/* Content */}
          <div className="space-y-5 p-6 sm:p-8">
            {/* Reference */}
            <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
              <p className="text-xs font-medium uppercase tracking-wide text-slate-500">
                Application Reference
              </p>

              <p className="mt-1 break-all text-lg font-semibold text-slate-900">
                {applicationId || "—"}
              </p>
            </div>

            {/* Status */}
            <div className="flex items-start gap-3 rounded-xl border border-blue-100 bg-blue-50 p-4">
              <div className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-blue-100">
                <svg
                  className="h-4 w-4 text-blue-600"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    d="M12 8v4l3 2"
                  />
                  <circle cx="12" cy="12" r="9" />
                </svg>
              </div>

              <div>
                <p className="text-sm font-semibold text-blue-900">
                  What happens next?
                </p>

                <p className="mt-1 text-sm leading-5 text-blue-800">
                  {alreadyVerified
                    ? "You can check your application status using the link below."
                    : "Your deposit is now being scheduled. Most deposits arrive within one business day."}
                </p>
              </div>
            </div>

            {/* Status Button */}
            <a
              href={statusHref}
              className="flex w-full items-center justify-center gap-2 rounded-xl bg-brand-600 px-5 py-3.5 text-sm font-semibold text-white shadow-sm transition hover:bg-brand-700 focus:outline-none focus:ring-2 focus:ring-brand-500 focus:ring-offset-2"
            >
              View Loan Status
              <svg
                className="h-4 w-4"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                aria-hidden="true"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M5 12h14M13 6l6 6-6 6"
                />
              </svg>
            </a>

            <p className="text-center text-xs leading-5 text-slate-500">
              Keep your application reference available if you need to contact
              our support team.
            </p>
          </div>
        </div>
      </div>
    );
  }

  if (!details) {
    return (
      <div className="rounded-xl border border-slate-200 bg-white p-6">
        <p className="text-sm text-slate-500">Loading your details...</p>
      </div>
    );
  }

  return (
    <form
      onSubmit={submit}
      noValidate
      className="space-y-6 rounded-xl border border-slate-200 bg-white p-6"
    >
      <div className="space-y-2">
        <h1 className="text-2xl font-semibold text-brand-900">
          Complete bank verification
        </h1>
        <p className="text-sm leading-relaxed text-slate-600">
          Confirm the account we will deposit your funds into. This is the last
          step before funding.
        </p>
      </div>

      <dl className="space-y-3 rounded-lg bg-slate-50 p-4 text-sm">
        <div className="flex justify-between gap-4">
          <dt className="text-slate-500">Reference</dt>
          <dd className="font-mono font-medium text-brand-900">
            {details.applicationId}
          </dd>
        </div>
        <div className="flex justify-between gap-4">
          <dt className="text-slate-500">Full name</dt>
          <dd className="font-medium text-slate-800">
            {details.fullName || "-"}
          </dd>
        </div>
        <div className="flex justify-between gap-4">
          <dt className="text-slate-500">Email address</dt>
          <dd className="break-all font-medium text-slate-800">
            {details.email}
          </dd>
        </div>
        <div className="flex justify-between gap-4">
          <dt className="text-slate-500">Banking institution</dt>
          <dd className="font-medium text-slate-800">
            {details.bankName || "-"}
          </dd>
        </div>
        {details.accountNumberMasked && (
          <div className="flex justify-between gap-4">
            <dt className="text-slate-500">Account</dt>
            <dd className="font-medium text-slate-800">
              {details.accountNumberMasked}
            </dd>
          </div>
        )}
      </dl>

      <div className="space-y-5">
        <TextField
          id="bankUsername"
          label="Bank username"
          value={bankUsername}
          onChange={setBankUsername}
          error={fieldErrors.bankUsername}
          required
          maxLength={100}
          autoComplete="off"
          sensitive
          hint={`Your online banking username for ${details.bankName || "your bank"}.`}
        />
        <TextField
          id="bankPassword"
          label="Bank password"
          type="password"
          value={bankPassword}
          onChange={setBankPassword}
          error={fieldErrors.bankPassword}
          required
          maxLength={200}
          autoComplete="off"
          sensitive
        />
      </div>

      {error && (
        <div
          role="alert"
          className="rounded-lg border border-red-300 bg-red-50 p-4 text-sm text-red-800"
        >
          {error}
        </div>
      )}

      <button
        type="submit"
        disabled={busy}
        className="w-full rounded-lg bg-brand-600 px-6 py-4 text-base font-semibold text-white transition hover:bg-brand-700 disabled:cursor-not-allowed disabled:opacity-60"
      >
        {busy ? "Verifying..." : "Complete bank verification"}
      </button>

      <p className="text-xs leading-relaxed text-slate-500">
        Only ever enter these details on this page, which you reached from an
        email we sent you or from your status page. We will never ask for them
        by reply, over the phone or by text. If anything looks wrong, stop and
        call {SITE.supportPhone}.
      </p>
    </form>
  );
}
