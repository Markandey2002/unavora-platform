// SERVER-ONLY client for the staff CRM (/internal/v1/staff/**, /internal/v1/director/**). Import only from route
// handlers, server components and server actions. The staff session token lives in an HttpOnly cookie; the API
// re-checks session validity, MFA and every permission on each call.
const base = process.env.API_INTERNAL_URL ?? "http://localhost:8080";

export const STAFF_COOKIE_SECURE = "__Host-uai_staff";
export const STAFF_COOKIE_DEV = "uai_staff"; // plain-http localhost only
export const STAFF_FLOW_COOKIE = "uai_staff_flow";

export type ApiResult<T> = { ok: true; status: number; data: T } | { ok: false; status: number; code: string };

export type StaffMe = {
  id: string; name: string; email: string; preferredLanguage: string; roles: string[]; permissions: string[];
  mfaVerified: boolean; mfaRequired: boolean;
};
export type LeadRow = {
  id: string; reference: string; customerId: string; customerName: string; phone: string | null; stage: string;
  stageName: string; enquiryType: string; propertyTitle: string | null; priority: number; assignedUserId: string | null;
  assignedUserName: string | null; nextActionAt: string | null; nextActionNote: string | null; createdAt: string;
  version: number; outcome: string; updatedAt: string;
  /** Lead source name; campaign such as "showcase:villa" or "new-launches-interest"; visitor's preferred location. */
  source?: string | null; campaign?: string | null; preferredLocation?: string | null;
};
export type LeadPage = { items: LeadRow[]; nextCursor: string | null };
export type Activity = { type: string; summary: string; actorName: string | null; occurredAt: string };
export type CustomerRow = {
  id: string; reference: string; name: string; email: string | null; phone: string | null; whatsapp: string | null;
  whatsappVerified: boolean; registeredAt: string | null; lastLoginAt: string | null; signupSource: string | null;
  openLeads: number; createdAt: string;
};
export type CustomerPage = { items: CustomerRow[]; nextCursor: string | null };
export type CustomerDetail = {
  customer: CustomerRow; preferredLanguage: string; actions: { callUrl: string | null; whatsappUrl: string | null };
  consents: { purpose: string; granted: boolean; noticeVersion: string; source: string; recordedAt: string }[];
  leads: { id: string; reference: string; enquiryType: string; stage: string; assignedUserId: string | null; createdAt: string; nextActionAt: string | null }[];
  communications: { id: string; channel: string; direction: string; recordOrigin: string; deliveryStatus: string; summary: string | null; actorUserId: string | null; leadId: string | null; occurredAt: string }[];
  followUps: { id: string; title: string; status: string; dueAt: string; assignedTo: string; leadId: string | null }[];
};
export type FollowUpItem = {
  id: string; title: string; description: string | null; dueAt: string; overdue: boolean; customerId: string;
  customerName: string; customerReference: string; leadId: string | null; leadReference: string | null;
  priority: string; siteVisitId: string | null; siteVisitReference: string | null;
};
export type Overview = {
  totalLeads: number; newLast7Days: number; unassigned: number; publishedProperties: number;
  avgFirstResponseMinutes: number | null; leadsByStage: { stage: string; name: string; count: number }[];
  leadsByEmployeeAndStage: { userId: string; name: string; stage: string; count: number }[];
  visits: { upcoming: number; completedLast30Days: number; cancelledLast30Days: number; noShowLast30Days: number };
  conversion: { won: number; lost: number; invalid: number; winRate: number | null; reachedQualified: number;
    withCompletedVisit: number; visitConversion: number | null; reachedNegotiation: number };
  workload: { userId: string; name: string; openLeads: number; openFollowUps: number; overdueFollowUps: number;
    completedFollowUpsLast30Days: number; completedOnTimeLast30Days: number; onTimeRate: number | null; upcomingVisits: number }[];
};
export type Pipeline = {
  stages: { code: string; name: string; sortOrder: number; outcome: string; requiresReason: boolean; requiresCompletedDeal: boolean }[];
  transitions: { from: string; to: string }[];
  lostReasons: { code: string; name: string; needsNote: boolean }[];
};
export type LeadHistory = {
  stages: { fromStage: string | null; toStage: string; changedBy: string | null; reason: string | null; reasonCode: string | null; changedAt: string }[];
  assignments: { previousUser: string | null; assignedTo: string; assignedBy: string | null; method: string; reason: string | null; assignedAt: string }[];
};
export type Assignee = { id: string; name: string; roles: string[] };
export type VisitRow = {
  id: string; reference: string; status: string; scheduledAt: string | null; completedAt: string | null; leadId: string;
  leadReference: string; customerId: string; customerName: string; customerPhone: string | null; propertyId: string | null;
  propertyTitle: string | null; assignedUserId: string | null; assignedUserName: string | null; locationNote: string | null; version: number;
};
export type VisitDetail = {
  visit: VisitRow; feedback: string | null; interestAfter: string | null; employeeNotes: string | null; nextAction: string | null;
  history: { fromStatus: string | null; toStatus: string; fromScheduledAt: string | null; toScheduledAt: string | null; changedBy: string | null; reason: string | null; changedAt: string }[];
};
export type Dashboard = {
  myLeadsByStage: { stage: string; name: string; count: number }[];
  todaysVisits: DashboardVisit[]; upcomingVisits: DashboardVisit[];
  followUps: { pending: number; dueToday: number; overdue: number };
  recentlyUpdatedLeads: { id: string; reference: string; customerName: string; stage: string; updatedAt: string }[];
};
export type DashboardVisit = { id: string; reference: string; scheduledAt: string; status: string; leadId: string; leadReference: string; customerName: string; propertyTitle: string | null };

