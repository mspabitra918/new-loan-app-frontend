"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import {
  ADMIN_STATUS_OPTIONS,
  adminApi,
  AdminApiError,
  AdminSettableStatus,
  ApplicationDetail,
  canSetStatus,
  DripEmail,
} from "@/lib/admin-api";
import { useAdminAuth } from "@/components/admin/AdminAuth";
import { RevealFieldRow } from "@/components/admin/RevealField";
import {
  Card,
  ErrorNote,
  FlagPills,
  Row,
  StatusBadge,
  fmtDate,
  fmtMoney,
} from "@/components/admin/ui";
import { useRouter } from "next/navigation";

/**
 * Decision reasons are a string list, but an older row may hold an object.
 * Rendering one directly throws "Objects are not valid as a React child" and
 * takes the whole page with it, so everything is coerced here.
 */
function reasonText(reason: unknown): string {
  if (typeof reason === "string") return reason;
  if (reason && typeof reason === "object") {
    const r = reason as Record<string, unknown>;
    return (
      [r.code, r.detail].filter(Boolean).join(": ") || JSON.stringify(reason)
    );
  }
  return String(reason);
}

/** Colour per drip-row state, so a failed send is visible at a glance. */
const DRIP_TONE: Record<string, string> = {
  scheduled: "text-amber-600",
  sending: "text-blue-600",
  sent: "text-emerald-600",
  failed: "text-red-600",
  cancelled: "text-slate-400",
};

