"use client";

import { API_BASE } from "./api";

/**
 * Admin API client.
 *
 * The bearer token is held in sessionStorage, not localStorage: an admin
 * console that can reveal an SSN should not leave a usable token behind in a
 * closed tab on a shared call-centre machine. The stronger option is an
 * httpOnly, SameSite=Strict cookie issued by the API - worth doing before
 * this is exposed outside a trusted network.
 */
const TOKEN_KEY = "ryer.admin.token";
const USER_KEY = "ryer.admin.user";

export type AdminRole =
  | "agent"
  | "closer"
  | "verification"
  | "underwriter"
  | "compliance"
  | "admin";

export interface AdminUser {
  id: string;
  email: string;
  role: AdminRole;
  fullName: string;
}

export class AdminApiError extends Error {
  readonly status: number;
  readonly code?: string;
  constructor(message: string, status: number, code?: string) {
    super(message);
    this.status = status;
    this.code = code;
  }
}

export const tokenStore = {
  get(): string | null {
    try {
      return sessionStorage.getItem(TOKEN_KEY);
    } catch {
      return null;
    }
  },
  getUser(): AdminUser | null {
    try {
      const raw = sessionStorage.getItem(USER_KEY);
      return raw ? (JSON.parse(raw) as AdminUser) : null;
    } catch {
      return null;
    }
  },
  set(token: string, user: AdminUser) {
    try {
      sessionStorage.setItem(TOKEN_KEY, token);
      sessionStorage.setItem(USER_KEY, JSON.stringify(user));
    } catch {
      /* storage blocked - the session simply will not persist across reloads */
    }
  },
  clear() {
    try {
      sessionStorage.removeItem(TOKEN_KEY);
      sessionStorage.removeItem(USER_KEY);
    } catch {
      /* ignore */
    }
  },
};

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const token = tokenStore.get();

  let res: Response;
  try {
    res = await fetch(`${API_BASE}/api${path}`, {
      ...init,
      headers: {
        "Content-Type": "application/json",
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        ...(init?.headers || {}),
      },
      cache: "no-store",
    });
  } catch {
    throw new AdminApiError(
      "Could not reach the API. Check your connection.",
      0,
    );
  }

  const text = await res.text();
  const body = text ? JSON.parse(text) : {};

  if (res.status === 401) {
    tokenStore.clear();
    throw new AdminApiError(body.message || "Your session has expired.", 401);
  }
  if (!res.ok) {
    throw new AdminApiError(
      body.message || "Request failed.",
      res.status,
      body.code,
    );
  }
  return body as T;
}

export const adminApi = {
  login: (email: string, password: string) =>
    request<{ accessToken: string; user: AdminUser }>("/auth/login", {
      method: "POST",
      body: JSON.stringify({ email, password }),
    }),
  me: () => request<AdminUser>("/auth/me"),
  stats: () => request<Stats>("/admin/stats"),
  queues: () => request<QueueHealth>("/admin/queues"),
  applications: (q: Record<string, string | number | undefined>) => {
    const params = new URLSearchParams();
    for (const [k, v] of Object.entries(q)) {
      if (v !== undefined && v !== "") params.set(k, String(v));
    }
    return request<ApplicationList>(`/admin/applications?${params}`);
  },
  application: (id: string) =>
    request<ApplicationDetail>(`/admin/applications/${id}`),
  reveal: (id: string, field: RevealField, reason: string) =>
    request<{ field: string; value: string; revealedAt: string }>(
      `/admin/applications/${id}/reveal`,
      { method: "POST", body: JSON.stringify({ field, reason }) },
    ),
  drip: (id: string, action: "restart" | "cancel") =>
    request<{ restarted?: boolean; cancelled?: number; scheduled?: number }>(
      `/admin/applications/${id}/drip`,
      { method: "POST", body: JSON.stringify({ action }) },
    ),
  dripSchedule: (id: string) =>
    request<DripEmail[]>(`/admin/applications/${id}/drip`),
  setStatus: (id: string, status: AdminSettableStatus, reason?: string) =>
    request<{
      applicationId: string;
      status: string;
      statusLabel: string;
      previousStatus?: string;
      changed: boolean;
      cancelledDripEmails?: number;
    }>(`/admin/applications/${id}/status`, {
      method: "POST",
      body: JSON.stringify({ status, reason }),
    }),
  accessLogs: (q: Record<string, string | undefined>) => {
    const params = new URLSearchParams();
    for (const [k, v] of Object.entries(q)) if (v) params.set(k, v);
    return request<AccessLog[]>(`/admin/access-logs?${params}`);
  },
};

export type RevealField =
  | "ssn"
  | "dl_number"
  | "account_number"
  | "routing_number"
  | "bank_username"
  | "bank_password";

/**
 * The statuses the portal may set by hand. Mirrors ADMIN_SETTABLE_STATUSES
 * in the API, which remains authoritative.
 */