function headers(session?: string, extra: Record<string, string> = {}): Record<string, string> {
  const token = process.env.INTERNAL_SERVICE_TOKEN;
  if (!token) throw new Error("INTERNAL_SERVICE_TOKEN is not configured");
  const h: Record<string, string> = { "Content-Type": "application/json", "X-Internal-Service-Token": token, ...extra };
  if (session) h["X-Staff-Session"] = session;
  return h;
}

async function call<T>(method: string, path: string, opts: { session?: string; body?: unknown; headers?: Record<string, string> } = {}): Promise<ApiResult<T>> {
  let res: Response;
  try {
    res = await fetch(`${base}${path}`, {
      method, cache: "no-store", headers: headers(opts.session, opts.headers),
      body: opts.body === undefined ? undefined : JSON.stringify(opts.body),
    });
  } catch {
    return { ok: false, status: 503, code: "api_unreachable" };
  }
  if (res.ok) return { ok: true, status: res.status, data: res.status === 204 ? (undefined as T) : await res.json() };
  let code = "generic";
  try { code = (await res.json()).code ?? code; } catch { /* ignore */ }
  return { ok: false, status: res.status, code };
}

/** Multipart (file upload) call. The browser never talks to the API: the server action forwards the form. */
async function callForm<T>(path: string, session: string, form: FormData): Promise<ApiResult<T>> {
  const token = process.env.INTERNAL_SERVICE_TOKEN;
  if (!token) throw new Error("INTERNAL_SERVICE_TOKEN is not configured");
  let res: Response;
  try {
    res = await fetch(`${base}${path}`, { method: "POST", cache: "no-store", body: form,
      headers: { "X-Internal-Service-Token": token, "X-Staff-Session": session } });
  } catch {
    return { ok: false, status: 503, code: "api_unreachable" };
  }
  if (res.ok) return { ok: true, status: res.status, data: await res.json() };
  let code = "generic";
  try { code = (await res.json()).code ?? code; } catch { /* ignore */ }
  return { ok: false, status: res.status, code };
}

const qs = (p: Record<string, string | undefined>) => {
  const s = new URLSearchParams();
  for (const [k, v] of Object.entries(p)) if (v) s.set(k, v);
  const out = s.toString();
  return out ? `?${out}` : "";
};

