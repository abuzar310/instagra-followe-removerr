import type { Follower, Rule, ImportBatch, ReviewFilters, SortField, SortOrder, DashboardStats, InstagramCookies, UnfollowEntry, UnfollowStatus, WhitelistEntry } from "./types";
import { v4 as uuid } from "uuid";

const STORAGE_KEY = "ifr_followers";
const RULES_KEY = "ifr_rules";
const BATCHES_KEY = "ifr_batches";
const IG_COOKIES_KEY = "ifr_ig_cookies";
const WHITELIST_KEY = "ifr_whitelist";
const UNFOLLOW_QUEUE_KEY = "ifr_unfollow_queue";

// ── Default rules ──
const DEFAULT_RULES: Rule[] = [
  { id: uuid(), name: "Zero posts", field: "posts_count", operator: "eq", value: "0", points: 30, enabled: true, color: "#ef4444" },
  { id: uuid(), name: "Few followers (<20)", field: "followers_count", operator: "lt", value: "20", points: 20, enabled: true, color: "#f97316" },
  { id: uuid(), name: "Zero followers", field: "is_followers_zero", operator: "is_true", value: "", points: 20, enabled: true, color: "#ef4444" },
  { id: uuid(), name: "High following (>1000)", field: "following_count", operator: "gt", value: "1000", points: 20, enabled: true, color: "#eab308" },
  { id: uuid(), name: "Following >> followers", field: "followers_following_ratio", operator: "lt", value: "0.3", points: 25, enabled: true, color: "#ec4899" },
  { id: uuid(), name: "Following >> followers (extreme)", field: "followers_following_ratio", operator: "eq", value: "0", points: 15, enabled: true, color: "#f97316" },
  { id: uuid(), name: "All-digits username", field: "is_all_digits_username", operator: "is_true", value: "", points: 25, enabled: true, color: "#ef4444" },
  { id: uuid(), name: "Gibberish username (no vowels)", field: "is_username_gibberish", operator: "is_true", value: "", points: 15, enabled: true, color: "#8b5cf6" },
  { id: uuid(), name: "Many numbers in username", field: "username_digit_count", operator: "gt", value: "4", points: 10, enabled: true, color: "#a855f7" },
  { id: uuid(), name: "Username trailing digits (5+)", field: "trailing_digit_count", operator: "gt", value: "4", points: 10, enabled: true, color: "#f97316" },
  { id: uuid(), name: "No profile pic", field: "has_profile_pic", operator: "is_false", value: "", points: 15, enabled: true, color: "#06b6d4" },
  { id: uuid(), name: "Default profile picture", field: "is_default_profile_pic", operator: "is_true", value: "", points: 10, enabled: true, color: "#06b6d4" },
  { id: uuid(), name: "Empty bio", field: "is_bio_empty", operator: "is_true", value: "", points: 10, enabled: true, color: "#eab308" },
  { id: uuid(), name: "No full name", field: "is_full_name_empty", operator: "is_true", value: "", points: 5, enabled: true, color: "#6b7280" },
  { id: uuid(), name: "Zero following", field: "is_following_zero", operator: "is_true", value: "", points: 10, enabled: true, color: "#ef4444" },
  { id: uuid(), name: "Not verified", field: "is_verified", operator: "is_false", value: "", points: 5, enabled: true, color: "#6b7280" },
  { id: uuid(), name: "Private account", field: "is_private", operator: "is_true", value: "", points: 5, enabled: true, color: "#6b7280" },
];

// ── Read / Write ──
function read<T>(key: string, fallback: T): T {
  if (typeof window === "undefined") return fallback;
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : fallback;
  } catch { return fallback; }
}

function write<T>(key: string, data: T) {
  if (typeof window === "undefined") return;
  localStorage.setItem(key, JSON.stringify(data));
}

// ── Followers ──
export function getFollowers(): Follower[] {
  return read<Follower[]>(STORAGE_KEY, []);
}

export function updateFollower(id: string, patch: Partial<Follower>): Follower[] {
  const list = getFollowers();
  const idx = list.findIndex((f) => f.id === id);
  if (idx === -1) return list;
  list[idx] = { ...list[idx], ...patch };
  write(STORAGE_KEY, list);
  return list;
}

export function deleteFollowers(ids: string[]): Follower[] {
  const list = getFollowers().filter((f) => !ids.includes(f.id));
  write(STORAGE_KEY, list);
  return list;
}

