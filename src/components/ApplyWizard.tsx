"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { api, ApiRequestError, API_BASE } from "@/lib/api";
import { getTracking, initTracking } from "@/lib/tracking";
import { formatCurrency } from "@/lib/format";
import type {
  ConsentTemplate,
  FieldErrors,
  LookupOptions,
  SubmitRequest,
  SubmitRequestPart,
  SubmitResponse,
} from "@/lib/types";
import { ProgressIndicator } from "./ProgressIndicator";
import { QuoteBar, QuoteSummary } from "./QuoteSummary";
import { LeadCertificationScripts } from "./LeadCertificationScripts";
import { Step1, type Step1Snapshot } from "./steps/Step1";
import { Step2, type Step2Snapshot } from "./steps/Step2";
import { Step3, type Step3Snapshot } from "./steps/Step3";

type Outcome =
  | { kind: "none" }
  | { kind: "submitted"; result: SubmitResponse }
  | { kind: "duplicate"; message: string; applicationId?: string };

/**
 * Which screen a field lives on.
 *
 * The server tags errors it raises itself with their screen, but the request
 * body is validated as one object before any of that runs - a shape error
 * arrives untagged. This puts those on the right screen too, so the applicant
 * is never shown a message about a field that is not in front of them.
 */
const SCREEN_FOR_FIELD: Record<string, 2 | 3> = {
  ssn: 2,
  confirmSsn: 2,
  driversLicenseNumber: 2,
  dlIssuingState: 2,
  dlExpirationDate: 2,
  routingNumber: 3,
  bankName: 3,
  accountNumber: 3,
  confirmAccountNumber: 3,
  accountType: 3,
  accountStatusSelfReported: 3,
  accountAge: 3,
};

/** The earliest screen any of these errors belongs to. */
function screenFor(errors: FieldErrors): 1 | 2 | 3 {
  let earliest: 1 | 2 | 3 = 3;
  let found = false;
  for (const field of Object.keys(errors)) {
    const screen = SCREEN_FOR_FIELD[field] ?? 1;
    found = true;
    if (screen < earliest) earliest = screen;
  }
  return found ? earliest : 1;
}

/** What each screen has contributed to the one request body. */
interface Parts {
  1?: SubmitRequestPart;
  2?: SubmitRequestPart;
  3?: SubmitRequestPart;
}

/** What each screen last looked like, so Back puts it back untouched. */
interface Snapshots {
  1?: Step1Snapshot;
  2?: Step2Snapshot;
  3?: Step3Snapshot;
}

/**
 * The application form: three screens, one submission.
 *
 * Next and Back move between the screens and nothing is posted on the way -
 * the answers live here, in this component, until the applicant presses
 * submit on the last screen. Then the whole application goes to
 * POST /applications/submit in a single request and is stored in one write.
 *
 * Nothing is written to browser storage either, so a reload starts a clean
 * form. That is the deliberate trade: no half-finished application anywhere,
 * on the server or in the browser, and nothing to resume.
 *
 * The wizard rather than a screen owns the request, because a field error can
 * come back against any of the three and the form has to be able to reopen
 * the screen the error belongs to with the message on the right field.
 */