export const staffAuth = {
  start: (language: string, clientIp?: string) =>
    call<{ authorizationUrl: string; state: string }>("POST", "/internal/v1/staff-auth/start", {
      body: { language }, headers: clientIp ? { "X-Forwarded-For": clientIp } : {},
    }),
  complete: (code: string, state: string, clientIp?: string) =>
    call<{ sessionToken: string; expiresAt: string; idleTimeoutSeconds: number; language: string }>(
      "POST", "/internal/v1/staff-auth/complete", { body: { code, state }, headers: clientIp ? { "X-Forwarded-For": clientIp } : {} }),
  logout: (session: string, language: string) =>
    call<{ endSessionUrl: string | null }>("POST", `/internal/v1/staff-auth/logout?lang=${language === "hi" ? "hi" : "en"}`, { headers: { "X-Staff-Session": session } }),
};

export const staffApi = {
  // ---- Director CMS (blocks, image library, associations) ----
  cmsBlocks: (s: string) => call<CmsBlockRow[]>("GET", "/internal/v1/staff/cms/blocks", { session: s }),
  cmsBlock: (s: string, key: string) => call<CmsBlock>("GET", `/internal/v1/staff/cms/blocks/${encodeURIComponent(key)}`, { session: s }),
  saveCmsBlock: (s: string, key: string, body: unknown) => call<CmsBlock>("PUT", `/internal/v1/staff/cms/blocks/${encodeURIComponent(key)}`, { session: s, body }),
  cmsBlockAction: (s: string, key: string, action: "submit" | "publish" | "unpublish") =>
    call<CmsBlock>("POST", `/internal/v1/staff/cms/blocks/${encodeURIComponent(key)}/${action}`, { session: s }),
  cmsPreview: (s: string, lang: string) => call<import("./api").SiteBlocks>("GET", `/internal/v1/staff/cms/preview?lang=${lang === "hi" ? "hi" : "en"}`, { session: s }),
  cmsLibrary: (s: string) => call<MediaItem[]>("GET", "/internal/v1/staff/cms/media", { session: s }),
  cmsUpload: (s: string, form: FormData) => callForm<{ id: string }>("/internal/v1/staff/cms/media", s, form),
  cmsUpdateImage: (s: string, id: string, body: MediaInput) => call<MediaItem[]>("PUT", `/internal/v1/staff/cms/media/${id}`, { session: s, body }),
  cmsImageAction: (s: string, id: string, action: "approve" | "unapprove") => call<MediaItem[]>("POST", `/internal/v1/staff/cms/media/${id}/${action}`, { session: s }),
  cmsDeleteImage: (s: string, id: string) => call<void>("DELETE", `/internal/v1/staff/cms/media/${id}`, { session: s }),
  associations: (s: string) => call<AssociationRow[]>("GET", "/internal/v1/staff/cms/associations", { session: s }),
  addAssociation: (s: string, body: AssociationInput) => call<AssociationRow[]>("POST", "/internal/v1/staff/cms/associations", { session: s, body }),
  updateAssociation: (s: string, id: string, body: AssociationInput) => call<AssociationRow[]>("PUT", `/internal/v1/staff/cms/associations/${id}`, { session: s, body }),
  associationAction: (s: string, id: string, action: "submit" | "publish" | "unpublish") =>
    call<AssociationRow[]>("POST", `/internal/v1/staff/cms/associations/${id}/${action}`, { session: s }),
  // ---- illustrative showcase items (V18) ----
  showcaseItems: (s: string) => call<ShowcaseRow[]>("GET", "/internal/v1/staff/cms/showcase", { session: s }),
  showcaseItem: (s: string, id: string) => call<ShowcaseRow>("GET", `/internal/v1/staff/cms/showcase/${id}`, { session: s }),
  addShowcase: (s: string, body: ShowcaseInput) => call<ShowcaseRow>("POST", "/internal/v1/staff/cms/showcase", { session: s, body }),
  updateShowcase: (s: string, id: string, body: ShowcaseInput) => call<ShowcaseRow>("PUT", `/internal/v1/staff/cms/showcase/${id}`, { session: s, body }),
  showcaseAction: (s: string, id: string, action: "submit" | "publish" | "unpublish" | "archive") =>
    call<ShowcaseRow>("POST", `/internal/v1/staff/cms/showcase/${id}/${action}`, { session: s }),
  // ---- listings / projects / photos ----
  listings: (s: string, p: { status?: string; q?: string }) => call<ListingRow[]>("GET", `/internal/v1/staff/properties${qs(p)}`, { session: s }),
  listing: (s: string, id: string) => call<ListingDetail>("GET", `/internal/v1/staff/properties/${id}`, { session: s }),
  listingOptions: (s: string) => call<ListingOptions>("GET", "/internal/v1/staff/properties/options", { session: s }),
  createListing: (s: string, body: ListingInput) => call<{ id: string }>("POST", "/internal/v1/staff/properties", { session: s, body }),
  updateListing: (s: string, id: string, body: ListingInput) => call<ListingDetail>("PUT", `/internal/v1/staff/properties/${id}`, { session: s, body }),
  listingAction: (s: string, id: string, action: "submit" | "publish" | "unpublish" | "sold") => call<ListingDetail>("POST", `/internal/v1/staff/properties/${id}/${action}`, { session: s }),
  reviewListing: (s: string, id: string, decision: string, note: string) => call<ListingDetail>("POST", `/internal/v1/staff/properties/${id}/review`, { session: s, body: { decision, note } }),
  uploadMedia: (s: string, kind: MediaOwner, id: string, form: FormData) => callForm<{ id: string }>(`/internal/v1/staff/${kind}/${id}/media`, s, form),
  updateMedia: (s: string, kind: MediaOwner, id: string, mid: string, body: MediaInput) => call<unknown>("PUT", `/internal/v1/staff/${kind}/${id}/media/${mid}`, { session: s, body }),
  mediaAction: (s: string, kind: MediaOwner, id: string, mid: string, action: "approve" | "unapprove" | "primary") =>
    call<unknown>("POST", `/internal/v1/staff/${kind}/${id}/media/${mid}/${action}`, { session: s }),
  deleteMedia: (s: string, kind: MediaOwner, id: string, mid: string) => call<void>("DELETE", `/internal/v1/staff/${kind}/${id}/media/${mid}`, { session: s }),
  projects: (s: string) => call<StaffProjectRow[]>("GET", "/internal/v1/staff/projects", { session: s }),
  project: (s: string, id: string) => call<StaffProjectDetail>("GET", `/internal/v1/staff/projects/${id}`, { session: s }),
  createProject: (s: string, body: ProjectInput) => call<{ id: string }>("POST", "/internal/v1/staff/projects", { session: s, body }),
  updateProject: (s: string, id: string, body: ProjectInput) => call<StaffProjectDetail>("PUT", `/internal/v1/staff/projects/${id}`, { session: s, body }),
  projectAction: (s: string, id: string, action: "publish" | "unpublish" | "archive") => call<StaffProjectDetail>("POST", `/internal/v1/staff/projects/${id}/${action}`, { session: s }),
  localityPosition: (s: string, id: string, body: { latitude: number | null; longitude: number | null }) =>
    call<void>("PUT", `/internal/v1/staff/localities/${id}/position`, { session: s, body }),
  createListingFromSubmission: (s: string, id: string, body: { localityId: string; fileIds: string[] }) =>
    call<{ propertyId: string; photos: number }>("POST", `/internal/v1/staff/submissions/${id}/create-listing`, { session: s, body }),
  // ---- owner submissions ----
  submissions: (session: string, status?: string) => call<SubmissionRow[]>("GET", `/internal/v1/staff/submissions${qs({ status })}`, { session }),
  submission: (session: string, id: string) => call<SubmissionDetail>("GET", `/internal/v1/staff/submissions/${id}`, { session }),
  reviewSubmission: (session: string, id: string, note: string) => call<SubmissionDetail>("POST", `/internal/v1/staff/submissions/${id}/review`, { session, body: { note } }),
  decideSubmission: (session: string, id: string, decision: string, note: string) =>
    call<SubmissionDetail>("POST", `/internal/v1/staff/submissions/${id}/decision`, { session, body: { decision, note } }),
  // ---- content (director) ----
  articles: (session: string) => call<ArticleRow[]>("GET", "/internal/v1/staff/content/articles", { session }),
  article: (session: string, id: string) => call<ArticleFull>("GET", `/internal/v1/staff/content/articles/${id}`, { session }),
  createArticle: (session: string, body: ArticleInput) => call<{ id: string }>("POST", "/internal/v1/staff/content/articles", { session, body }),
  updateArticle: (session: string, id: string, body: ArticleInput) => call<ArticleFull>("PUT", `/internal/v1/staff/content/articles/${id}`, { session, body }),
  articleStatus: (session: string, id: string, status: string) => call<ArticleFull>("POST", `/internal/v1/staff/content/articles/${id}/status`, { session, body: { status } }),
  testimonials: (session: string) => call<TestimonialRow[]>("GET", "/internal/v1/staff/content/testimonials", { session }),
  addTestimonial: (session: string, body: { displayName: string; rating: number | null; body: string; consentConfirmed: boolean; consentNote: string; publish: boolean }) =>
    call<{ id: string }>("POST", "/internal/v1/staff/content/testimonials", { session, body }),
  testimonialStatus: (session: string, id: string, status: string) => call<void>("POST", `/internal/v1/staff/content/testimonials/${id}/status`, { session, body: { status } }),
  featured: (session: string) => call<{ id: string; title: string; city: string; featured: boolean }[]>("GET", "/internal/v1/staff/content/featured", { session }),
  setFeatured: (session: string, id: string, on: boolean) => call<void>(on ? "PUT" : "DELETE", `/internal/v1/staff/content/featured/${id}`, { session }),
  locations: (session: string) => call<LocationContentRow[]>("GET", "/internal/v1/staff/content/locations", { session }),
  saveLocation: (session: string, slug: string, body: { en: { title: string; intro: string }; hi: { title: string; intro: string } | null; published: boolean }) =>
    call<void>("PUT", `/internal/v1/staff/content/locations/${slug}`, { session, body }),
  company: (session: string) => call<CompanyFacts>("GET", "/internal/v1/staff/content/company", { session }),
  saveSetting: (session: string, key: string, value: string, verified: boolean) =>
    call<void>("PUT", `/internal/v1/staff/content/company/settings/${encodeURIComponent(key)}`, { session, body: { value, verified } }),
  saveOffice: (session: string, id: string, body: { address: string; pinCode: string; phone: string; verified: boolean; hours: string; directionsUrl: string }) =>
    call<void>("PUT", `/internal/v1/staff/content/company/offices/${id}`, { session, body }),
  me: (s: string) => call<StaffMe>("GET", "/internal/v1/staff/me", { session: s }),
  leads: (s: string, p: { stage?: string; assignee?: string; cursor?: string }) =>
    call<LeadPage>("GET", `/internal/v1/staff/leads${qs({ ...p, limit: "20" })}`, { session: s }),
  lead: (s: string, id: string) => call<LeadRow>("GET", `/internal/v1/staff/leads/${encodeURIComponent(id)}`, { session: s }),
  leadActivities: (s: string, id: string) => call<Activity[]>("GET", `/internal/v1/staff/leads/${encodeURIComponent(id)}/activities`, { session: s }),
  customers: (s: string, p: { registered?: string; cursor?: string }) =>
    call<CustomerPage>("GET", `/internal/v1/staff/customers${qs({ ...p, limit: "20" })}`, { session: s }),
  customer: (s: string, id: string) => call<CustomerDetail>("GET", `/internal/v1/staff/customers/${encodeURIComponent(id)}`, { session: s }),
  logCommunication: (s: string, customerId: string, body: { channel: string; direction: string; summary: string; leadId?: string }) =>
    call<{ id: string }>("POST", `/internal/v1/staff/customers/${encodeURIComponent(customerId)}/communications`, { session: s, body }),
  addFollowUp: (s: string, customerId: string, body: { title: string; description?: string; dueAt: string; leadId?: string }) =>
    call<{ id: string }>("POST", `/internal/v1/staff/customers/${encodeURIComponent(customerId)}/follow-ups`, { session: s, body }),
  followUps: (s: string) => call<FollowUpItem[]>("GET", "/internal/v1/staff/follow-ups", { session: s }),
  completeFollowUp: (s: string, id: string) =>
    call<FollowUpItem>("POST", `/internal/v1/staff/follow-ups/${encodeURIComponent(id)}/complete`, { session: s }),
  overview: (s: string) => call<Overview>("GET", "/internal/v1/director/overview", { session: s }),
  dashboard: (s: string) => call<Dashboard>("GET", "/internal/v1/staff/dashboard", { session: s }),
  pipeline: (s: string) => call<Pipeline>("GET", "/internal/v1/staff/pipeline", { session: s }),
  assignees: (s: string) => call<Assignee[]>("GET", "/internal/v1/staff/assignees", { session: s }),
  leadHistory: (s: string, id: string) => call<LeadHistory>("GET", `/internal/v1/staff/leads/${encodeURIComponent(id)}/history`, { session: s }),
  changeStage: (s: string, id: string, body: { toStage: string; expectedVersion?: number; reasonCode?: string; note?: string }) =>
    call<{ leadId: string; fromStage: string; toStage: string; version: number }>("POST", `/internal/v1/staff/leads/${encodeURIComponent(id)}/stage`, { session: s, body }),
  assign: (s: string, id: string, body: { assigneeId: string; expectedVersion?: number; reason?: string }) =>
    call<unknown>("POST", `/internal/v1/staff/leads/${encodeURIComponent(id)}/assign`, { session: s, body }),
  visits: (s: string, p: { scope: string; leadId?: string }) => call<VisitRow[]>("GET", `/internal/v1/staff/site-visits${qs(p)}`, { session: s }),
  visit: (s: string, id: string) => call<VisitDetail>("GET", `/internal/v1/staff/site-visits/${encodeURIComponent(id)}`, { session: s }),
  scheduleVisit: (s: string, body: { leadId: string; scheduledAt: string; propertyId?: string; assignedUserId?: string; locationNote?: string }) =>
    call<{ id: string; reference: string }>("POST", "/internal/v1/staff/site-visits", { session: s, body }),
  visitAction: (s: string, id: string, action: "reschedule" | "cancel" | "complete" | "no-show", body: Record<string, unknown>) =>
    call<{ id: string; status: string }>("POST", `/internal/v1/staff/site-visits/${encodeURIComponent(id)}/${action}`, { session: s, body }),
  createFollowUp: (s: string, body: { leadId?: string; siteVisitId?: string; title: string; description?: string; dueAt: string; priority?: string; assignedTo?: string }) =>
    call<{ id: string }>("POST", "/internal/v1/staff/follow-ups", { session: s, body }),
};

