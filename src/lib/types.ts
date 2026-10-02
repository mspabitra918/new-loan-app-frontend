export interface Option<T = string> {
  value: T;
  label: string;
}

/** Served by GET /api/lookup/options so the UI and server share one source. */
export interface LookupOptions {
  loanAmount: { min: number; max: number; step: number; default: number };
  loanPurposes: Option[];
  loanTerms: Option<number>[];
  suffixes: Option[];
  states: Option[];
  residenceTenure: Option[];
  housingStatuses: Option[];
  housingStatusesRequiringPayment: string[];
  employmentStatuses: Option[];
  employerFieldStatuses: string[];
  incomeTypes: Option[];
  derivedIncomeType: Record<string, string | null>;
  jobTenure: Option[];
  payFrequencies: Option[];
  accountTypes: Option[];
  accountStatuses: Option[];
  accountAges: Option[];
  regBNotice: string;
}

export interface ConsentTemplate {
  type: string;
  versionId: string;
  step: 1 | 2 | 3;
  label: string;
  text: string;
  namedParties: string[] | null;
  links: Array<{ label: string; href: string }> | null;
}

export interface TrackingPayload {
  deviceFingerprint?: string;
  pageUrl?: string;
  referrerUrl?: string;
  utmSource?: string;
  utmMedium?: string;
  utmCampaign?: string;
  utmContent?: string;
  utmTerm?: string;
  landingPageFirstTouch?: string;
  jornayaLeadid?: string;
  trustedformCertUrl?: string;
  sessionId?: string;
  timezone?: string;
  timeOnForm?: number;
}

export interface ConsentPayload {
  type: string;
  accepted: boolean;
  versionId: string;
  timezone?: string;
}

/** Field-keyed errors rendered inline beside each input. */
export type FieldErrors = Record<string, string>;

export interface ApiError {
  statusCode: number;
  message: string;
  errors?: FieldErrors;
  code?: string;
  suggestions?: { email?: string };
  lockoutUntil?: string;
  applicationId?: string;
  /** Which screen a field error belongs to, so the form can reopen it. */
  step?: number;
  email?: string;
}

export interface Offer {
  amount: number;
  termMonths: number;
  apr: number;
  installment: number;
}

/**
 * The whole application, as one request body.
 *
 * The form is three screens, but nothing is posted until the applicant
 * submits on the last one, so every field below travels together to
 * POST /applications/submit. Each screen contributes a `Partial` of this.
 */
export interface SubmitRequest {
  // ---- Screen 1: loan request, contact, residence, income
  loanAmount: number;
  loanPurpose: string;
  loanPurposeOther?: string;
  loanTermMonths: number;
  firstName: string;
  middleInitial?: string;
  lastName: string;
  suffix?: string;
  email: string;
  confirmEmail: string;
  phone: string;
  dateOfBirth: string;
  streetAddress: string;
  aptUnit?: string;
  city: string;
  state: string;
  zipCode: string;
  timeAtCurrentAddress: string;
  housingStatus: string;
  monthlyHousingPayment?: number;
  employmentStatus: string;
  primaryIncomeType?: string;
  employerName?: string;
  jobTitle?: string;
  employerPhone?: string;
  timeAtCurrentJob?: string;
  netMonthlyIncome?: number;
  payFrequency: string;
  nextPayDate?: string;
  directDeposit: boolean;
  additionalMonthlyIncome?: number;
  additionalIncomeSource?: string;

  // ---- Screen 2: identity
  ssn: string;
  confirmSsn: string;
  driversLicenseNumber: string;
  dlIssuingState: string;
  dlExpirationDate: string;

  // ---- Screen 3: bank & funding
  routingNumber: string;
  bankName?: string;
  accountNumber: string;
  confirmAccountNumber: string;
  accountType: string;
  accountStatusSelfReported: string;
  accountAge: string;

  /** Every checkbox from all three screens, in one array. */
  consents: ConsentPayload[];
  tracking?: TrackingPayload;
}

/** What one screen contributes to the request body. */
export type SubmitRequestPart = Partial<SubmitRequest>;

/**
 * The one response the form gets back.
 *
 * No decision is carried here: a completed application is stored and lands at
 * bank verification pending, and what is left for the applicant is confirming
 * their bank account from the email we have just sent.
 */
export interface SubmitResponse {
  applicationId: string;
  status: string;
  /** Human-facing status, e.g. "Bank Verification Pending". */
  statusLabel: string;
  loanAmount?: number;
  loanTermMonths?: number;
  bankName?: string | null;
  accountNumberMasked?: string;
  bankVerificationRequired?: boolean;
  /** Single-use link, so the applicant can verify without leaving the flow. */
  bankVerificationUrl?: string;
  /** How many drip emails were scheduled - six, two a day for three days. */
  dripScheduled?: number;
  email?: string;
}
