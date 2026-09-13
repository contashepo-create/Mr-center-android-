// ============================================================
// الأنواع المطابقة لمخطط قاعدة البيانات (supabase/android_multitenant_schema.sql)
// ============================================================

export type Role = 'super_admin' | 'center_admin' | 'student' | 'teacher' | 'manager' | 'secretary';

export interface SubscriptionRequest {
  id: string;
  center_id: string;
  plan: string;
  months: number;
  amount: number;
  transfer_at: string;
  status: 'pending' | 'approved' | 'rejected';
  notes: string | null;
  created_at: string;
}

export interface ActivityLog {
  id: string;
  center_id: string;
  actor_id: string;
  actor_name: string;
  action: string;
  details: string;
  created_at: string;
}

export type TeacherPermKey =
  | 'attendance' | 'exams' | 'grades' | 'reports' | 'announcements'
  | 'surveys' | 'honors' | 'inquiries' | 'collect' | 'notify';

export type TeacherPerms = Partial<Record<TeacherPermKey, boolean>>;

export interface Profile {
  id: string;
  role: Role;
  center_id: string | null;
  student_id: string | null;
  full_name: string;
  email: string | null;
  phone: string | null;
  is_active: boolean;
  perms: TeacherPerms;
  push_token?: string | null;
  created_at: string;
}

export type CenterKind = 'center' | 'solo';

export interface Center {
  id: string;
  name: string;
  code: string;
  kind: CenterKind;
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
  sort_order: number;
  created_at: string;
}

export type BillingType = 'monthly' | 'weekly' | 'per_session';

export interface Group {
  id: string;
  center_id: string;
  grade_id: string | null;
  name: string;
  teacher_name: string;
  teacher_phone: string | null;
  days: string[];
  start_time: string;
  end_time: string;
  monthly_fee: number;
  billing_type: BillingType;
  weekly_price: number;
  session_price: number;
  students_count: number;
  due_mode?: 'manual' | 'attendance';
  attendance_due_amount?: number;
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
  due_year: number;
  amount: number;
  status: 'pending' | 'paid' | 'partial';
  due_source?: 'manual' | 'attendance';
  session_id?: string | null;
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
  payment_year: number;
  notes: string | null;
  payment_kind?: 'due_payment' | 'credit';
  created_at: string;
}

export interface StudentAccountDue {
  id: string;
  group_id: string | null;
  month: number;
  due_year: number;
  amount: number;
  cash_paid: number;
  credit_applied: number;
  settled_amount: number;
  remaining: number;
  status: 'pending' | 'paid' | 'partial';
  due_source: 'manual' | 'attendance';
  session_id: string | null;
  created_at: string;
}

export interface StudentAccountCredit {
  id: string;
  amount: number;
  remaining: number;
  applied_to_dues: number;
  settled_amount: number;
  payment_date: string;
  notes: string | null;
  created_at: string;
}

export interface StudentAccount {
  student: Pick<Student, 'id' | 'name' | 'phone' | 'guardian_phone'>;
  summary: { credit_balance: number; amount_due: number; net_balance: number };
  dues: StudentAccountDue[];
  credits: StudentAccountCredit[];
  settlements: { amount: number; notes: string | null; created_at: string; kind: 'debt_settlement' }[];
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
  grade_year: number;
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

export type PlanType = 'monthly' | 'yearly' | 'custom' | 'trial' | 'center_full' | 'center_medium' | 'solo_teacher';
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
  extra_teachers?: number;
  extra_secretaries?: number;
  extra_managers?: number;
  enabled_features?: Record<string, boolean>;
}

export interface FiscalYear {
  id: string;
  center_id: string;
  fiscal_year: number;
  status: 'open' | 'closed';
  opening_balance: number;
  closing_balance: number | null;
  opened_at: string;
  closed_at: string | null;
}

export interface StaffInvite {
  id: string;
  center_id: string;
  code: string;
  name: string;
  phone: string | null;
  role: 'teacher' | 'secretary';
  status: 'pending' | 'accepted' | 'revoked';
  created_at: string;
}

export interface CenterLookup {
  id: string;
  name: string;
  owner_name: string;
  status: 'active' | 'suspended';
}

export interface MySubscription {
  status: SubscriptionStatus | 'none';
  plan_type: PlanType | null;
  ends_on: string | null;
  days_left: number | null;
  center_status: string;
}

export type ExamQuestionType =
  | 'mcq'       // اختيار من متعدد — تصحيح تلقائي
  | 'multi'     // متعدد الإجابات — تلقائي (مصفوفة فهارس)
  | 'tf'        // صح / خطأ — تلقائي
  | 'complete'  // أكمل الفراغ — تلقائي (مطابقة نص بعد التطبيع)
  | 'match'     // وصل — تلقائي (فهرس اليمنى لكل بند يسار)
  | 'correct'   // صحّح الخطأ — يدوي + نموذج إرشادي (المطابقة التامة تعتمد آلياً)
  | 'essay'     // مقالي — يدوي
  | 'short';    // إجابة قصيرة — يدوي