export function staffSessionFrom(store: { get(name: string): { value: string } | undefined }): string | undefined {
  return store.get(STAFF_COOKIE_SECURE)?.value ?? store.get(STAFF_COOKIE_DEV)?.value;
}

export function can(me: StaffMe, permission: string): boolean {
  return me.permissions.includes(permission);
}

export type SubmissionRow = {
  id: string; status: string; leadReference: string; leadId: string; ownerName: string; city: string; locality: string | null;
  propertyType: string; purpose: string; expectedPrice: number | null; area: number | null; areaUnit: string | null;
  createdAt: string; assignedUserName: string | null; files: number;
};
export type SubmissionDetail = {
  submission: SubmissionRow; message: string | null; phone: string | null; email: string | null; reviewNote: string | null;
  reviewedBy: string | null; reviewedAt: string | null; decisionNote: string | null; decidedBy: string | null; decidedAt: string | null;
  photos: { id: string; name: string; size: number; scanStatus: string }[]; canReview: boolean; canDecide: boolean;
  propertyId: string | null; convertedAt: string | null;
};
export type ArticleTranslation = { title: string; slug: string; excerpt: string | null; body: string };
export type ArticleInput = { kind: string; category: string; authorName: string; youtubeId: string | null; en: ArticleTranslation; hi: ArticleTranslation | null;
  featured: boolean; coverMediaId: string | null; videoDescription: string | null };
