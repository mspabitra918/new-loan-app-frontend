"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { api, ApiRequestError } from "@/lib/api";
import { SITE, money } from "@/lib/site";

export function formatLosAngelesDate(
  date: string | Date | null | undefined,
): string {
  if (!date) return "";

  const parsedDate = new Date(date);

  if (Number.isNaN(parsedDate.getTime())) {
    return "";
  }

  return parsedDate.toLocaleString("en-US", {
    timeZone: "America/Los_Angeles",
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  });
}

interface StatusResult {
  applicationId: string;
  status: string;
  statusLabel?: string;
  currentStep: number;
  highestStepReached: number;
  bankVerificationStatus: string;
  /**
   * Present while verification is outstanding. `url` carries a fresh
   * single-use token, minted because the lookup already proved the reference
   * and the email together.
   */
  bankVerification?: {
    required: boolean;
    completed: boolean;
    url: string | null;
    bankVerificationDate: string | null;
  };
  approvedAt: string | null;
  declinedAt: string | null;
  fundedAt: string | null;
  submittedAt: string | null;
  lastUpdatedAt: string | null;
  actionRequired: { code: string; message: string };
  offer: { amount: number; termMonths: number; apr: number } | null;
}

const STATUS_LABELS: Record<string, string> = {
  step1_started: "Started",
  step1_submitted: "In progress",
  prequalified: "Pre-qualified",
  prequal_declined: "Not approved",
  step2_submitted: "In underwriting",
  approved: "Approved",
  underwriting_declined: "Not approved",
  step3_submitted: "Bank Verification Pending",
  bank_verification_pending: "Bank Verification Pending",
  bank_verified: "Bank Verification Completed",
  funded: "Funded",
  withdrawn: "Withdrawn",
  expired: "Expired",
};

const TONE: Record<string, string> = {
  declined: "border-red-300 bg-red-50 text-red-900",
  verify_bank: "border-amber-300 bg-amber-50 text-amber-900",
  expired: "border-slate-300 bg-slate-50 text-slate-800",
};