export function ApplyWizard() {
  const [options, setOptions] = useState<LookupOptions | null>(null);
  const [templates, setTemplates] = useState<ConsentTemplate[]>([]);
  const [loadError, setLoadError] = useState<string | null>(null);

  const [step, setStep] = useState<1 | 2 | 3>(1);

  /**
   * The answers, and what each screen looked like when it was left.
   *
   * Refs rather than state on purpose: these change on every keystroke, and
   * nothing on the page is derived from them while a screen is open. Holding
   * them in state would re-render the whole wizard on each character typed,
   * and would hand each screen a fresh `initial` object as it went.
   */
  const parts = useRef<Parts>({});
  const snapshots = useRef<Snapshots>({});

  const [submitting, setSubmitting] = useState(false);
  const [outcome, setOutcome] = useState<Outcome>({ kind: "none" });

  /**
   * Where a failed submit put its errors. Held per screen so the applicant
   * can be sent back to screen 2 with the SSN field marked, rather than left
   * on screen 3 with a message about a field they cannot see.
   */
  const [serverErrors, setServerErrors] = useState<{
    step: 1 | 2 | 3;
    message: string;
    errors: FieldErrors;
  } | null>(null);

  /** Drives the quote rail. Screen 1 pushes changes up as the slider moves. */
  const [quote, setQuote] = useState<{
    amount: number;
    termMonths: number | "";
  }>({ amount: 10000, termMonths: "" });

  const onQuoteChange = useCallback(
    (amount: number, termMonths: number | "") =>
      setQuote({ amount, termMonths }),
    [],
  );

  const loadForm = useCallback(() => {
    setLoadError(null);
    Promise.all([
      api.get<LookupOptions>("/lookup/options"),
      api.get<ConsentTemplate[]>("/consents/templates"),
    ])
      .then(([o, t]) => {
        setOptions(o);
        setTemplates(t);
      })
      .catch((err) => {
        // A dead end here is the worst possible failure - the applicant sees
        // nothing and we learn nothing. Say what broke and offer a retry.
        const reachable =
          !(err instanceof ApiRequestError) || err.payload.statusCode !== 0;
        setLoadError(
          reachable
            ? "We could not load the application form. Please try again in a moment."
            : "We could not reach our servers. Check your connection and try again.",
        );
        if (process.env.NODE_ENV !== "production") {
          // eslint-disable-next-line no-console
          console.error(
            `[apply] Failed to load form data from ${API_BASE}. ` +
              "Is the API running, and does NEXT_PUBLIC_API_URL point at it?",
            err,
          );
        }
      });
  }, []);

  useEffect(() => {
    initTracking();
    api
      .post("/applications/session", { tracking: getTracking() })
      .catch(() => undefined);
    loadForm();
  }, [loadForm]);

  const templatesForStep = useCallback(
    (n: 1 | 2 | 3) => templates.filter((t) => t.step === n),
    [templates],
  );

  // ---------------- the answers live here

  const onStep1Change = useCallback((s: Step1Snapshot) => {
    snapshots.current[1] = s;
  }, []);
  const onStep2Change = useCallback((s: Step2Snapshot) => {
    snapshots.current[2] = s;
  }, []);
  const onStep3Change = useCallback((s: Step3Snapshot) => {
    snapshots.current[3] = s;
  }, []);

  /**
   * Deliberate navigation, which also drops a stale error from an earlier
   * submit - the applicant has just been through the screen it was raised on.
   */
  const goTo = useCallback((target: 1 | 2 | 3) => {
    setStep(target);
    setServerErrors(null);
    window.scrollTo({ top: 0, behavior: "smooth" });
  }, []);

  const onStep1Next = useCallback(
    (part: SubmitRequestPart) => {
      parts.current[1] = part;
      goTo(2);
    },
    [goTo],
  );

  const onStep2Next = useCallback(
    (part: SubmitRequestPart) => {
      parts.current[2] = part;
      goTo(3);
    },
    [goTo],
  );

  // ---------------- the one submit

  /**
   * Everything the applicant entered, in one request.
   *
   * The consents from all three screens go up in a single array; the server
   * splits them back out by the screen each checkbox was shown on, so the
   * evidence rows are unchanged.
   */
  const onSubmitAll = useCallback(
    async (step3Part: SubmitRequestPart) => {
      parts.current[3] = step3Part;
      setServerErrors(null);
      setSubmitting(true);

      const body = {
        ...parts.current[1],
        ...parts.current[2],
        ...step3Part,
        consents: [
          ...(parts.current[1]?.consents ?? []),
          ...(parts.current[2]?.consents ?? []),
          ...(step3Part.consents ?? []),
        ],
        tracking: getTracking(),
      } as SubmitRequest;

      try {
        const result = await api.post<SubmitResponse>(
          "/applications/submit",
          body,
        );
        setOutcome({ kind: "submitted", result });
      } catch (err) {
        if (err instanceof ApiRequestError) {
          if (err.payload.code === "DUPLICATE_APPLICATION") {
            setOutcome({
              kind: "duplicate",
              message: err.payload.message,
              applicationId: err.payload.applicationId,
            });
            return;
          }
          // The server tags field errors with the screen they belong to.
          // An untagged one came from the request-body check that runs before
          // any of that, so fall back to where the fields themselves live.
          const target = (err.payload.step ?? screenFor(err.fieldErrors)) as
            | 1
            | 2
            | 3;
          setServerErrors({
            step: target,
            message: err.payload.message,
            errors: err.fieldErrors,
          });
          if (target !== step) setStep(target);
        } else {
          setServerErrors({
            step,
            message: "Something went wrong. Please try again.",
            errors: {},
          });
        }
        window.scrollTo({ top: 0, behavior: "smooth" });
      } finally {
        setSubmitting(false);
      }
    },
    [step],
  );

  const errorsFor = (n: 1 | 2 | 3) =>
    serverErrors?.step === n ? serverErrors.errors : undefined;
  const bannerFor = (n: 1 | 2 | 3) =>
    serverErrors?.step === n ? serverErrors.message : null;

  // ---------------- render

  if (loadError) {
    return (
      <div
        role="alert"
        className="rounded-xl border border-red-300 bg-red-50 p-6"
      >
        <h1 className="text-lg font-semibold text-red-900">
          We could not start your application
        </h1>
        <p className="mt-2 text-sm leading-relaxed text-red-800">{loadError}</p>
        <div className="mt-5 flex flex-col gap-3 sm:flex-row">
          <button
            type="button"
            onClick={loadForm}
            className="rounded-lg bg-red-700 px-6 py-3 text-sm font-semibold text-white transition hover:bg-red-800"
          >
            Try again
          </button>
          <a
            href={`tel:${(process.env.NEXT_PUBLIC_SUPPORT_PHONE || "(800) 555-0143").replace(/\D/g, "")}`}
            className="rounded-lg border border-red-300 bg-white px-6 py-3 text-center text-sm font-semibold text-red-800 transition hover:bg-red-50"
          >
            Apply by phone:{" "}
            {process.env.NEXT_PUBLIC_SUPPORT_PHONE || "(800) 555-0143"}
          </a>
        </div>
        {process.env.NODE_ENV !== "production" && (
          <p className="mt-5 rounded-md bg-red-100 p-3 font-mono text-xs text-red-900">
            dev hint: the form loads from {API_BASE}/api - start the API (npm
            run start:dev in loan-backend) or set NEXT_PUBLIC_API_URL in
            loan-frontend/.env.local
          </p>
        )}
      </div>
    );
  }

  if (!options) {
    return (
      <div className="space-y-4" aria-busy="true">
        <div className="h-8 w-40 animate-pulse rounded bg-slate-200" />
        <div className="h-48 animate-pulse rounded-xl bg-slate-200" />
        <div className="h-64 animate-pulse rounded-xl bg-slate-200" />
      </div>
    );
  }

  if (outcome.kind === "duplicate") {
    return (
      <DuplicateScreen
        message={outcome.message}
        applicationId={outcome.applicationId}
      />
    );
  }

  if (outcome.kind === "submitted") {
    return <SubmittedScreen result={outcome.result} />;
  }

  return (
    <>
      <LeadCertificationScripts />

      <ProgressIndicator current={step} onNavigate={goTo} />

      {/* Form on the left, live quote on the right. On narrow screens the
          quote collapses to a pinned bar so the payment is never off-screen. */}
      <div className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_20rem] lg:gap-10">
        <div className="min-w-0">
          {step === 1 && (
            <Step1
              options={options}
              consentTemplates={templatesForStep(1)}
              initial={snapshots.current[1]}
              onNext={onStep1Next}
              onChange={onStep1Change}
              submitting={submitting}
              serverErrors={errorsFor(1)}
              serverBanner={bannerFor(1)}
              onQuoteChange={onQuoteChange}
            />
          )}

          {step === 2 && (
            <Step2
              options={options}
              consentTemplates={templatesForStep(2)}
              residenceState={snapshots.current[1]?.state}
              initial={snapshots.current[2]}
              onNext={onStep2Next}
              onChange={onStep2Change}
              onBack={() => goTo(1)}
              submitting={submitting}
              serverErrors={errorsFor(2)}
              serverBanner={bannerFor(2)}
            />
          )}

          {step === 3 && (
            <Step3
              options={options}
              consentTemplates={templatesForStep(3)}
              requestedAmount={quote.amount}
              initial={snapshots.current[3]}
              onSubmit={onSubmitAll}
              onChange={onStep3Change}
              onBack={() => goTo(2)}
              submitting={submitting}
              serverErrors={errorsFor(3)}
              serverBanner={bannerFor(3)}
            />
          )}
        </div>

        <div className="hidden lg:block">
          <QuoteSummary
            amount={quote.amount}
            termMonths={quote.termMonths}
            step={step}
          />
        </div>
      </div>

      <QuoteBar amount={quote.amount} termMonths={quote.termMonths} />
    </>
  );
}

