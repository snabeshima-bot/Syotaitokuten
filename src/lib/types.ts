export type EventStatus = "draft" | "open" | "closed";
export type Delivery = "ship" | "hand";
export type SubmissionStatus =
  | "received"
  | "verified"
  | "preparing"
  | "shipped"
  | "on_hold"
  | "invalid";

export type Member = {
  id: string;
  name: string;
  group_name: string;
  sort_order: number;
  active: boolean;
};

export type EventRow = {
  id: string;
  slug: string;
  title: string;
  description: string;
  image_url: string | null;
  event_date: string | null;
  opens_at: string | null;
  closes_at: string | null;
  status: EventStatus;
  retention_days: number;
  personal_data_purged_at: string | null;
  created_at: string;
};

export type RewardTier = {
  id: string;
  event_id: string;
  min_count: number;
  name: string;
  description: string;
  requires_member: boolean;
  delivery: Delivery;
  sort_order: number;
};

export type Submission = {
  id: string;
  receipt_no: number;
  event_id: string;
  ticket_number: string;
  nickname: string;
  email: string | null;
  claimed_count: number;
  confirmed_count: number | null;
  full_name: string | null;
  phone: string | null;
  postal_code: string | null;
  address1: string | null;
  address2: string | null;
  status: SubmissionStatus;
  duplicate_suspected: boolean;
  staff_note: string;
  email_hash: string | null;
  phone_hash: string | null;
  consented_at: string | null;
  edit_token_expires_at: string | null;
  confirmed_at: string | null;
  confirmed_by: string | null;
  purged_at: string | null;
  created_at: string;
  updated_at: string;
};

export type SubmissionReward = {
  id: string;
  submission_id: string;
  tier_id: string;
  member_id: string | null;
};

export type Shipment = {
  id: string;
  submission_id: string;
  carrier: string;
  tracking_number: string;
  shipped_at: string;
  notified_at: string | null;
};

export const SUBMISSION_STATUS_LABELS: Record<SubmissionStatus, string> = {
  received: "受付",
  verified: "人数確認済",
  preparing: "発送準備",
  shipped: "発送済",
  on_hold: "保留",
  invalid: "無効",
};

export const EVENT_STATUS_LABELS: Record<EventStatus, string> = {
  draft: "準備中",
  open: "受付中",
  closed: "受付終了",
};

export const DELIVERY_LABELS: Record<Delivery, string> = {
  ship: "発送",
  hand: "当日手渡し",
};

export const STATUS_TONES: Record<SubmissionStatus, "gray" | "pink" | "green" | "amber" | "red" | "blue"> = {
  received: "pink",
  verified: "blue",
  preparing: "amber",
  shipped: "green",
  on_hold: "gray",
  invalid: "red",
};