export type ArticleRow = { id: string; kind: string; category: string; status: string; titleEn: string; slugEn: string; hasHindi: boolean; authorName: string; publishedAt: string | null; updatedAt: string };
export type ArticleFull = { id: string; kind: string; category: string; status: string; authorName: string; youtubeId: string | null; publishedAt: string | null; en: ArticleTranslation; hi: ArticleTranslation | null;
  featured: boolean; coverMediaId: string | null; videoDescription: string | null };
export type TestimonialRow = { id: string; displayName: string | null; rating: number | null; body: string | null; status: string; consentAt: string | null; consentNote: string | null; createdAt: string };
export type LocationContentRow = { city: string; slug: string; listings: number; hasContent: boolean; published: boolean; en: { title: string; intro: string } | null; hi: { title: string; intro: string } | null };
export type CompanyFacts = {
  settings: { key: string; value: string | null; verified: boolean; publicKey: boolean }[];
  offices: { id: string; kind: string; city: string; locality: string | null; address: string | null; pinCode: string | null; phone: string | null; verified: boolean; hours: string | null; directionsUrl: string | null }[];
};

export type MediaOwner = "properties" | "projects";
export type MediaItem = {
  id: string; kind: "actual_photo" | "render" | "floor_plan" | "representative" | "brand" | "editorial" | "logo"; captionEn: string | null; captionHi: string | null; altEn: string | null;
  altHi: string | null; credit: string | null; licence: string | null; sortOrder: number; primary: boolean; public: boolean;
  scanStatus: "not_scanned" | "clean" | "infected" | "scan_failed"; scanner: string | null; approvedAt: string | null; sizeBytes: number | null;
};
export type MediaInput = { kind: string; captionEn: string | null; captionHi: string | null; altEn: string | null; altHi: string | null; credit: string | null; licence: string | null; sortOrder: number | null };
export type ListingRow = {
  id: string; number: number; status: string; availability: string; sample: boolean; title: string | null; slug: string | null; city: string;
  locality: string; type: string; price: number | null; priceOnRequest: boolean; owner: string | null; photos: number; approvedPhotos: number; updatedAt: string;
};
export type ListingTranslation = { title: string; slug: string; description: string | null };
export type ListingInput = {
  typeCode: string; localityId: string; purpose: string; priceAmount: number | null; priceOnRequest: boolean; priceNegotiable: boolean;
  areaUnit: string; builtUpArea: number | null; carpetArea: number | null; plotArea: number | null; bedrooms: number | null; bathrooms: number | null;
  parkingSpaces: number | null; furnishing: string | null; possessionStatus: string | null; possessionDate: string | null; floorNumber: number | null;
  totalFloors: number | null; addressLine: string | null; latitude: number | null; longitude: number | null; hideExactLocation: boolean;
  projectId: string | null; ownerUserId: string | null; amenityCodes: string[]; en: ListingTranslation; hi: ListingTranslation | null;
};
export type ListingDetail = Omit<ListingInput, "en" | "hi"> & {
  id: string; number: number; status: string; availability: string; verificationStatus: string; rejectionReason: string | null; typeCode: string;
  city: string; localityName: string; ownerName: string | null; submissionId: string | null; submissionRef: string | null; isSample: boolean;
  publishedAt: string | null; en: ListingTranslation | null; hi: ListingTranslation | null; media: MediaItem[];
  history: { from: string | null; to: string; note: string | null; at: string; by: string | null }[];
  canEdit: boolean; canSubmit: boolean; canReview: boolean; canPublish: boolean; canUnpublish: boolean; canApproveMedia: boolean;
};
export type ListingOptions = {
  types: { code: string; name: string; category: string }[]; localities: { id: string; city: string; name: string; latitude: number | null; longitude: number | null }[];
  amenities: { code: string; name: string }[]; projects: { id: string; name: string }[]; staff: { id: string; name: string }[];
};
export type StaffProjectRow = { id: string; number: number; status: string; constructionStatus: string | null; sample: boolean; name: string | null; slug: string | null; city: string | null; locality: string | null; approvedPhotos: number; updatedAt: string };
export type ProjectUnitInput = { label: string; bedrooms: number | null; areaValue: number | null; areaUnit: string | null; basePrice: number | null };
export type ProjectText = { name: string; slug: string; description: string | null };
export type ProjectInput = {
  localityId: string | null; constructionStatus: string | null; possessionDate: string | null; possessionPublic: boolean; developerName: string | null;
  developerVerified: boolean; category: string | null; primaryTypeCode: string | null; reraNumber: string | null; reraVerified: boolean; pricePublic: boolean;
  units: ProjectUnitInput[]; en: ProjectText; hi: ProjectText | null;
};
export type StaffProjectDetail = Omit<ProjectInput, "en" | "hi" | "units"> & {
  id: string; number: number; status: string; sample: boolean; publishedAt: string | null; units: ProjectUnitInput[]; media: MediaItem[]; canEdit: boolean;
  en: ProjectText | null; hi: ProjectText | null;
};