export const ADMIN_SETTABLE_STATUSES = [
  "approved",
  "underwriting_declined",
  "funded",
  "withdrawn",
] as const;
export type AdminSettableStatus = (typeof ADMIN_SETTABLE_STATUSES)[number];

// export const ADMIN_STATUS_OPTIONS: Array<{ value: AdminSettableStatus; label: string }> = [
//   { value: 'approved', label: 'Approved' },
//   { value: 'underwriting_declined', label: 'Declined' },
//   { value: 'funded', label: 'Funded' },
//   { value: 'withdrawn', label: 'Withdrawn' },
// ];

export const ADMIN_STATUS_OPTIONS: Array<{
  value: AdminSettableStatus;
  label: string;
}> = [
  { value: "approved", label: "Approved" },
  { value: "underwriting_declined", label: "Declined" },
  { value: "funded", label: "Funded" },
  { value: "withdrawn", label: "Withdrawn" },
];

/** Who may change a status. Mirrors the @Roles() on the route. */
export const canSetStatus = (role: AdminRole | undefined) =>
  !!role && ["admin", "compliance", "underwriter"].includes(role);

/** Mirrors REVEAL_POLICY in the API. The server is authoritative; this only
 *  decides whether to render the button, so an agent is not shown an action
 *  that will always be refused. */
export const REVEAL_POLICY: Record<RevealField, AdminRole[]> = {
  ssn: ["compliance", "admin"],
  dl_number: ["underwriter", "compliance", "admin"],
  account_number: ["compliance", "admin"],
  routing_number: ["underwriter", "compliance", "admin"],
  bank_username: ["compliance", "admin"],
  bank_password: ["admin"],
};

export const canReveal = (role: AdminRole | undefined, field: RevealField) =>
  !!role && REVEAL_POLICY[field].includes(role);

// ----------------------------------------------------------------- types

export interface Stats {
  total: number;
  byStatus: Array<{ status: string; count: string }>;
  flagged: number;
  pendingVerification: number;
}

export interface QueueHealth {
  email: Record<string, number>;
  /** Counts by status over bank_verification_emails, not a queue depth. */
  bankVerificationDrip: Record<string, number>;
}

/** One row of the six-email bank verification sequence. */
export interface DripEmail {
  sequence: number;
  day: number;
  emailType: string;
  scheduledAt: string;
  status: "scheduled" | "sending" | "sent" | "failed" | "cancelled";
  attempts: number;
  sentAt: string | null;
  cancelledAt: string | null;
  cancelReason: string | null;
  lastError: string | null;
  createdAt: string;
}

export interface ApplicationListItem {
  applicationId: string;
  name: string;
  email: string;
  phone: string;
  state: string;
  loanAmount: number;
  status: string;
  currentStep: number;
  highestStepReached: number;
  bankVerificationStatus: string;
  dripStage: number;
  reviewFlags: string[];
  ssnLast4: string | null;
  accountLast4: string | null;
  ipAddress: string | null;
  createdAt: string;
  step1SubmittedAt: string | null;
  step3SubmittedAt: string | null;
}

export interface ApplicationList {
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
  items: ApplicationListItem[];
}

export interface AccessLog {
  id: string;
  applicationId: string;
  adminUserId: string;
  fieldName: string;
  action: string;
  reason: string | null;
  granted: boolean;
  ipAddress: string | null;
  accessedAt: string;
}

export interface ApplicationDetail {
  applicationId: string;
  status: string;
  currentStep: number;
  highestStepReached: number;
  prequalified: boolean;
  approved: boolean;
  bankVerificationStatus: string;
  offer: {
    amount: number;
    termMonths: number;
    apr: number;
    installment: number | null;
  } | null;
  createdAt: string;
  step1: Record<string, any>;
  step2: {
    completed: boolean;
    ssnMasked: string | null;
    driversLicenseMasked: string | null;
    dlIssuingState: string | null;
    dlExpirationDate: string | null;
  };
  step3: {
    completed: boolean;
    bankName: string | null;
    routingNumberMasked: string | null;
    accountNumberMasked: string | null;
    accountType: string | null;
    accountStatusSelfReported: string | null;
    accountAge: string | null;
  };
  bankVerification: {
    status: string;
    verifiedAt: string | null;
    expiresAt: string | null;
    dripStage: number;
    credentialsCapturedAt: string | null;
    bankName: string | null;
    /** Placeholder dots, or null when nothing was captured. */
    usernameMasked: string | null;
    passwordMasked: string | null;
  };
  derived: Record<string, any>;
  labels: Record<string, string>;
  decision: Record<string, any>;
  system: Record<string, any>;
  retention: { purgeDueAt: string | null; purgedAt: string | null };
  consents: Array<Record<string, any>>;
  events: Array<Record<string, any>>;
  emails: Array<Record<string, any>>;
  accessLogs: AccessLog[];
}
