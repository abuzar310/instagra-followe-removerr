export interface Follower {
  id: string;
  username: string;
  full_name: string;
  biography: string;
  followers_count: number;
  following_count: number;
  posts_count: number;
  is_private: boolean;
  is_verified: boolean;
  has_profile_pic: boolean;
  profile_pic_url: string;
  account_age_days: number | null;
  external_url: string | null;
  is_business: boolean;
  email: string | null;
  phone: string | null;

  // computed
  suspicion_score: number;
  suspicion_reasons: string[];
  reviewed: boolean;
  approved: boolean | null;
  notes: string;
  created_at: string;
  import_batch: string;
}

export interface Rule {
  id: string;
  name: string;
  field: RuleField;
  operator: RuleOperator;
  value: string;
  points: number;
  enabled: boolean;
  color?: string;
}

export type RuleField =
  | "following_count"
  | "followers_count"
  | "posts_count"
  | "has_profile_pic"
  | "username"
  | "full_name"
  | "biography"
  | "account_age_days"
  | "is_verified"
  | "is_private"
  | "is_business"
  | "followers_following_ratio"
  | "username_digit_count"
  // 🆕 Fake detection fields
  | "is_default_profile_pic"
  | "is_all_digits_username"
  | "is_username_gibberish"
  | "is_bio_empty"
  | "is_full_name_empty"
  | "is_followers_zero"
  | "is_following_zero"
  | "trailing_digit_count";

export type RuleOperator = "gt" | "lt" | "eq" | "neq" | "contains" | "not_contains" | "is_true" | "is_false";

export interface ImportBatch {
  id: string;
  filename: string;
  count: number;
  created_at: string;
}

export type SortField = "suspicion_score" | "followers_count" | "following_count" | "posts_count" | "username" | "created_at";
export type SortOrder = "asc" | "desc";

export interface ReviewFilters {
  search: string;
  sortField: SortField;
  sortOrder: SortOrder;
  minScore: number;
  maxScore: number;
  reviewed: "all" | "reviewed" | "unreviewed";
  approved: "all" | "approved" | "rejected";
  isPrivate: "all" | "private" | "public";
  isVerified: "all" | "verified" | "unverified";
  hasProfilePic: "all" | "yes" | "no";
  minFollowers: number;
  maxFollowers: number;
  minFollowing: number;
  maxFollowing: number;
  minPosts: number;
  maxPosts: number;
}

/* ── Instagram Session ── */

export interface InstagramCookies {
  sessionid: string
  csrftoken: string
  ds_user_id: string
  rur?: string
}

export type UnfollowStatus = "queued" | "processing" | "done" | "error"

export interface UnfollowEntry {
  profileId: string
  username: string
  fullName: string
  status: UnfollowStatus
  error?: string
  unfollowedAt?: string
}

export interface SchedulerState {
  isRunning: boolean
  isPaused: boolean
  cycleWindowMs: number
  entries: UnfollowEntry[]
  startTime: string | null
  estimatedEndTime: string | null
  completedCount: number
  totalCount: number
  nextAt: string | null
}

export interface FetchProgress {
  phase: "followers" | "following" | "analyzing" | "done" | "error"
  followersFetched: number
  followingFetched: number
  totalFollowers: number
  totalFollowing: number
  error?: string
}

export interface WhitelistEntry {
  id: string;          // Instagram pk — stable across fetches
  username: string;
  full_name: string;
  profile_pic_url?: string;
  added_at: string;
}

export interface DashboardStats {
  total: number;
  reviewed: number;
  flagged: number;
  highRisk: number;
  avgScore: number;
  privateCount: number;
  verifiedCount: number;
  zeroPosts: number;
  noProfilePic: number;
}