/**
 * One application per applicant. The reference is shown so they can look it
 * up rather than be left wondering which one we already hold.
 */
function DuplicateScreen({
  message,
  applicationId,
}: {
  message: string;
  applicationId?: string;
}) {
  return (
    <div className="space-y-5 rounded-xl border border-slate-200 bg-white p-6">
      <h1 className="text-2xl font-semibold text-brand-900">
        We already have an application for you
      </h1>
      <p className="text-sm leading-relaxed text-slate-600">{message}</p>
      {applicationId && (
        <p className="rounded-lg bg-slate-50 px-4 py-3 text-sm text-slate-700">
          Your reference: <strong>{applicationId}</strong>
        </p>
      )}
      <a
        href="/loan-status"
        className="inline-block rounded-lg bg-brand-600 px-6 py-3 text-sm font-semibold text-white transition hover:bg-brand-700"
      >
        Check my application status
      </a>
    </div>
  );
}

/**
 * The end of the form.
 *
 * No decision is made here and none is implied - the application is in, and
 * the one thing still outstanding is the applicant confirming their bank
 * account from the email we have just sent.
 */
function SubmittedScreen({ result }: { result: SubmitResponse }) {
  return (
    <div className="space-y-5 rounded-xl border border-brand-300 bg-white p-6">
      <div className="text-4xl" aria-hidden="true">
        ✅
      </div>
      <h1 className="text-2xl font-semibold text-brand-900">
        Application received
      </h1>

      <div className="rounded-xl border border-amber-300 bg-amber-50 p-5">
        <p className="text-xs font-semibold uppercase tracking-wider text-amber-800">
          Status
        </p>
        <p className="mt-1 text-2xl font-semibold tracking-tight text-amber-900">
          {result.statusLabel || "Bank Verification Pending"}
        </p>
        <p className="mt-2 text-sm leading-relaxed text-amber-900">
          <strong>One last step:</strong> check your email and click the
          verification link to confirm your bank account belongs to you. We
          have just sent it, and we will send reminders over the next three
          days if we do not hear from you.
        </p>
      </div>

      <dl className="divide-y divide-slate-100 rounded-lg bg-slate-50 px-4">
        <div className="flex items-baseline justify-between py-3">
          <dt className="text-sm text-slate-500">Your reference</dt>
          <dd className="text-sm font-semibold text-brand-900">
            {result.applicationId}
          </dd>
        </div>
        {result.loanAmount != null && (
          <div className="flex items-baseline justify-between py-3">
            <dt className="text-sm text-slate-500">Amount requested</dt>
            <dd className="text-sm font-medium text-slate-800">
              {formatCurrency(result.loanAmount)}
              {result.loanTermMonths
                ? ` over ${result.loanTermMonths} months`
                : ""}
            </dd>
          </div>
        )}
        <div className="flex items-baseline justify-between py-3">
          <dt className="text-sm text-slate-500">Deposit account</dt>
          <dd className="text-sm font-medium text-slate-800">
            {result.bankName || "Your bank"}, ending{" "}
            {result.accountNumberMasked}
          </dd>
        </div>
      </dl>

      <p className="text-sm leading-relaxed text-slate-600">
        Keep your reference safe - you can check your application on our{" "}
        <a href="/loan-status" className="font-medium text-brand-700 underline">
          Loan Status
        </a>{" "}
        page at any time.
      </p>

      <p className="text-xs leading-relaxed text-slate-500">
        Complete your bank verification only on the page our email link or your
        status page opens. We never ask for your bank sign-in by reply, over the
        phone or by text - if a message does, forward it to
        security@newloans.com.
      </p>
    </div>
  );
}

export { formatCurrency };
