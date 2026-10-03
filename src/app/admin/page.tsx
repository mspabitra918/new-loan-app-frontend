"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { adminApi, AdminApiError, QueueHealth, Stats } from "@/lib/admin-api";
import { useAdminAuth } from "@/components/admin/AdminAuth";
import { Card, ErrorNote, STATUS_LABELS } from "@/components/admin/ui";

export default function AdminDashboard() {
  const { user } = useAdminAuth();
  const [stats, setStats] = useState<Stats | null>(null);
  const [queues, setQueues] = useState<QueueHealth | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!user) return;
    adminApi
      .stats()
      .then(setStats)
      .catch((e: AdminApiError) => setError(e.message));
    // Queue health is restricted to admin and compliance.
    if (user.role === "admin" || user.role === "compliance") {
      adminApi
        .queues()
        .then(setQueues)
        .catch(() => undefined);
    }
  }, [user]);

  if (!user) return null;

  const byStatus = (stats?.byStatus ?? [])
    .map((r) => ({ status: r.status, count: Number(r.count) }))
    .sort((a, b) => b.count - a.count);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight text-brand-900">
          Dashboard
        </h1>
        <p className="mt-1 text-sm text-slate-500">
          Signed in as {user.fullName}. What you can see depends on your role.
        </p>
      </div>

      {error && <ErrorNote message={error} />}

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Metric
          label="Total applications"
          value={stats?.total}
          href="/admin/applications"
        />
        <Metric
          label="Flagged for review"
          value={stats?.flagged}
          href="/admin/applications?flagged=true"
          tone="amber"
        />
        <Metric
          label="Awaiting bank verification"
          value={stats?.pendingVerification}
          href="/admin/applications?status=bank_verification_pending"
          tone="amber"
        />
        <Metric
          label="Approved"
          value={byStatus.find((s) => s.status === "approved")?.count ?? 0}
          href="/admin/applications?status=approved"
          tone="emerald"
        />
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card title="Pipeline by status">
          {byStatus.length === 0 ? (
            <p className="text-sm text-slate-400">No applications yet.</p>
          ) : (
            <ul className="space-y-2">
              {byStatus.map((s) => (
                <li key={s.status}>
                  <Link
                    href={`/admin/applications?status=${s.status}`}
                    className="flex items-center justify-between rounded-md px-2 py-1.5 text-sm hover:bg-slate-50"
                  >
                    <span className="text-slate-700">
                      {STATUS_LABELS[s.status] ?? s.status}
                    </span>
                    <span className="font-semibold tabular-nums text-brand-900">
                      {s.count}
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </Card>

        {/* {queues ? (
          <Card title="Queue health">
            <div className="grid gap-5 sm:grid-cols-2">
              <QueueBlock title="Email queue" counts={queues.email} keys={QUEUE_KEYS} />
              <QueueBlock
                title="Bank verification drip"
                counts={queues.bankVerificationDrip}
                keys={DRIP_KEYS}
              />
            </div>
            <p className="mt-4 text-xs leading-relaxed text-slate-500">
              The drip counts are rows of the six-email verification sequence, not queue
              depth. Scheduled rows are cancelled the moment an applicant verifies.
            </p>
          </Card>
        ) : (
          <Card title="Queue health">
            <p className="text-sm text-slate-400">
              Visible to compliance and administrators only.
            </p>
          </Card>
        )} */}
      </div>
    </div>
  );
}

function Metric({
  label,
  value,
  href,
  tone = "slate",
}: {
  label: string;
  value?: number;
  href: string;
  tone?: "slate" | "amber" | "emerald";
}) {
  const ring =
    tone === "amber"
      ? "border-amber-200 bg-amber-50"
      : tone === "emerald"
        ? "border-emerald-200 bg-emerald-50"
        : "border-slate-200 bg-white";
  return (
    <Link
      href={href}
      className={`block rounded-xl border p-5 transition hover:shadow-sm ${ring}`}
    >
      <p className="text-xs font-medium text-slate-500">{label}</p>
      <p className="mt-1.5 text-3xl font-semibold tabular-nums tracking-tight text-brand-900">
        {value ?? "-"}
      </p>
    </Link>
  );
}

const QUEUE_KEYS = ["waiting", "active", "delayed", "completed", "failed"];
const DRIP_KEYS = ["scheduled", "sending", "sent", "failed", "cancelled"];

function QueueBlock({
  title,
  counts,
  keys,
}: {
  title: string;
  counts: Record<string, number>;
  keys: string[];
}) {
  return (
    <div>
      <p className="text-xs font-semibold uppercase tracking-wider text-slate-500">
        {title}
      </p>
      <dl className="mt-2 space-y-1">
        {keys.map((k) => (
          <div key={k} className="flex justify-between text-sm">
            <dt className="capitalize text-slate-600">{k}</dt>
            <dd
              className={`font-medium tabular-nums ${
                k === "failed" && counts[k] > 0
                  ? "text-red-600"
                  : "text-slate-800"
              }`}
            >
              {counts?.[k] ?? 0}
            </dd>
          </div>
        ))}
      </dl>
    </div>
  );
}
