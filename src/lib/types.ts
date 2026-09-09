// ============================================================
// الأنواع المطابقة لمخطط قاعدة البيانات (supabase/android_multitenant_schema.sql)
// ============================================================

export type Role = 'super_admin' | 'center_admin' | 'student';

export interface Profile {
  id: string;
  role: Role;
  center_id: string | null;
  student_id: string | null;
  full_name: string;
  email: string | null;
  phone: string | null;
  is_active: boolean;
  created_at: string;
}

export interface Center {
  id: string;
  name: string;
  code: string;
  owner_name: string;
  owner_email: string | null;
  owner_phone: string | null;
  status: 'active' | 'suspended';
  created_at: string;
}

export interface Grade {
  id: string;
  center_id: string;
  name: string;
  academic_year: string;
  created_at: string;
}

export interface Group {
  id: string;
  center_id: string;
  grade_id: string | null;
  name: string;
  days: string[];
  start_time: string;
  end_time: string;
  monthly_fee: number;
  students_count: number;
}

export interface Student {
  id: string;
  center_id: string;
  name: string;
  phone: string | null;
  guardian_phone: string | null;
  email: string | null;
  grade_id: string | null;
  group_id: string | null;
  status: 'active' | 'suspended' | 'archived';
  notes: string | null;
  created_at: string;
  updated_at: string;
}

export interface Due {
  id: string;
  center_id: string;
  student_id: string;
  group_id: string | null;
  month: number;
  year: number;
  amount: number;
  status: 'pending' | 'paid' | 'partial';
  created_at: string;
}

export interface Payment {
  id: string;
  center_id: string;
  student_id: string;
  due_id: string | null;
  amount: number;
  payment_date: string;
  month: number;
  year: number;
  notes: string | null;
  created_at: string;
}

export interface SessionRecord {
  id: string;
  center_id: string;
  group_id: string;
  session_date: string;
  start_time: string;
  end_time: string;
  notes: string | null;
  created_at: string;
}

export type AttendanceStatus = 'present' | 'absent' | 'late';

export interface Attendance {
  id: string;
  center_id: string;
  session_id: string;
  student_id: string;
  status: AttendanceStatus;
  late_minutes: number | null;
  notes: string | null;
  created_at: string;
}

export interface ManualGrade {
  id: string;
  center_id: string;
  student_id: string;
  grade_id: string | null;
  group_id: string | null;
  title: string;
  score: number;
  max_score: number;
  month: number;
  year: number;
  notes: string | null;
  created_at: string;
}

export interface Announcement {
  id: string;
  center_id: string | null;
  title: string;
  body: string;
  pinned: boolean;
  created_at: string;
}

export type PlanType = 'monthly' | 'yearly' | 'custom';
export type SubscriptionStatus = 'active' | 'expired' | 'suspended';

export interface Subscription {
  id: string;
  center_id: string;
  plan_type: PlanType;
  starts_on: string;
  ends_on: string;
  status: SubscriptionStatus;
  notes: string | null;
  created_at: string;
}

export interface CenterLookup {
  id: string;
  name: string;
  owner_name: string;
}

export interface MySubscription {
  status: SubscriptionStatus | 'none';
  plan_type: PlanType | null;
  ends_on: string | null;
  days_left: number | null;
  center_status: string;
}

export interface PublicConfig {
  about_title?: string;
  about_body?: string;
  contact_whatsapp?: string;
  contact_email?: string;
  global_message?: string;
  min_app_version?: string;
}
