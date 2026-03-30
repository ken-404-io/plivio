export type PlanType = 'free' | 'premium' | 'elite';
export type TaskType = 'captcha' | 'video' | 'ad_click' | 'survey' | 'referral';
export type CompletionStatus = 'pending' | 'approved' | 'rejected';
export type WithdrawalStatus = 'pending' | 'processing' | 'paid' | 'rejected';
export type WithdrawalMethod = 'gcash' | 'paypal';
export type Theme = 'dark' | 'light';

export interface User {
  id: string;
  username: string;
  email: string;
  plan: PlanType;
  balance: string | number;
  referral_code: string;
  is_verified: boolean;
  is_admin: boolean;
  has_2fa: boolean;
  created_at: string;
  active_sub_plan?: PlanType;
  sub_expires_at?: string;
}

export interface SurveyQuestion {
  id: string;
  text: string;
  min_length: number;
}

export interface VerificationConfig {
  type: TaskType | string;
  duration_seconds?: number;
  questions?: SurveyQuestion[];
  auto?: boolean;
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
}

export interface StartTaskResponse {
  success: boolean;
  completion_id: string;
  verification_config: VerificationConfig;
  challenge?: { question: string };
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

export interface EarningsResponse {
  success: boolean;
  data: Earning[];
  meta: {
    page: number;
    limit: number;
    total: number;
  };
}

export interface Withdrawal {
  id: string;
  amount: string | number;
  method: WithdrawalMethod;
  status: WithdrawalStatus;
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
  method: WithdrawalMethod;
  status: WithdrawalStatus;
  requested_at: string;
  username: string;
  email: string;
}

export interface AdminStats {
  total_users: number;
  active_tasks: number;
  pending_withdrawals: number;
  pending_withdrawal_total: number;
  total_approved_earnings: number;
}

export interface RegisterPayload {
  username: string;
  email: string;
  password: string;
  referral_code?: string;
}

export interface AuthContextValue {
  user: User | null;
  loading: boolean;
  login: (email: string, password: string) => Promise<{ requires_2fa: boolean }>;
  verify2FA: (token: string) => Promise<void>;
  register: (payload: RegisterPayload) => Promise<void>;
  logout: () => Promise<void>;
  fetchMe: () => Promise<void>;
}
