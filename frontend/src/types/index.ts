export type PlanType = 'free' | 'premium' | 'elite';
export type TaskType = 'captcha' | 'video' | 'ad_click' | 'survey' | 'referral';
export type CompletionStatus = 'pending' | 'approved' | 'rejected';
export type WithdrawalStatus = 'pending' | 'processing' | 'paid' | 'rejected' | 'cancelled';
export type WithdrawalMethod = 'gcash' | 'paypal';
export type Theme = 'dark' | 'light';

export interface User {
  id: string;
  username: string;
  email: string;
  plan: PlanType;
  balance: string | number;
  coins: string | number;
  streak_count: number;
  last_streak_date: string | null;
  streak_broken_at: string | null;
  streak_before_break: number;
  referral_code: string;
  is_verified: boolean;
  is_email_verified: boolean;
  is_admin: boolean;
  has_2fa: boolean;
  kyc_status: 'none' | 'pending' | 'approved' | 'rejected';
  avatar_url: string | null;
  created_at: string;
  active_sub_plan?: PlanType;
  sub_expires_at?: string;
}

export interface CoinTransaction {
  id: string;
  type: 'streak_bonus' | 'streak_recovery' | 'conversion' | 'task_reward';
  amount: number;
  description: string;
  created_at: string;
}

export interface CoinsResponse {
  success: boolean;
  coins: number;
  streak_count: number;
  last_streak_date: string | null;
  streak_broken_at: string | null;
  streak_before_break: number;
  can_recover: boolean;
  today_completions: number;
  checked_in_today: boolean;
}

export type KycStatus = 'none' | 'pending' | 'approved' | 'rejected';

export interface KycSubmission {
  id: string;
  user_id: string;
  username: string;
  email: string;
  id_type: string;
  status: KycStatus;
  rejection_reason: string | null;
  submitted_at: string;
  reviewed_at: string | null;
}

export interface Notification {
  id: string;
  type: string;
  title: string;
  message: string;
  link: string | null;
  is_read: boolean;
  created_at: string;
}

export interface SurveyQuestion {
  id: string;
  text: string;
  min_length: number;
}

export interface AdNetwork {
  name: string;
  weight: number;
  embed_code: string;
}

export interface VerificationConfig {
  type: TaskType | string;
  duration_seconds?: number;
  questions?: SurveyQuestion[];
  auto?: boolean;
  networks?: AdNetwork[];
}

export interface Task {
  id: string;
  title: string;
  type: TaskType;
  reward_amount: string | number;
  min_plan: PlanType;
  completed_today: boolean;
  in_progress_today?: boolean;
  is_active?: boolean;
  verification_config?: VerificationConfig;
}

export interface TaskListResponse {
  success: boolean;
  tasks: Task[];
  today_earnings: number;
  daily_limit: number | null;
  plan: PlanType;
  referral_count: number;
  referral_earned: number;
}

export interface StartTaskResponse {
  success: boolean;
  completion_id: string;
  verification_config: VerificationConfig;
  embed_code?: string;
}

export interface SubmitTaskResponse {
  success: boolean;
  reward_earned: string | number;
  message: string;
}

export interface Earning {
  id: string;
  title: string;
  type: TaskType;
  reward_earned: string | number;
  status: CompletionStatus;
  completed_at: string;
}

export interface EarningsSummary {
  total_earned:    number;
  approved_amount: number;
  pending_amount:  number;
  today_earned:    number;
  total_count:     number;
  approved_count:  number;
  pending_count:   number;
}

export interface EarningsResponse {
  success: boolean;
  data: Earning[];
  summary?: EarningsSummary;
  meta: {
    page: number;
    limit: number;
    total: number;
  };
}

export interface Withdrawal {
  id: string;
  amount: string | number;
  fee_amount: string | number;
  net_amount: string | number;
  method: WithdrawalMethod;
  status: WithdrawalStatus;
  account_name: string;
  account_number: string;
  rejection_reason: string | null;
  requested_at: string;
  processed_at?: string;
}

export interface WithdrawalsResponse {
  success: boolean;
  data: Withdrawal[];
  meta: {
    page: number;
    limit: number;
    total: number;
  };
}

export interface Subscription {
  id: string;
  plan: PlanType;
  starts_at: string;
  expires_at: string;
  is_active: boolean;
}

export interface PlanInfo {
  name: string;
  price_php: number;
  daily_limit: number | null;
  features: string[];
}

export interface PlansResponse {
  success: boolean;
  plans: Record<string, PlanInfo>;
}

export interface AdminUser {
  id: string;
  username: string;
  email: string;
  plan: PlanType;
  balance: string | number;
  is_verified: boolean;
  is_banned: boolean;
  is_admin: boolean;
  created_at: string;
}

export interface AdminTask {
  id: string;
  title: string;
  type: TaskType;
  reward_amount: string | number;
  min_plan: PlanType;
  is_active: boolean;
  created_at: string;
}

export interface AdminWithdrawal {
  id: string;
  amount: string | number;
  fee_amount: string | number;
  net_amount: string | number;
  method: WithdrawalMethod;
  status: WithdrawalStatus;
  account_name: string;
  account_number: string;
  requested_at: string;
  processed_at?: string;
  processed_by?: string;
  username: string;
  email: string;
}

export interface AdminStats {
  total_users: number;
  active_tasks: number;
  pending_withdrawals: number;
  pending_withdrawal_total: number;
  total_approved_earnings: number;
  new_users_today: number;
  completed_tasks_today: number;
  pending_kyc: number;
  total_coins_distributed: number;
}

export interface AdminKycSubmission {
  id: string;
  user_id: string;
  username: string;
  email: string;
  id_type: string;
  status: KycStatus;
  rejection_reason: string | null;
  submitted_at: string;
  reviewed_at: string | null;
}

export interface RegisterPayload {
  username: string;
  email: string;
  password: string;
  referral_code?: string;
  device_id?: string;
}

export type AuthTransition = 'logging-in' | 'logging-out' | null;

export interface AuthContextValue {
  user: User | null;
  loading: boolean;
  transition: AuthTransition;
  sessionConflict: boolean;
  login: (email: string, password: string) => Promise<{ requires_2fa: boolean; is_admin: boolean }>;
  verify2FA: (token: string) => Promise<{ is_admin: boolean }>;
  register: (payload: RegisterPayload) => Promise<{ requires_email_verification: boolean; email: string }>;
  logout: () => Promise<void>;
  fetchMe: () => Promise<User | null>;
  dismissSessionConflict: () => void;
}