// ── Scoring ──
function evaluateRule(f: Follower, rule: Rule): boolean {
  const getVal = (): number | string | boolean => {
    switch (rule.field) {
      case "following_count": return f.following_count;
      case "followers_count": return f.followers_count;
      case "posts_count": return f.posts_count;
      case "has_profile_pic": return f.has_profile_pic;
      case "username": return f.username.toLowerCase();
      case "full_name": return f.full_name.toLowerCase();
      case "biography": return (f.biography || "").toLowerCase();
      case "account_age_days": return f.account_age_days ?? 0;
      case "is_verified": return f.is_verified;
      case "is_private": return f.is_private;
      case "is_business": return f.is_business;
      case "username_digit_count": return (f.username.match(/\d/g) || []).length;
      case "followers_following_ratio": return f.following_count > 0 ? f.followers_count / f.following_count : 0;
      // 🆕 Fake detection computed fields
      case "is_default_profile_pic": return !f.has_profile_pic && !!f.profile_pic_url;
      case "is_all_digits_username": return /^\d+$/.test(f.username);
      case "is_username_gibberish": return f.username.length >= 4 && !/[aeiou]/i.test(f.username);
      case "is_bio_empty": return !f.biography || f.biography.trim() === "";
      case "is_full_name_empty": return !f.full_name || f.full_name.trim() === "";
      case "is_followers_zero": return f.followers_count === 0;
      case "is_following_zero": return f.following_count === 0;
      case "trailing_digit_count": return (f.username.match(/\d+$/)?.[0]?.length || 0);
    }
  };
  const val = getVal();
  const target = ["is_true", "is_false"].includes(rule.operator) ? rule.operator === "is_true" : rule.operator === "gt" || rule.operator === "lt" ? parseFloat(rule.value) : rule.value;

  switch (rule.operator) {
    case "gt": return typeof val === "number" && val > (target as number);
    case "lt": return typeof val === "number" && val < (target as number);
    case "eq": return val === target;
    case "neq": return val !== target;
    case "contains": return typeof val === "string" && val.includes(target as string);
    case "not_contains": return typeof val === "string" && !val.includes(target as string);
    case "is_true": return val === true;
    case "is_false": return val === false;
  }
}

export function scoreFollower(f: Follower, rules: Rule[]): { score: number; reasons: string[] } {
  let score = 0;
  const reasons: string[] = [];
  for (const rule of rules) {
    if (!rule.enabled) continue;
    if (evaluateRule(f, rule)) {
      score += rule.points;
      reasons.push(rule.name);
    }
  }
  return { score: Math.min(score, 100), reasons };
}

export function scoreAll(rules?: Rule[]): Follower[] {
  const list = getFollowers();
  const activeRules = rules ?? getRules();
  const scored = list.map((f) => {
    const { score, reasons } = scoreFollower(f, activeRules);
    return { ...f, suspicion_score: score, suspicion_reasons: reasons };
  });
  write(STORAGE_KEY, scored);
  return scored;
}

// ── Import ──
export function importFollowers(raw: Record<string, any>[], filename: string): { count: number; batchId: string; skippedWhitelisted: number } {
  // Drop whitelisted accounts (match by IG pk/id or username) before anything else
  const whitelist = getWhitelist();
  const wlIds = new Set(whitelist.map((w) => w.id));
  const wlUsernames = new Set(whitelist.map((w) => w.username.toLowerCase()));
  const beforeCount = raw.length;
  raw = raw.filter((r) => {
    const id = String(r.pk ?? r.id ?? "");
    const username = String(r.username || r.user || r.handle || "").toLowerCase();
    return !(id && wlIds.has(id)) && !(username && wlUsernames.has(username));
  });
  const skippedWhitelisted = beforeCount - raw.length;

  const batchId = uuid();
  const batch: ImportBatch = { id: batchId, filename, count: raw.length, created_at: new Date().toISOString() };
  const batches = read<ImportBatch[]>(BATCHES_KEY, []);
  batches.unshift(batch);
  write(BATCHES_KEY, batches);

  const existing = getFollowers();
  const rules = getRules();
  const now = new Date().toISOString();

  const mapped: Follower[] = raw.map((r) => {
    const f: Follower = {
      id: uuid(),
      username: r.username || r.user || r.handle || `user_${Math.random().toString(36).slice(2, 6)}`,
      full_name: r.full_name || r.name || r.fullName || "",
      biography: r.biography || r.bio || r.about || "",
      followers_count: parseInt(r.followers_count ?? r.followers ?? r.followerCount ?? 0),
      following_count: parseInt(r.following_count ?? r.following ?? r.followingCount ?? 0),
      posts_count: parseInt(r.posts_count ?? r.posts ?? r.mediaCount ?? r.postCount ?? 0),
      is_private: r.is_private === true || r.isPrivate === true || r.private === true,
      is_verified: r.is_verified === true || r.isVerified === true || r.verified === true,
      // has_anonymous_profile_picture=true means Instagram's default silhouette — not a real pic
      has_profile_pic: r.has_anonymous_profile_picture === true
        ? false
        : (r.has_profile_pic === true || r.hasProfilePic === true || r.has_profile_picture === true || !!r.profile_pic_url),
      profile_pic_url: r.profile_pic_url || r.profilePicUrl || r.avatar || "",
      account_age_days: r.account_age_days ?? r.accountAgeDays ?? null,
      external_url: r.external_url ?? r.externalUrl ?? null,
      is_business: r.is_business === true || r.isBusiness === true || r.business === true,
      email: r.email ?? null,
      phone: r.phone ?? r.phone_number ?? null,
      suspicion_score: 0,
      suspicion_reasons: [],
      reviewed: false,
      approved: null,
      notes: "",
      created_at: now,
      import_batch: batchId,
    };
    const { score, reasons } = scoreFollower(f, rules);
    f.suspicion_score = score;
    f.suspicion_reasons = reasons;
    return f;
  });

  write(STORAGE_KEY, [...mapped, ...existing]);
  return { count: mapped.length, batchId, skippedWhitelisted };
}