export interface ExamPair { l: string; r: string }

export interface ExamQuestion {
  q: string;
  type: ExamQuestionType;
  choices: string[];
  marks: number;
  /** الإجابة النموذجية (أكمل/صحّح) — تُخزَّن مطبَّعة في answers[i] */
  answer?: string;
  /** أزواج التوصيل (وصل) */
  pairs?: ExamPair[];
}

/** قيمة إجابة سؤال: فهرس / مصفوفة فهارس / نص / null لليدوي بلا نموذج */
export type ExamAnswer = number | number[] | string | null;

export interface AppExam {
  id: string;
  center_id: string;
  title: string;
  subject: string;
  grade_id: string | null;
  duration_minutes: number;
  questions: ExamQuestion[];
  answers: ExamAnswer[];
  total_score: number;
  is_published: boolean;
  created_at: string;
}

export interface PublishedExam {
  id: string;
  title: string;
  subject: string;
  grade_id: string | null;
  duration_minutes: number;
  total_score: number;
  questions: ExamQuestion[];
  attempted: boolean;
  created_at: string;
}

/** رسالة قناة الدعم (مالك السنتر ↔ المطور) */
export interface SupportMessage {
  id: string;
  center_id: string;
  sender_role: 'owner' | 'developer';
  sender_name: string;
  body: string;
  created_at: string;
}

export interface ExamAttempt {
  id: string;
  center_id: string;
  exam_id: string;
  student_id: string;
  answers: ExamAnswer[];
  score: number;
  max_score: number;
  status: 'graded' | 'pending_review';
  created_at: string;
}

export type InquiryKind = 'question' | 'transfer' | 'registration' | 'other';
export type InquiryStatus = 'pending' | 'answered' | 'approved' | 'rejected' | 'closed';

export interface AppInquiry {
  id: string;
  center_id: string;
  student_id: string | null;
  kind: InquiryKind;
  subject: string;
  body: string;
  status: InquiryStatus;
  reply: string | null;
  /** تفاصيل طلب الانتقال؛ موجودة فقط عندما kind = transfer. */
  from_group_id?: string | null;
  to_group_id?: string | null;
  resolved_at?: string | null;
  created_at: string;
  updated_at: string;
}

export interface AppSurvey {
  id: string;
  center_id: string;
  title: string;
  questions: string[];
  is_active: boolean;
  created_at: string;
}

export interface AppSurveyResponse {
  id: string;
  center_id: string;
  survey_id: string;
  student_id: string;
  answers: string[];
  created_at: string;
}

export type NotificationAudience = 'all' | 'grade' | 'group' | 'student' | 'owners' | 'staff';

/** طريقة وصول بث المطور: إشعار في الجرس، رسالة في صندوق الرسائل، أو نافذة طارئة مع سجل. */
export type DeveloperBroadcastPresentation = 'notification' | 'message' | 'urgent';

/** قنوات بث المطور الشاملة، متطابقة مع الويب وموثقة خادمياً عبر RPC. */
export type DeveloperBroadcastChannel =
  | 'center'
  | 'all_owners'
  | 'all_owners_staff'
  | 'all_owners_students'
  | 'all_students'
  | 'staff'
  | 'all_project';

/** مستلمو السنتر المحدد؛ كل اختيار يولّد صفاً واحداً فقط لكل دور، بلا رسائل مكررة. */
export type CenterBroadcastDelivery = 'owners' | 'owners_staff' | 'owners_students' | 'owners_students_staff' | 'students' | 'staff' | 'everyone';

export interface DeveloperBroadcastResult {
  channel: DeveloperBroadcastChannel;
  presentation?: DeveloperBroadcastPresentation;
  broadcast_id?: string;
  centers: number;
  notification_rows: number;
  recipient_accounts: number;
}

export interface AppNotification {
  id: string;
  center_id: string;
  audience: NotificationAudience;
  audience_id: string | null;
  title: string;
  body: string;
  created_at: string;
}

export interface MyNotification {
  id: string;
  title: string;
  body: string;
  created_at: string;
  /** notification = الجرس، message = صندوق الرسائل، urgent = نافذة طارئة وسجل. */
  presentation?: DeveloperBroadcastPresentation;
  is_read: boolean;
}

export interface CommunicationItem {
  id: string;
  title: string;
  body: string;
  created_at: string;
  presentation?: DeveloperBroadcastPresentation;
  route: string;
  kind: 'notification' | 'developer_message' | 'support_message';
}

export interface CommunicationBucket {
  unread: number;
  items: CommunicationItem[];
}

export interface CommunicationSummary {
  notifications: CommunicationBucket;
  messages: CommunicationBucket;
}

export interface CenterSettings {
  whatsapp: string;
  contact_email: string;
  registration_open: boolean;
  archive_year: string;
}

export interface PublicConfig {
  about_title?: string;
  about_body?: string;
  contact_whatsapp?: string;
  contact_email?: string;
  global_message?: string;
  min_app_version?: string;
}