export function LoanStatusLookup() {
  const [applicationId, setApplicationId] = useState("");
  const [email, setEmail] = useState("");
  const [result, setResult] = useState<StatusResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const lookup = async (ref: string, address: string) => {
    setError(null);
    setResult(null);

    if (!ref.trim()) return setError("Enter your application reference.");
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(address.trim())) {
      return setError("Enter the email address you applied with.");
    }

    setBusy(true);
    try {
      setResult(
        await api.post<StatusResult>("/applications/status", {
          applicationId: ref.trim(),
          email: address.trim().toLowerCase(),
        }),
      );
    } catch (err) {
      setError(
        err instanceof ApiRequestError
          ? err.payload.message
          : "We could not check that right now. Please try again shortly.",
      );
    } finally {
      setBusy(false);
    }
  };

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    void lookup(applicationId, email);
  };

  // Emailed links carry ?ref=...&email=... - fill the form from them and,
  // when both are there, show the status straight away.
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const ref = params.get("ref") ?? "";
    const linkEmail = params.get("email") ?? "";
    if (ref) setApplicationId(ref);
    if (linkEmail) setEmail(linkEmail);
    if (ref && linkEmail) void lookup(ref, linkEmail);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const isBankVerified =
    result?.bankVerificationStatus === "verified" &&
    !!result?.bankVerification?.bankVerificationDate;

  const isApproved = result?.status === "approved";

  const isFunded = result?.status === "funded";

  const isDeclined = result?.status === "underwriting_declined";

  const isWithdrawn = result?.status === "withdrawn";

  return (
    <div className="grid gap-10 lg:grid-cols-[1fr_1fr]">
      <form
        onSubmit={submit}
        noValidate
        className="rounded-xl border border-slate-200 bg-white p-6"
      >
        <h2 className="text-lg font-semibold text-brand-900">
          Look up your application
        </h2>
        <p className="mt-1.5 text-sm leading-relaxed text-slate-600">
          Enter the reference from your confirmation email and the address you
          applied with.
        </p>

        <div className="mt-6 space-y-5">
          <div className="flex flex-col gap-1.5">
            <label
              htmlFor="applicationId"
              className="text-sm font-medium text-brand-900"
            >
              Application reference
            </label>
            <input
              id="applicationId"
              name="applicationId"
              value={applicationId}
              onChange={(e) => setApplicationId(e.target.value.toUpperCase())}
              placeholder="RYL-2026-XXXXXXXX"
              autoComplete="off"
              spellCheck={false}
              className="w-full rounded-lg border border-slate-300 bg-white px-3.5 py-2.5 text-[16px] uppercase tracking-wide outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-500/30"
            />
          </div>

          <div className="flex flex-col gap-1.5">
            <label
              htmlFor="statusEmail"
              className="text-sm font-medium text-brand-900"
            >
              Email address
            </label>
            <input
              id="statusEmail"
              name="statusEmail"
              type="email"
              inputMode="email"
              autoComplete="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@example.com"
              className="w-full rounded-lg border border-slate-300 bg-white px-3.5 py-2.5 text-[16px] outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-500/30"
            />
          </div>
        </div>

        {error && (
          <p
            role="alert"
            className="mt-4 rounded-lg border border-red-300 bg-red-50 p-3 text-sm text-red-800"
          >
            {error}
          </p>
        )}

        <button
          type="submit"
          disabled={busy}
          className="mt-6 w-full rounded-lg bg-brand-600 px-6 py-3.5 text-base font-semibold text-white transition hover:bg-brand-700 disabled:cursor-not-allowed disabled:opacity-60"
        >
          {busy ? "Checking..." : "Check status"}
        </button>

        <p className="mt-4 text-xs leading-relaxed text-slate-500">
          For your security we show only the status here. To change any of your
          details, use the link in your email or call {SITE.supportPhone}.
        </p>
      </form>

      <div>
        {result ? (
          <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
            {/* Header */}
            <div className="border-b border-slate-200 bg-slate-50 px-6 py-6 sm:px-8">
              <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-wider text-slate-500">
                    Application
                  </p>

                  <h2 className="mt-1 text-xl font-bold tracking-tight text-slate-900 sm:text-2xl">
                    {result.applicationId}
                  </h2>

                  <p className="mt-1 text-sm text-slate-500">
                    Your loan application status
                  </p>
                </div>

                {/* Status Badge */}
                <div className="inline-flex w-fit items-center gap-2 rounded-full bg-brand-50 px-3.5 py-2 text-sm font-semibold text-brand-800">
                  <span className="h-2 w-2 rounded-full bg-brand-600" />
                  {result.statusLabel ??
                    STATUS_LABELS[result.status] ??
                    result.status}
                </div>
              </div>
            </div>

            <div className="space-y-6 p-6 sm:p-8">
              {/* Action Required */}
              <div
                className={`rounded-xl border p-5 ${
                  TONE[result.actionRequired.code] ??
                  "border-brand-200 bg-brand-50 text-brand-900"
                }`}
              >
                <div className="flex items-start gap-3">
                  <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-white/70">
                    {result.actionRequired.code === "none" ? (
                      <span className="text-lg">✓</span>
                    ) : (
                      <span className="text-lg">!</span>
                    )}
                  </div>

                  <div>
                    <p className="text-sm font-semibold">
                      {result.actionRequired.code === "none"
                        ? "No action required"
                        : "Action required"}
                    </p>

                    <p className="mt-1 text-sm leading-6 opacity-90">
                      {result.actionRequired.message}
                    </p>
                  </div>
                </div>
              </div>

              {/* Bank Verification */}
              {result.bankVerification?.required &&
                result.bankVerification.url && (
                  <div className="rounded-xl border border-blue-200 bg-blue-50 p-5">
                    <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                      <div>
                        <p className="text-sm font-semibold text-blue-950">
                          Bank verification is required
                        </p>

                        <p className="mt-1 text-sm leading-5 text-blue-800">
                          Verify your bank account to continue processing your
                          application.
                        </p>
                      </div>

                      <Link
                        href={result.bankVerification.url}
                        target="_blank"
                        className="inline-flex w-full items-center justify-center gap-2 rounded-lg bg-brand-600 px-5 py-3 text-sm font-semibold text-white shadow-sm transition hover:bg-brand-700 focus:outline-none focus:ring-2 focus:ring-brand-500 focus:ring-offset-2 sm:w-auto"
                      >
                        Complete Verification
                        <span aria-hidden="true">→</span>
                      </Link>
                    </div>
                  </div>
                )}

              {/* Offer */}
              {result.offer && (
                <div>
                  <div className="mb-3">
                    <h3 className="text-sm font-semibold text-slate-900">
                      Your loan offer
                    </h3>

                    <p className="mt-1 text-xs text-slate-500">
                      Current offer details associated with this application.
                    </p>
                  </div>

                  <div className="grid grid-cols-1 overflow-hidden rounded-xl border border-slate-200 sm:grid-cols-3">
                    <div className="border-b border-slate-200 p-5 sm:border-b-0 sm:border-r">
                      <p className="text-xs font-medium uppercase tracking-wide text-slate-500">
                        Loan amount
                      </p>

                      <p className="mt-2 text-xl font-bold text-brand-900">
                        {money(result.offer.amount)}
                      </p>
                    </div>

                    <div className="border-b border-slate-200 p-5 sm:border-b-0 sm:border-r">
                      <p className="text-xs font-medium uppercase tracking-wide text-slate-500">
                        Term
                      </p>

                      <p className="mt-2 text-xl font-bold text-brand-900">
                        {result.offer.termMonths}
                        <span className="ml-1 text-sm font-medium text-slate-500">
                          months
                        </span>
                      </p>
                    </div>

                    <div className="p-5">
                      <p className="text-xs font-medium uppercase tracking-wide text-slate-500">
                        APR
                      </p>

                      <p className="mt-2 text-xl font-bold text-brand-900">
                        {result.offer.apr}%
                      </p>
                    </div>
                  </div>
                </div>
              )}

              {/* Application Progress */}
              {/* <div>
                <div className="flex items-center justify-between">
                  <div>
                    <h3 className="text-sm font-semibold text-slate-900">
                      Application progress
                    </h3>

                    <p className="mt-1 text-xs text-slate-500">
                      Step {result.highestStepReached} of 3 completed
                    </p>
                  </div>

                  <span className="text-sm font-semibold text-brand-700">
                    {Math.round((result.highestStepReached / 3) * 100)}%
                  </span>
                </div>

                <div className="mt-4 h-2 overflow-hidden rounded-full bg-slate-100">
                  <div
                    className="h-full rounded-full bg-brand-600 transition-all"
                    style={{
                      width: `${Math.min(
                        100,
                        (result.highestStepReached / 3) * 100,
                      )}%`,
                    }}
                  />
                </div>

                <div className="mt-5 grid grid-cols-3 gap-2">
                  {[1, 2, 3].map((step) => {
                    const completed = step <= result.highestStepReached;

                    return (
                      <div key={step} className="flex items-center gap-2">
                        <div
                          className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-xs font-bold ${
                            completed
                              ? "bg-brand-600 text-white"
                              : "bg-slate-100 text-slate-400"
                          }`}
                        >
                          {completed ? "✓" : step}
                        </div>

                        <span
                          className={`hidden text-xs sm:block ${
                            completed
                              ? "font-medium text-slate-700"
                              : "text-slate-400"
                          }`}
                        >
                          {step === 1
                            ? "Application"
                            : step === 2
                              ? "Personal Details"
                              : "Verification"}
                        </span>
                      </div>
                    );
                  })}
                </div>
              </div> */}

              {/* Application Details */}
              <div className="border-t border-slate-200 pt-7">
                <div className="mb-5">
                  <h3 className="text-base font-semibold tracking-tight text-slate-900">
                    Application timeline
                  </h3>

                  <p className="mt-1 text-sm text-slate-500">
                    Important dates and milestones for your application.
                  </p>
                </div>

                <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white">
                  {/* Submitted - ALWAYS SHOW */}
                  {result.submittedAt && (
                    <div className="relative flex gap-4 p-5">
                      <div className="relative z-10 flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-blue-100 text-blue-700">
                        ✓
                      </div>

                      <div className="min-w-0">
                        <p className="font-semibold text-slate-900">
                          Application Submitted
                        </p>

                        <p className="mt-1 text-sm text-slate-500">
                          Your application was successfully submitted.
                        </p>

                        <p className="mt-2 text-xs font-medium text-slate-400">
                          {formatLosAngelesDate(result.submittedAt)}
                        </p>
                      </div>
                    </div>
                  )}

                  {/* Bank Verification - SHOW ONLY WHEN VERIFIED */}
                  {isBankVerified && (
                    <div className="relative flex gap-4 border-t border-slate-100 p-5">
                      <div className="relative z-10 flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-emerald-100 text-emerald-700">
                        ✓
                      </div>

                      <div className="min-w-0">
                        <p className="font-semibold text-slate-900">
                          Bank Verification Completed
                        </p>

                        <p className="mt-1 text-sm text-slate-500">
                          Your bank account has been successfully verified.
                        </p>

                        <p className="mt-2 text-xs font-medium text-slate-400">
                          {formatLosAngelesDate(
                            result?.bankVerification?.bankVerificationDate,
                          )}
                        </p>
                      </div>
                    </div>
                  )}

                  {/* Approved - SHOW ONLY APPROVED OR FUNDED */}
                  {isApproved && result.approvedAt && (
                    <div className="relative flex gap-4 border-t border-slate-100 p-5">
                      <div className="relative z-10 flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-indigo-100 text-indigo-700">
                        ✓
                      </div>

                      <div className="min-w-0">
                        <p className="font-semibold text-slate-900">
                          Application Approved
                        </p>

                        <p className="mt-1 text-sm text-slate-500">
                          Your application has been approved.
                        </p>

                        <p className="mt-2 text-xs font-medium text-slate-400">
                          {formatLosAngelesDate(result.approvedAt)}
                        </p>
                      </div>
                    </div>
                  )}

                  {/* Funded - SHOW ONLY WHEN CURRENT STATUS IS FUNDED */}
                  {isFunded && result.fundedAt && (
                    <div className="relative flex gap-4 border-t border-slate-100 p-5">
                      <div className="relative z-10 flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-green-100 text-green-700">
                        ✓
                      </div>

                      <div className="min-w-0">
                        <p className="font-semibold text-slate-900">
                          Loan Funded
                        </p>

                        <p className="mt-1 text-sm text-slate-500">
                          Your loan has been funded successfully.
                        </p>

                        <p className="mt-2 text-xs font-medium text-slate-400">
                          {formatLosAngelesDate(result.fundedAt)}
                        </p>
                      </div>
                    </div>
                  )}

                  {/* Declined - SHOW ONLY WHEN CURRENT STATUS IS DECLINED */}
                  {isDeclined && result.declinedAt && (
                    <div className="relative flex gap-4 border-t border-slate-100 p-5">
                      <div className="relative z-10 flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-red-100 text-red-700">
                        !
                      </div>

                      <div className="min-w-0">
                        <p className="font-semibold text-slate-900">
                          Application Not Approved
                        </p>

                        <p className="mt-1 text-sm text-slate-500">
                          Your application was not approved.
                        </p>

                        <p className="mt-2 text-xs font-medium text-slate-400">
                          {formatLosAngelesDate(result.declinedAt)}
                        </p>
                      </div>
                    </div>
                  )}

                  {/* Withdrawn - SHOW ONLY WHEN CURRENT STATUS IS WITHDRAWN */}
                  {isWithdrawn && (
                    <div className="relative flex gap-4 border-t border-slate-100 p-5">
                      <div className="relative z-10 flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-slate-100 text-slate-700">
                        —
                      </div>

                      <div className="min-w-0">
                        <p className="font-semibold text-slate-900">
                          Application Withdrawn
                        </p>

                        <p className="mt-1 text-sm text-slate-500">
                          This application has been withdrawn.
                        </p>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>
        ) : (
          <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm sm:p-8">
            {/* Empty State */}
            <div className="mx-auto max-w-md text-center">
              <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-slate-100">
                <svg
                  className="h-7 w-7 text-slate-500"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.8"
                  aria-hidden="true"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    d="M9 12h6m-6 4h4m4-13H7a2 2 0 00-2 2v14a2 2 0 002 2h10a2 2 0 002-2V5a2 2 0 00-2-2z"
                  />
                </svg>
              </div>

              <h2 className="mt-4 text-lg font-semibold text-slate-900">
                Find your application
              </h2>

              <p className="mt-2 text-sm leading-6 text-slate-600">
                Your application reference looks like{" "}
                <span className="rounded bg-slate-100 px-1.5 py-0.5 font-mono text-xs font-medium text-brand-800">
                  RYL-2026-XXXXXXXX
                </span>
                . You can find it at the top of the emails we sent after you
                submitted your application.
              </p>

              <div className="mt-5 rounded-xl border border-slate-200 bg-slate-50 p-4 text-left">
                <p className="text-sm font-medium text-slate-800">
                  Can't find your reference?
                </p>

                <p className="mt-1 text-sm leading-5 text-slate-600">
                  Call{" "}
                  <a
                    href={`tel:${SITE.supportPhone}`}
                    className="font-semibold text-brand-700 hover:text-brand-800"
                  >
                    {SITE.supportPhone}
                  </a>{" "}
                  and our team can help locate your application.
                </p>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

const fmt = (iso: string) =>
  new Date(iso).toLocaleString("en-US", {
    dateStyle: "medium",
    timeStyle: "short",
  });