export function clearAll() {
  localStorage.removeItem(STORAGE_KEY);
  localStorage.removeItem(BATCHES_KEY);
}

// ── Rules ──
export function getRules(): Rule[] {
  return read<Rule[]>(RULES_KEY, DEFAULT_RULES);
}

export function saveRules(rules: Rule[]) {
  write(RULES_KEY, rules);
  scoreAll(rules);
}

export function resetRules() {
  write(RULES_KEY, DEFAULT_RULES);
  scoreAll(DEFAULT_RULES);
}

// ── Import batches ──
export function getBatches(): ImportBatch[] {
  return read<ImportBatch[]>(BATCHES_KEY, []);
}

// ── Filters ──
export function applyFilters(list: Follower[], filters: ReviewFilters): Follower[] {
  let result = [...list];

  if (filters.search) {
    const q = filters.search.toLowerCase();
    result = result.filter((f) => f.username.toLowerCase().includes(q) || f.full_name.toLowerCase().includes(q));
  }

  if (filters.reviewed === "reviewed") result = result.filter((f) => f.reviewed);
  if (filters.reviewed === "unreviewed") result = result.filter((f) => !f.reviewed);
  if (filters.approved === "approved") result = result.filter((f) => f.approved === true);
  if (filters.approved === "rejected") result = result.filter((f) => f.approved === false);
  if (filters.isPrivate === "private") result = result.filter((f) => f.is_private);
  if (filters.isPrivate === "public") result = result.filter((f) => !f.is_private);
  if (filters.isVerified === "verified") result = result.filter((f) => f.is_verified);
  if (filters.isVerified === "unverified") result = result.filter((f) => !f.is_verified);
  if (filters.hasProfilePic === "yes") result = result.filter((f) => f.has_profile_pic);
  if (filters.hasProfilePic === "no") result = result.filter((f) => !f.has_profile_pic);

  if (filters.minScore > 0) result = result.filter((f) => f.suspicion_score >= filters.minScore);
  if (filters.maxScore < 100) result = result.filter((f) => f.suspicion_score <= filters.maxScore);
  if (filters.minFollowers > 0) result = result.filter((f) => f.followers_count >= filters.minFollowers);
  if (filters.maxFollowers) result = result.filter((f) => f.followers_count <= filters.maxFollowers);
  if (filters.minFollowing > 0) result = result.filter((f) => f.following_count >= filters.minFollowing);
  if (filters.maxFollowing) result = result.filter((f) => f.following_count <= filters.maxFollowing);
  if (filters.minPosts > 0) result = result.filter((f) => f.posts_count >= filters.minPosts);
  if (filters.maxPosts) result = result.filter((f) => f.posts_count <= filters.maxPosts);

  result.sort((a, b) => {
    const dir = filters.sortOrder === "asc" ? 1 : -1;
    switch (filters.sortField) {
      case "suspicion_score": return (a.suspicion_score - b.suspicion_score) * dir;
      case "followers_count": return (a.followers_count - b.followers_count) * dir;
      case "following_count": return (a.following_count - b.following_count) * dir;
      case "posts_count": return (a.posts_count - b.posts_count) * dir;
      case "username": return a.username.localeCompare(b.username) * dir;
      case "created_at": return a.created_at.localeCompare(b.created_at) * dir;
      default: return (a.suspicion_score - b.suspicion_score) * dir;
    }
  });

  return result;
}

export function getDefaultFilters(): ReviewFilters {
  return {
    search: "",
    sortField: "suspicion_score",
    sortOrder: "desc",
    minScore: 0,
    maxScore: 100,
    reviewed: "unreviewed",
    approved: "all",
    isPrivate: "all",
    isVerified: "all",
    hasProfilePic: "all",
    minFollowers: 0,
    maxFollowers: 0,
    minFollowing: 0,
    maxFollowing: 0,
    minPosts: 0,
    maxPosts: 0,
  };
}