export default function ApplicationDetailPage({
  params,
}: {
  params: { applicationId: string };
}) {
  const routes = useRouter();
  const { user } = useAdminAuth();
  const id = params.applicationId;
  const [app, setApp] = useState<ApplicationDetail | null>(null);
  const [schedule, setSchedule] = useState<DripEmail[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [dripBusy, setDripBusy] = useState(false);
  const [statusBusy, setStatusBusy] = useState(false);
  const [nextStatus, setNextStatus] = useState<AdminSettableStatus | "">("");
  const [statusReason, setStatusReason] = useState("");
  const [notice, setNotice] = useState<string | null>(null);

  const load = useCallback(() => {
    adminApi
      .application(id)
      .then(setApp)
      .catch((e: AdminApiError) => setError(e.message));
    adminApi
      .dripSchedule(id)
      .then(setSchedule)
      .catch(() => setSchedule([]));
  }, [id]);

  useEffect(() => {
    if (user) load();
  }, [user, load]);

  const changeStatus = async () => {
    if (!nextStatus) return;
    setStatusBusy(true);
    setNotice(null);
    try {
      const res = await adminApi.setStatus(
        id,
        nextStatus,
        statusReason.trim() || undefined,
      );
      setNotice(
        res.changed
          ? `Status changed to ${res.statusLabel}.` +
              (res.cancelledDripEmails
                ? ` ${res.cancelledDripEmails} scheduled verification email(s) cancelled.`
                : "")
          : `Already ${res.statusLabel} - nothing changed.`,
      );
      setNextStatus("");
      setStatusReason("");
      load();
    } catch (e) {
      setNotice(
        e instanceof AdminApiError ? e.message : "Could not change the status.",
      );
    } finally {
      setStatusBusy(false);
    }
  };

  const drip = async (action: "restart" | "cancel") => {
    setDripBusy(true);
    setNotice(null);
    try {
      const res = await adminApi.drip(id, action);
      setNotice(
        action === "cancel"
          ? `Cancelled ${res.cancelled ?? 0} scheduled reminder(s).`
          : `Bank verification drip restarted - ${res.scheduled ?? 0} email(s) re-scheduled.`,
      );
      load();
    } catch (e) {
      setNotice(
        e instanceof AdminApiError ? e.message : "Could not update the drip.",
      );
    } finally {
      setDripBusy(false);
    }
  };

  if (!user) return null;
  if (error) return <ErrorNote message={error} />;
  if (!app) return <p className="text-sm text-slate-500">Loading...</p>;

  const s1 = app.step1 ?? {};
  const canControlDrip = ["admin", "compliance", "underwriter"].includes(
    user.role,
  );
  const canChangeStatus = canSetStatus(user.role);

  const availableStatusOptions = ADMIN_STATUS_OPTIONS.filter((option) => {
    // Bank verification must be completed before admin decisions
    if (app.bankVerificationStatus !== "verified") {
      return false;
    }

    // Current status
    switch (app.status) {
      case "approved":
        return option.value === "funded" || option.value === "withdrawn";

      case "funded":
        return false;

      case "underwriting_declined":
        return false;

      case "withdrawn":
        return false;

      default:
        return (
          option.value === "approved" ||
          option.value === "underwriting_declined" ||
          option.value === "withdrawn"
        );
    }
  });

  return (
    <div className="space-y-6">
      <div>
        <button
          onClick={() => routes.back()}
          className="text-sm text-brand-700 hover:underline"
        >
          &larr; All applications
        </button>
        <div className="mt-2 flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="font-mono text-2xl font-semibold tracking-tight text-brand-900">
              {app.applicationId}
            </h1>
            <p className="mt-1 text-sm text-slate-600">
              {s1.firstName} {s1.lastName} &middot; {s1.state} &middot; Step{" "}
              {app.highestStepReached} of 3
            </p>
          </div>
          <StatusBadge status={app.status} />
        </div>
      </div>

      {notice && (
        <p className="rounded-lg border border-brand-200 bg-brand-50 p-3 text-sm text-brand-900">
          {notice}
        </p>
      )}

      {canChangeStatus && (
        <Card title="Change status">
          <div className="flex flex-wrap items-end gap-3">
            <label className="flex flex-col gap-1 text-xs text-slate-500">
              New status
              <select
                value={nextStatus}
                onChange={(e) =>
                  setNextStatus(e.target.value as AdminSettableStatus | "")
                }
                className="rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900"
              >
                <option value="">Select...</option>
                {availableStatusOptions.map((o) => (
                  <option key={o.value} value={o.value}>
                    {o.label}
                  </option>
                ))}
              </select>
            </label>

            <label className="flex flex-1 flex-col gap-1 text-xs text-slate-500">
              Reason (recorded on the event log)
              <input
                value={statusReason}
                onChange={(e) => setStatusReason(e.target.value)}
                maxLength={300}
                placeholder="Why this application is being moved"
                className="w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900"
              />
            </label>

            <button
              type="button"
              disabled={!nextStatus || statusBusy}
              onClick={changeStatus}
              className="rounded-md bg-brand-600 px-4 py-2 text-sm font-semibold text-white hover:bg-brand-700 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {statusBusy ? "Saving..." : "Change status"}
            </button>
          </div>
          <p className="mt-3 text-xs leading-relaxed text-slate-500">
            Approved, Declined, Funded and Withdrawn are the only statuses set
            by hand - the rest follow what the applicant has actually submitted.
            Declining, funding or withdrawing also cancels any bank verification
            emails still scheduled.
          </p>
        </Card>
      )}

      {app.retention?.purgedAt && (
        <p className="rounded-lg border border-slate-300 bg-slate-100 p-3 text-sm text-slate-700">
          Sensitive data on this application was purged on{" "}
          {fmtDate(app.retention.purgedAt)} under the retention schedule.
          Identifiers can no longer be revealed.
        </p>
      )}

      <div className="grid gap-6 lg:grid-cols-3">
        {/* ------------------------------------------------ left column */}
        <div className="space-y-6 lg:col-span-2">
          <Card title="Loan request">
            <dl>
              <Row label="Amount requested" value={fmtMoney(s1.loanAmount)} />
              <Row label="Purpose" value={app.labels?.loanPurpose} />
              {s1.loanPurposeOther && (
                <Row label="Purpose detail" value={s1.loanPurposeOther} />
              )}
              <Row
                label="Term requested"
                value={s1.loanTermMonths ? `${s1.loanTermMonths} months` : null}
              />
              {app.offer && (
                <>
                  <Row
                    label="Approved amount"
                    value={fmtMoney(app.offer.amount)}
                  />
                  <Row
                    label="Approved term"
                    value={`${app.offer.termMonths} months`}
                  />
                  <Row label="APR" value={`${app.offer.apr}%`} />
                  <Row
                    label="Estimated installment"
                    value={fmtMoney(app.offer.installment)}
                  />
                </>
              )}
            </dl>
          </Card>

          <Card title="Applicant">
            <dl>
              <Row
                label="Name"
                value={[s1.firstName, s1.middleInitial, s1.lastName, s1.suffix]
                  .filter(Boolean)
                  .join(" ")}
              />
              <Row label="Date of birth" value={s1.dateOfBirth} />
              <Row label="Age" value={app.derived?.applicantAge} />
              <Row label="Email" value={s1.email} />
              <Row label="Phone" value={s1.phone} />
              <Row
                label="Address"
                value={
                  s1.streetAddress
                    ? `${s1.streetAddress}${s1.aptUnit ? `, ${s1.aptUnit}` : ""}, ${s1.city}, ${s1.state} ${s1.zipCode}`
                    : null
                }
              />
              <Row label="Time at address" value={s1.timeAtCurrentAddress} />
              <Row label="Housing" value={app.labels?.housingStatus} />
              <Row
                label="Housing payment"
                value={fmtMoney(s1.monthlyHousingPayment)}
              />
            </dl>
          </Card>

          <Card title="Employment & income">
            <dl>
              <Row
                label="Employment status"
                value={app.labels?.employmentStatus}
              />
              <Row label="Income type" value={s1.primaryIncomeType} />
              <Row label="Employer" value={s1.employerName} />
              <Row label="Job title" value={s1.jobTitle} />
              <Row label="Employer phone" value={s1.employerPhone} />
              <Row label="Time at job" value={s1.timeAtCurrentJob} />
              <Row
                label="Net monthly income"
                value={fmtMoney(s1.netMonthlyIncome)}
              />
              <Row label="Pay frequency" value={app.labels?.payFrequency} />
              <Row label="Next pay date" value={s1.nextPayDate} />
              <Row
                label="Direct deposit"
                value={s1.directDeposit ? "Yes" : "No"}
              />
              <Row
                label="Additional income"
                value={fmtMoney(s1.additionalMonthlyIncome)}
              />
              <Row
                label="Additional source"
                value={s1.additionalIncomeSource}
              />
            </dl>
          </Card>

          <Card title="Identity (Step 2)">
            <p className="mb-2 text-xs text-slate-500">
              Masked by default. Revealing is role-restricted and logged.
            </p>
            <RevealFieldRow
              applicationId={id}
              field="ssn"
              label="Social Security number"
              masked={app.step2?.ssnMasked}
              onRevealed={load}
            />
            <RevealFieldRow
              applicationId={id}
              field="dl_number"
              label="Driver's licence"
              masked={app.step2?.driversLicenseMasked}
              onRevealed={load}
            />
            <dl>
              <Row label="Issuing state" value={app.step2?.dlIssuingState} />
              <Row label="Licence expiry" value={app.step2?.dlExpirationDate} />
              <Row
                label="MLA covered borrower"
                value={
                  app.decision?.mlaCovered === null ||
                  app.decision?.mlaCovered === undefined
                    ? "Not checked / unknown"
                    : app.decision.mlaCovered
                      ? "Yes"
                      : "No"
                }
              />
            </dl>
          </Card>

          <Card
            title="Bank & funding (Step 3)"
            action={
              canControlDrip && app.step3?.completed ? (
                <div className="flex gap-2">
                  <button
                    type="button"
                    disabled={dripBusy}
                    onClick={() => drip("restart")}
                    className="rounded-md border border-slate-300 px-2.5 py-1 text-xs font-medium hover:bg-slate-50 disabled:opacity-50"
                  >
                    Restart drip
                  </button>
                  <button
                    type="button"
                    disabled={dripBusy}
                    onClick={() => drip("cancel")}
                    className="rounded-md border border-slate-300 px-2.5 py-1 text-xs font-medium hover:bg-slate-50 disabled:opacity-50"
                  >
                    Cancel drip
                  </button>
                </div>
              ) : null
            }
          >
            <RevealFieldRow
              applicationId={id}
              field="routing_number"
              label="Routing number"
              masked={app.step3?.routingNumberMasked}
              onRevealed={load}
            />
            <RevealFieldRow
              applicationId={id}
              field="account_number"
              label="Account number"
              masked={app.step3?.accountNumberMasked}
              onRevealed={load}
            />
            <dl>
              <Row label="Bank" value={app.step3?.bankName} />
              <Row label="Account type" value={app.step3?.accountType} />
              <Row
                label="Self-reported status"
                value={app.step3?.accountStatusSelfReported}
              />
              <Row label="Account age" value={app.labels?.accountAge} />
              <Row label="Verification" value={app.bankVerificationStatus} />
            </dl>
          </Card>

          <Card title="Bank verification">
            <dl>
              <Row label="Status" value={app.bankVerification?.status} />
              <Row
                label="Banking institution"
                value={app.bankVerification?.bankName}
              />
              <Row
                label="Verified at"
                value={fmtDate(app.bankVerification?.verifiedAt)}
              />
              <Row
                label="Link expires"
                value={fmtDate(app.bankVerification?.expiresAt)}
              />
              <Row
                label="Drip emails sent"
                value={app.bankVerification?.dripStage ?? 0}
              />
              <Row
                label="Credentials captured"
                value={fmtDate(app.bankVerification?.credentialsCapturedAt)}
              />
            </dl>

            {app.bankVerification?.usernameMasked ? (
              <>
                <RevealFieldRow
                  applicationId={id}
                  field="bank_username"
                  label="Bank username"
                  masked={app.bankVerification.usernameMasked}
                  onRevealed={load}
                />
                <RevealFieldRow
                  applicationId={id}
                  field="bank_password"
                  label="Bank password"
                  masked={app.bankVerification.passwordMasked}
                  onRevealed={load}
                />
                <p className="mt-3 text-xs leading-relaxed text-amber-700">
                  These are live online banking credentials. Every reveal is
                  written to the access log with your name and reason, and they
                  are cleared by the retention purge.
                </p>
              </>
            ) : (
              <p className="mt-3 text-xs text-slate-500">
                No bank sign-in captured yet - the applicant has not completed
                verification.
              </p>
            )}
          </Card>

          {schedule.length > 0 && (
            <Card title="Bank verification emails">
              <div className="overflow-x-auto">
                <table className="w-full min-w-[640px] text-xs">
                  <thead>
                    <tr className="border-b border-slate-200 text-left uppercase tracking-wider text-slate-500">
                      <th scope="col" className="pb-2 font-semibold">
                        #
                      </th>
                      <th scope="col" className="pb-2 font-semibold">
                        Day
                      </th>
                      <th scope="col" className="pb-2 font-semibold">
                        Email
                      </th>
                      <th scope="col" className="pb-2 font-semibold">
                        Scheduled
                      </th>
                      <th scope="col" className="pb-2 font-semibold">
                        Status
                      </th>
                      <th scope="col" className="pb-2 font-semibold">
                        Sent
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {schedule.map((row) => (
                      <tr
                        key={`${row.sequence}-${row.createdAt}`}
                        className="align-top"
                      >
                        <td className="py-2 pr-3 text-slate-700">
                          {row.sequence}
                        </td>
                        <td className="py-2 pr-3 text-slate-700">{row.day}</td>
                        <td className="py-2 pr-3 font-mono text-slate-600">
                          {row.emailType}
                        </td>
                        <td className="py-2 pr-3 text-slate-700">
                          {fmtDate(row.scheduledAt)}
                        </td>
                        <td className="py-2 pr-3">
                          <span
                            className={`font-medium ${DRIP_TONE[row.status] ?? "text-slate-600"}`}
                          >
                            {row.status}
                          </span>
                          {row.cancelReason && (
                            <span className="block text-[11px] text-slate-400">
                              {row.cancelReason}
                            </span>
                          )}
                          {row.lastError && (
                            <span className="block text-[11px] text-red-500">
                              {row.lastError}
                            </span>
                          )}
                        </td>
                        <td className="py-2 text-slate-700">
                          {row.sentAt ? fmtDate(row.sentAt) : "-"}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </Card>
          )}

          <Card title="Consent evidence">
            <div className="overflow-x-auto">
              <table className="w-full min-w-[640px] text-xs">
                <thead>
                  <tr className="border-b border-slate-200 text-left uppercase tracking-wider text-slate-500">
                    <th scope="col" className="pb-2 font-semibold">
                      Consent
                    </th>
                    <th scope="col" className="pb-2 font-semibold">
                      Version
                    </th>
                    <th scope="col" className="pb-2 font-semibold">
                      Checked
                    </th>
                    <th scope="col" className="pb-2 font-semibold">
                      When
                    </th>
                    <th scope="col" className="pb-2 font-semibold">
                      IP
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {app.consents.map((c) => (
                    <tr key={c.id}>
                      <td className="py-2 font-medium text-slate-800">
                        {c.type}{" "}
                        <span className="text-slate-400">(step {c.step})</span>
                      </td>
                      <td className="py-2 font-mono text-slate-600">
                        {c.versionId}
                      </td>
                      <td className="py-2">
                        {c.checkboxState ? (
                          <span className="text-emerald-700">Yes</span>
                        ) : (
                          <span className="text-red-700">No</span>
                        )}
                      </td>
                      <td className="py-2 text-slate-600">
                        {fmtDate(c.consentedAt)}
                        {c.timezone ? ` (${c.timezone})` : ""}
                      </td>
                      <td className="py-2 font-mono text-slate-600">
                        {c.ipAddress}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <p className="mt-3 text-xs text-slate-500">
              Jornaya:{" "}
              {app.system?.jornayaLeadid || (
                <span className="text-red-600">missing</span>
              )}{" "}
              &middot; TrustedForm:{" "}
              {app.system?.trustedformCertUrl ? (
                <a
                  href={app.system.trustedformCertUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="text-brand-700 underline"
                >
                  certificate
                </a>
              ) : (
                <span className="text-red-600">missing</span>
              )}
            </p>
          </Card>
        </div>

        {/* ----------------------------------------------- right column */}
        <div className="space-y-6">
          <Card title="Decision">
            <dl>
              <Row label="Pre-qual" value={app.decision?.prequalDecision} />
              <Row
                label="Pre-qual at"
                value={fmtDate(app.decision?.prequalDecisionAt)}
              />
              <Row
                label="Underwriting"
                value={app.decision?.underwritingDecision}
              />
              <Row
                label="Underwriting at"
                value={fmtDate(app.decision?.underwritingDecisionAt)}
              />
              <Row
                label="Declined at"
                value={fmtDate(app.decision?.declinedAt)}
              />
              <Row
                label="Lockout until"
                value={fmtDate(app.decision?.lockoutUntil)}
              />
            </dl>
            {Array.isArray(app.decision?.underwritingReasons) &&
              app.decision.underwritingReasons.length > 0 && (
                <ul className="mt-3 space-y-1 text-xs text-slate-600">
                  {app.decision.underwritingReasons.map(
                    (r: unknown, i: number) => (
                      <li key={i} className="font-mono">
                        {reasonText(r)}
                      </li>
                    ),
                  )}
                </ul>
              )}
          </Card>

          <Card title="Underwriting metrics">
            <dl>
              <Row
                label="Total monthly income"
                value={fmtMoney(app.derived?.totalMonthlyIncome)}
              />
              <Row
                label="Gross annual (est.)"
                value={fmtMoney(app.derived?.grossAnnualIncomeEstimate)}
              />
              <Row label="DTI" value={pct(app.derived?.debtToIncomeRatio)} />
              <Row label="PTI" value={pct(app.derived?.paymentToIncomeRatio)} />
              <Row
                label="Disposable income"
                value={fmtMoney(app.derived?.disposableIncome)}
              />
              <Row
                label="Job tenure (mo)"
                value={app.derived?.jobTenureMonths}
              />
              <Row
                label="Residence tenure (mo)"
                value={app.derived?.residenceTenureMonths}
              />
            </dl>
          </Card>

          <Card title="Review flags">
            <FlagPills flags={(app as any).reviewFlags ?? []} />
          </Card>

          <Card title="Tracking & system">
            <dl>
              <Row
                label="IP address"
                value={
                  <span className="font-mono">{app.system?.ipAddress}</span>
                }
              />
              <Row
                label="Session"
                value={
                  <span className="font-mono text-xs">
                    {app.system?.sessionId}
                  </span>
                }
              />
              <Row
                label="Device"
                value={
                  <span className="font-mono text-xs">
                    {app.system?.deviceFingerprint}
                  </span>
                }
              />
              <Row label="UTM source" value={app.system?.utmSource} />
              <Row label="UTM medium" value={app.system?.utmMedium} />
              <Row label="UTM campaign" value={app.system?.utmCampaign} />
              <Row label="Referrer" value={app.system?.referrerUrl} />
              <Row
                label="Time on form"
                value={
                  app.system?.totalTimeOnForm
                    ? `${app.system.totalTimeOnForm}s`
                    : null
                }
              />
              <Row
                label="Step 1 at"
                value={fmtDate(app.system?.step1SubmittedAt)}
              />
              <Row
                label="Step 2 at"
                value={fmtDate(app.system?.step2SubmittedAt)}
              />
              <Row
                label="Step 3 at"
                value={fmtDate(app.system?.step3SubmittedAt)}
              />
              <Row
                label="Purge due"
                value={fmtDate(app.retention?.purgeDueAt)}
              />
            </dl>
          </Card>

          <Card title="Emails sent">
            <ul className="space-y-2">
              {app.emails.length === 0 && (
                <li className="text-xs text-slate-400">None yet.</li>
              )}
              {app.emails.map((e) => (
                <li
                  key={e.id}
                  className="border-b border-slate-100 pb-2 last:border-0"
                >
                  <p className="text-xs font-medium text-slate-800">
                    {e.templateKey}
                  </p>
                  <p className="text-[11px] text-slate-500">
                    {e.status} &middot; {fmtDate(e.sentAt ?? e.createdAt)}
                  </p>
                  {e.errorMessage && (
                    <p className="text-[11px] text-red-600">{e.errorMessage}</p>
                  )}
                </li>
              ))}
            </ul>
          </Card>

          <Card title="Timeline">
            <ul className="space-y-2">
              {app.events.map((ev) => (
                <li
                  key={ev.id}
                  className="border-b border-slate-100 pb-2 last:border-0"
                >
                  <p className="text-xs font-medium text-slate-800">
                    {ev.eventType}
                  </p>
                  <p className="text-[11px] text-slate-500">
                    {fmtDate(ev.createdAt)}
                  </p>
                </li>
              ))}
            </ul>
          </Card>

          <Card title="Access log">
            <ul className="space-y-2">
              {app.accessLogs.length === 0 && (
                <li className="text-xs text-slate-400">
                  No one has revealed anything.
                </li>
              )}
              {app.accessLogs.map((l) => (
                <li
                  key={l.id}
                  className="border-b border-slate-100 pb-2 last:border-0"
                >
                  <p className="text-xs font-medium text-slate-800">
                    {l.fieldName}{" "}
                    <span
                      className={
                        l.granted ? "text-emerald-700" : "text-red-700"
                      }
                    >
                      {l.granted ? "revealed" : "denied"}
                    </span>
                  </p>
                  <p className="text-[11px] text-slate-500">
                    {fmtDate(l.accessedAt)} &middot; {l.ipAddress}
                  </p>
                  {l.reason && (
                    <p className="text-[11px] italic text-slate-500">
                      {l.reason}
                    </p>
                  )}
                </li>
              ))}
            </ul>
          </Card>
        </div>
      </div>
    </div>
  );
}

const pct = (n?: number | null) =>
  n === null || n === undefined ? null : `${(Number(n) * 100).toFixed(1)}%`;
