// ============================================================
// تنبيهات تجاوز حدود الاشتراك (لوحة إدارة المشتركين — المطور فقط)
// تعتمد على RPCs في supabase/20260912_entitlement_enforcement.sql
// ============================================================

import { getSupabase } from './supabase';

export interface UsageAlert {
  id: string;
  center_id: string;
  center_name: string;
  center_code: string;
  kind: 'teachers_over_limit' | 'secretaries_over_limit' | 'managers_over_limit' | 'students_over_limit';
  title: string;
  detail: { used: number; limit: number } | Record<string, unknown>;
  status: 'open' | 'resolved';
  resolution: 'auto' | 'blocked' | 'manual' | null;
  created_at: string;
  resolved_at: string | null;
}

export const ALERT_LABEL: Record<UsageAlert['kind'], string> = {
  teachers_over_limit: 'مدرسين',
  secretaries_over_limit: 'سكرتارية',
  managers_over_limit: 'مديرين',
  students_over_limit: 'طلاب',
};

/** قائمة تنبيهات التجاوز (مفتوحة ثم حديثة) */
export async function devListUsageAlerts(): Promise<UsageAlert[]> {
  const { data, error } = await getSupabase().rpc('list_center_alerts');
  if (error) throw error;
  return (Array.isArray(data) ? data : []) as UsageAlert[];
}

/** إعادة فحص كل السناتر وتحديث التنبيهات تلقائياً */
export async function devAuditUsage(): Promise<void> {
  const { error } = await getSupabase().rpc('audit_center_usage');
  if (error) throw error;
}

/** حجب حساب متجاوز (إيقاف السنتر والاشتراك وحل التنبيهات) */
export async function devBlockCenter(centerId: string): Promise<void> {
  const { error } = await getSupabase().rpc('dev_block_center', { p_center: centerId });
  if (error) throw error;
}

/** إلغاء حجب حساب */
export async function devUnblockCenter(centerId: string): Promise<void> {
  const { error } = await getSupabase().rpc('dev_unblock_center', { p_center: centerId });
  if (error) throw error;
}
