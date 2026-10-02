import type { ConsentTemplate } from "./types";

/**
 * A bundled copy of GET /api/consents/templates, so every agreement checkbox
 * renders without a backend. When the backend is reachable its response
 * replaces this at load.
 *
 * Copied verbatim from loan-backend/src/modules/consents/consent-templates.ts.
 * The server rejects a consent whose versionId is not the current one, so
 * when a template is bumped there, bump it here too.
 */

const BRAND = "New Loans";

/** Lead buyers / marketing partners named in the TCPA disclosure. */
const TCPA_NAMED_PARTIES = [
  "New Loans, LLC",
  "NewLending Partners Network",
  "NewFinancial Servicing, LLC",
];

const TEMPLATES: Record<string, Omit<ConsentTemplate, "namedParties" | "links"> & {
  namedParties?: string[];
  links?: ConsentTemplate["links"];
}> = {
  tcpa: {
    type: "tcpa",
    versionId: "tcpa-v1.0.0",
    step: 1,
    label: "I agree to be contacted by phone, text and email (TCPA consent).",
    namedParties: TCPA_NAMED_PARTIES,
    text:
      `By checking this box, I give my express written consent for ${BRAND}, LLC, ` +
      `NewLending Partners Network, and NewFinancial Servicing, LLC (together, the ` +
      `"Named Parties") to contact me at the telephone number I provided, including my ` +
      `wireless number, using an automatic telephone dialing system, an artificial or ` +
      `prerecorded voice, and SMS text messages, for marketing, servicing and application ` +
      `purposes. I understand that my consent is NOT a condition of purchasing any ` +
      `property, goods or services, and that I may instead call (800) 555-0143 to apply. ` +
      `Message frequency varies. Message and data rates may apply. I may revoke this ` +
      `consent at any time by replying STOP to any text, by calling (800) 555-0143, or ` +
      `by emailing optout@newloans.com.`,
    links: [{ label: "Marketing partners", href: "/legal/partners" }],
  },

  esign: {
    type: "esign",
    versionId: "esign-v1.0.0",
    step: 1,
    label: "I consent to receive disclosures electronically (E-SIGN consent).",
    text:
      `I consent under the federal E-SIGN Act to receive all disclosures, notices, ` +
      `agreements and records relating to my application and any resulting loan in ` +
      `electronic form rather than on paper. To access and retain these records I need: ` +
      `a device with internet access; a current version of Chrome, Safari, Firefox or ` +
      `Edge; an active email account; and the ability to view and save PDF files. ` +
      `I may withdraw this consent at any time, at no charge, by emailing ` +
      `esign@newloans.com or calling (800) 555-0143; withdrawing consent may end my ` +
      `ability to apply or transact online. I may request a paper copy of any record at ` +
      `no charge using the same contact details.`,
  },

  credit_pull_soft: {
    type: "credit_pull_soft",
    versionId: "credit-soft-v1.0.0",
    step: 1,
    label:
      "I authorise a SOFT credit inquiry to check my eligibility. This will NOT affect my credit score.",
    text:
      `I authorise ${BRAND} and its lending partners to obtain a consumer report about ` +
      `me from one or more consumer reporting agencies for the purpose of determining ` +
      `whether I pre-qualify for a loan. I understand this is a SOFT inquiry, that it is ` +
      `visible only to me on my credit file, and that IT WILL NOT AFFECT MY CREDIT SCORE. ` +
      `I confirm that ${BRAND} has a permissible purpose under the Fair Credit Reporting ` +
      `Act, 15 U.S.C. section 1681b, to obtain this report in connection with my request. ` +
      `A separate authorisation will be requested before any hard inquiry is made.`,
  },

  credit_pull_hard: {
    type: "credit_pull_hard",
    versionId: "credit-hard-v1.0.0",
    step: 2,
    label:
      "I authorise a HARD credit inquiry to underwrite my loan. This MAY affect my credit score.",
    text:
      `I authorise ${BRAND} and its lending partners to obtain a consumer report and any ` +
      `other information about me, including from consumer reporting agencies and ` +
      `verification services, for the purpose of underwriting, verifying my identity, and ` +
      `making a final credit decision on my application. I understand this is a HARD ` +
      `inquiry, that it will appear on my credit file and MAY LOWER MY CREDIT SCORE, and ` +
      `that it is distinct from the soft inquiry I previously authorised. I confirm that ` +
      `${BRAND} has a permissible purpose under the Fair Credit Reporting Act, ` +
      `15 U.S.C. section 1681b, to obtain this report.`,
  },

  privacy_glba: {
    type: "privacy_glba",
    versionId: "privacy-glba-v1.0.0",
    step: 1,
    label: "I have read the Privacy Policy and GLBA Privacy Notice.",
    text:
      `I acknowledge that I have been given the opportunity to read the ${BRAND} Privacy ` +
      `Policy and the Gramm-Leach-Bliley Act Privacy Notice, which describe the ` +
      `non-public personal information ${BRAND} collects, how it is used, the categories ` +
      `of affiliates and non-affiliated third parties with whom it may be shared, and how ` +
      `it is protected. I understand that I have the right to opt out of certain sharing ` +
      `of my information with non-affiliated third parties and with affiliates for their ` +
      `own marketing, and that I may exercise that right at any time by calling ` +
      `(800) 555-0143, by emailing privacy@newloans.com, or through the opt-out form ` +
      `linked in the Privacy Notice.`,
    links: [
      { label: "Privacy Policy", href: "/legal/privacy" },
      { label: "GLBA Privacy Notice", href: "/legal/glba" },
      { label: "Information sharing opt-out", href: "/legal/opt-out" },
      { label: "Direct Lender Disclosure", href: "/legal/direct-lender" },
    ],
  },

  // Renamed from "Terms of Use" to "Terms of Service". The wording changed, so
  // the version is bumped rather than edited in place - consents already given
  // must stay provable against the exact text they were given against.
  terms_of_use: {
    type: "terms_of_use",
    versionId: "terms-v1.1.0",
    step: 1,
    label: "I agree to the Terms of Service.",
    text:
      `I have read and agree to the ${BRAND} Terms of Service, including the sections ` +
      `governing acceptable use of this website, the accuracy of the information I ` +
      `submit, electronic signatures, limitation of liability, and dispute resolution. ` +
      `I certify that the information I have provided is true, accurate and complete to ` +
      `the best of my knowledge, and that I am submitting this application on my own ` +
      `behalf.`,
    links: [
      { label: "Terms of Service", href: "/legal/terms" },
      { label: "Fair Lending Statement", href: "/legal/fair-lending" },
    ],
  },

  ach_authorization: {
    type: "ach_authorization",
    versionId: "ach-v1.0.0",
    step: 3,
    label: "I authorise ACH debits and credits to the bank account provided.",
    text:
      `I authorise ${BRAND} and NewFinancial Servicing, LLC to initiate electronic ` +
      `credit entries to the checking or savings account I identified in order to ` +
      `disburse my loan proceeds, and to initiate electronic debit entries to that same ` +
      `account to collect each scheduled installment in the amount shown on my loan ` +
      `agreement, on each scheduled due date, for the full term of the loan, together ` +
      `with any adjusting entries needed to correct an error. I understand the amount ` +
      `and frequency of these debits are set out in my loan agreement and Truth in ` +
      `Lending disclosure, and that a final debit may differ in amount to close out the ` +
      `balance. I may revoke this authorisation at any time by calling (800) 555-0143 or ` +
      `by emailing ach@newloans.com at least three (3) business days before a scheduled ` +
      `debit; revoking it does not cancel my obligation to repay the loan. I certify that ` +
      `I am an authorised signer on this account.`,
  },
};

export const DEFAULT_CONSENT_TEMPLATES: ConsentTemplate[] = Object.values(
  TEMPLATES,
).map((t) => ({
  ...t,
  namedParties: t.namedParties ?? null,
  links: t.links ?? null,
}));
