"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { api, ApiRequestError } from "@/lib/api";
import { getTracking } from "@/lib/tracking";
import { formatCurrency } from "@/lib/format";
import { DEFAULT_OPTIONS } from "@/lib/default-options";
import { DEFAULT_CONSENT_TEMPLATES } from "@/lib/consent-templates";
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
  | {
      kind: "duplicate";
      message: string;
      applicationId?: string;
      email?: string;
    };

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

interface Parts {
  1?: SubmitRequestPart;
  2?: SubmitRequestPart;
  3?: SubmitRequestPart;
}

interface Snapshots {
  1?: Step1Snapshot;
  2?: Step2Snapshot;
  3?: Step3Snapshot;
}

export function ApplyWizard() {
  const [options, setOptions] = useState<LookupOptions>(DEFAULT_OPTIONS);
  const [templates, setTemplates] = useState<ConsentTemplate[]>(
    DEFAULT_CONSENT_TEMPLATES,
  );
  const [step, setStep] = useState<1 | 2 | 3>(1);

  const parts = useRef<Parts>({});
  const snapshots = useRef<Snapshots>({});

  const [submitting, setSubmitting] = useState(false);
  const [outcome, setOutcome] = useState<Outcome>({ kind: "none" });

  const [serverErrors, setServerErrors] = useState<{
    step: 1 | 2 | 3;
    message: string;
    errors: FieldErrors;
  } | null>(null);

  const [quote, setQuote] = useState<{
    amount: number;
    termMonths: number | "";
  }>({ amount: 10000, termMonths: "" });

  const onQuoteChange = useCallback(
    (amount: number, termMonths: number | "") =>
      setQuote({ amount, termMonths }),
    [],
  );

  useEffect(() => {
    let cancelled = false;

    api
      .get<LookupOptions>("/lookup/options")
      .then((data) => {
        if (!cancelled) {
          setOptions((current) => ({
            ...current,
            ...data,
          }));
        }
      })
      .catch(() => {
        // No backend - DEFAULT_OPTIONS already renders the whole form.
      });

    api
      .get<ConsentTemplate[]>("/consents/templates")
      .then((data) => {
        if (!cancelled && Array.isArray(data) && data.length)
          setTemplates(data);
      })
      .catch(() => {
        // No backend - the bundled templates already render every checkbox.
      });

    return () => {
      cancelled = true;
    };
  }, []);

  const templatesForStep = useCallback(
    (n: 1 | 2 | 3) => templates.filter((t) => t.step === n),
    [templates],
  );

  const onStep1Change = useCallback((s: Step1Snapshot) => {
    snapshots.current[1] = s;
  }, []);
  const onStep2Change = useCallback((s: Step2Snapshot) => {
    snapshots.current[2] = s;
  }, []);
  const onStep3Change = useCallback((s: Step3Snapshot) => {
    snapshots.current[3] = s;
  }, []);

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
              email: err.payload.email,
            });
            return;
          }
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

function DuplicateScreen({
  message,
  applicationId,
  email,
}: {
  message: string;
  applicationId?: string;
  email?: string;
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
        href={`/loan-status?ref=${applicationId}&email=${email}`}
        className="inline-block rounded-lg bg-brand-600 px-6 py-3 text-sm font-semibold text-white transition hover:bg-brand-700"
      >
        Check my application status
      </a>
    </div>
  );
}

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
          verification link to confirm your bank account belongs to you. We have
          just sent it, and we will send reminders over the next three days if
          we do not hear from you.
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
        <a
          href={`/loan-status?ref=${result.applicationId}&email=${result.email}`}
          className="font-medium text-brand-700 underline"
        >
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