// ── Dashboard stats ──
export function getDashboardStats(list: Follower[]): DashboardStats {
  return {
    total: list.length,
    reviewed: list.filter((f) => f.reviewed).length,
    flagged: list.filter((f) => f.suspicion_score >= 30).length,
    highRisk: list.filter((f) => f.suspicion_score >= 60).length,
    avgScore: list.length ? Math.round(list.reduce((s, f) => s + f.suspicion_score, 0) / list.length) : 0,
    privateCount: list.filter((f) => f.is_private).length,
    verifiedCount: list.filter((f) => f.is_verified).length,
    zeroPosts: list.filter((f) => f.posts_count === 0).length,
    noProfilePic: list.filter((f) => !f.has_profile_pic).length,
  };
}

// ── Export ──
export function exportCSV(filtered: Follower[]) {
  const headers = ["username", "full_name", "suspicion_score", "suspicion_reasons", "reviewed", "approved", "notes", "followers_count", "following_count", "posts_count", "is_private", "is_verified", "biography"];
  const rows = filtered.map((f) =>
    headers.map((h) => JSON.stringify(String((f as any)[h] ?? ""))).join(",")
  );
  return [headers.join(","), ...rows].join("\n");
}

export function exportJSON(filtered: Follower[]) {
  return JSON.stringify(filtered, null, 2);
}

/* ── Whitelist ──
 * Accounts the user decided to keep. They are filtered out of every
 * future import so a "keep" decision only ever has to be made once.
 */

export function getWhitelist(): WhitelistEntry[] {
  return read<WhitelistEntry[]>(WHITELIST_KEY, []);
}

export function addToWhitelist(entries: { id: string; username: string; full_name?: string; profile_pic_url?: string }[]): WhitelistEntry[] {
  const list = getWhitelist();
  const existing = new Set(list.map((w) => w.id));
  const now = new Date().toISOString();
  for (const e of entries) {
    if (existing.has(e.id)) continue;
    list.push({ id: e.id, username: e.username, full_name: e.full_name || "", profile_pic_url: e.profile_pic_url, added_at: now });
    existing.add(e.id);
  }
  write(WHITELIST_KEY, list);
  return list;
}

export function removeFromWhitelist(ids: string[]): WhitelistEntry[] {
  const list = getWhitelist().filter((w) => !ids.includes(w.id));
  write(WHITELIST_KEY, list);
  return list;
}

export function clearWhitelist(): void {
  write(WHITELIST_KEY, []);
}

export function isWhitelisted(id: string): boolean {
  return getWhitelist().some((w) => w.id === id);
}

/* ── Backup & Restore ──
 * Export all app data to a single JSON file for safe keeping.
 * Import it back to restore after clearing browser data or switching devices.
 */

export interface AppBackup {
  version: 1;
  exportedAt: string;
  followers: Follower[];
  rules: Rule[];
  batches: ImportBatch[];
  whitelist: WhitelistEntry[];
}

export function exportBackup(): AppBackup {
  return {
    version: 1,
    exportedAt: new Date().toISOString(),
    followers: getFollowers(),
    rules: getRules(),
    batches: getBatches(),
    whitelist: getWhitelist(),
  };
}

/**
 * Restore all data from a backup. Returns a count of restored items.
 * WARNING: This overwrites ALL current data (followers, rules, batches, whitelist).
 */
export function importBackup(backup: AppBackup): {
  followers: number;
  rules: number;
  batches: number;
  whitelist: number;
} {
  write(STORAGE_KEY, backup.followers || []);
  write(RULES_KEY, backup.rules || []);
  write(BATCHES_KEY, backup.batches || []);
  write(WHITELIST_KEY, backup.whitelist || []);
  return {
    followers: (backup.followers || []).length,
    rules: (backup.rules || []).length,
    batches: (backup.batches || []).length,
    whitelist: (backup.whitelist || []).length,
  };
}

/* ── Unfollow Queue ── */

export function getUnfollowQueue(): UnfollowEntry[] {
  return read<UnfollowEntry[]>(UNFOLLOW_QUEUE_KEY, []);
}

export function saveUnfollowQueue(queue: UnfollowEntry[]): void {
  write(UNFOLLOW_QUEUE_KEY, queue);
}

export function clearUnfollowQueue(): void {
  write(UNFOLLOW_QUEUE_KEY, []);
}

/* ── Instagram Cookies ── */

export function getInstagramCookies(): InstagramCookies | null {
  return read<InstagramCookies | null>(IG_COOKIES_KEY, null);
}

export function saveInstagramCookies(cookies: InstagramCookies): void {
  write(IG_COOKIES_KEY, cookies);
}

export function clearInstagramCookies(): void {
  write(IG_COOKIES_KEY, null);
}
