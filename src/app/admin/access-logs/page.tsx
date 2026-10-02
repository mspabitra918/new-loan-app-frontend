"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { AccessLog, adminApi, AdminApiError } from "@/lib/admin-api";
import { useAdminAuth } from "@/components/admin/AdminAuth";
import { Card, ErrorNote, fmtDate } from "@/components/admin/ui";

const FIELD_LABELS: Record<string, string> = {
  ssn: "Social Security number",
  dl_number: "Driver's licence",
  account_number: "Account number",
  routing_number: "Routing number",
};

/**
 * Every reveal of a masked value, granted or denied.
 * This is the record that makes role-based access enforceable after the fact.
 */
export default function AccessLogsPage() {
  const { user } = useAdminAuth();
  const [logs, setLogs] = useState<AccessLog[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");

  const load = () => {
    setLoading(true);
    setError(null);
    adminApi
      .accessLogs({ from: from || undefined, to: to || undefined })
      .then(setLogs)
      .catch((e: AdminApiError) => setError(e.message))
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    if (user) load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user]);

  if (!user) return null;

  const denied = logs.filter((l) => !l.granted).length;

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight text-brand-900">
          Access logs
        </h1>
        <p className="mt-1 text-sm text-slate-500">
          {logs.length} reveal attempt{logs.length === 1 ? "" : "s"}
          {denied > 0 && (
            <span className="text-red-700"> &middot; {denied} denied</span>
          )}
        </p>
      </div>

      <Card>
        <div className="flex flex-wrap items-end gap-3">
          <div className="flex flex-col gap-1.5">
            <label
              htmlFor="from"
              className="text-xs font-medium text-slate-600"
            >
              From
            </label>
            <input
              id="from"
              type="date"
              value={from}
              onChange={(e) => setFrom(e.target.value)}
              className="rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-brand-500"
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <label htmlFor="to" className="text-xs font-medium text-slate-600">
              To
            </label>
            <input
              id="to"
              type="date"
              value={to}
              onChange={(e) => setTo(e.target.value)}
              className="rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-brand-500"
            />
          </div>
          <button
            type="button"
            onClick={load}
            className="rounded-lg bg-brand-600 px-4 py-2 text-sm font-semibold text-white hover:bg-brand-700"
          >
            Apply
          </button>
          {(from || to) && (
            <button
              type="button"
              onClick={() => {
                setFrom("");
                setTo("");
                setTimeout(load, 0);
              }}
              className="pb-2 text-sm text-slate-500 underline hover:text-slate-700"
            >
              Clear
            </button>
          )}
        </div>
      </Card>

      {error && <ErrorNote message={error} />}

      <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white">
        <table className="w-full min-w-[820px] text-sm">
          <thead>
            <tr className="border-b border-slate-200 bg-slate-50 text-left text-xs uppercase tracking-wider text-slate-500">
              <th scope="col" className="px-4 py-3 font-semibold">
                When
              </th>
              <th scope="col" className="px-4 py-3 font-semibold">
                Field
              </th>
              <th scope="col" className="px-4 py-3 font-semibold">
                Outcome
              </th>
              <th scope="col" className="px-4 py-3 font-semibold">
                Application
              </th>
              <th scope="col" className="px-4 py-3 font-semibold">
                IP address
              </th>
              <th scope="col" className="px-4 py-3 font-semibold">
                Stated reason
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {loading && (
              <tr>
                <td
                  colSpan={6}
                  className="px-4 py-10 text-center text-sm text-slate-400"
                >
                  Loading...
                </td>
              </tr>
            )}
            {!loading && logs.length === 0 && (
              <tr>
                <td
                  colSpan={6}
                  className="px-4 py-10 text-center text-sm text-slate-400"
                >
                  No reveals recorded in this period.
                </td>
              </tr>
            )}
            {!loading &&
              logs.map((l) => (
                <tr key={l.id} className={l.granted ? "" : "bg-red-50/50"}>
                  <td className="whitespace-nowrap px-4 py-3 text-xs text-slate-600">
                    {fmtDate(l.accessedAt)}
                  </td>
                  <td className="px-4 py-3 font-medium text-slate-800">
                    {FIELD_LABELS[l.fieldName] ?? l.fieldName}
                  </td>
                  <td className="px-4 py-3">
                    <span
                      className={`rounded-full border px-2 py-0.5 text-xs font-medium ${
                        l.granted
                          ? "border-emerald-200 bg-emerald-50 text-emerald-700"
                          : "border-red-200 bg-red-50 text-red-700"
                      }`}
                    >
                      {l.granted ? "Revealed" : "Denied"}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <Link
                      href={`/admin/applications/${l?.application?.application_id}`}
                      className="font-mono text-xs text-brand-700 hover:underline"
                    >
                      {l?.application?.application_id}
                    </Link>
                  </td>
                  <td className="px-4 py-3 font-mono text-xs text-slate-600">
                    {l.ipAddress}
                  </td>
                  <td className="px-4 py-3 text-xs italic text-slate-600">
                    {l.reason ?? "-"}
                  </td>
                </tr>
              ))}
          </tbody>
        </table>
      </div>

      <p className="text-xs leading-relaxed text-slate-500">
        Rows are append-only. The application has no path that updates or
        deletes them.
      </p>
    </div>
  );
}