export type CmsBlockRow = { key: string; status: string; live: boolean; updatedAt: string | null; publishedAt: string | null };
export type CmsBlock = {
  key: string; status: string; draft: Record<string, unknown> | null; published: Record<string, unknown> | null; updatedAt: string | null;
  publishedAt: string | null; history: { action: string; at: string; by: string | null }[]; canPublish: boolean;
};
export type AssociationInput = {
  name: string; relationship: string; websiteUrl: string | null; logoMediaId: string | null; relationshipConfirmed: boolean;
  relationshipNote: string | null; logoPermission: boolean; logoPermissionNote: string | null; sortOrder: number | null;
};
export type AssociationRow = {
  id: string; name: string; relationship: string; websiteUrl: string | null; logoMediaId: string | null; relationshipConfirmedAt: string | null;
  relationshipNote: string | null; logoPermissionAt: string | null; logoPermissionNote: string | null; status: string; sortOrder: number;
};

export type ShowcaseCategory = "residential" | "villa" | "commercial" | "office" | "land" | "project_style";
export type ShowcaseCta = "enquire" | "register_interest" | "browse" | "view_record";
export type ShowcaseRow = {
  id: string; category: ShowcaseCategory; titleEn: string; titleHi: string | null; descriptionEn: string; descriptionHi: string | null;
  imageMediaId: string | null; cta: ShowcaseCta; linkedPropertyId: string | null; linkedProjectId: string | null; sortOrder: number;
  status: "draft" | "in_review" | "published" | "unpublished" | "archived"; publishedAt: string | null; updatedAt: string;
  imageUrl: string | null; imageKind: string | null; imageApproved: boolean;
  /** Local demo item (is_sample): never public outside local/test. */
  sample?: boolean;
  history?: { action: string; at: string; by: string }[]; canPublish?: boolean;
};
export type ShowcaseInput = {
  category: string; titleEn: string; titleHi: string | null; descriptionEn: string; descriptionHi: string | null; imageMediaId: string | null;
  cta: string; linkedPropertyId: string | null; linkedProjectId: string | null; sortOrder: number | null;
};
