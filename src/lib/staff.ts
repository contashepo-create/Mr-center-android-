// ============================================================
// نظام فريق العمل: الصلاحيات التفصيلية ونطاق المجموعات
// (المنطق النقي في rbac.ts — هنا الـ Hooks وتفاعل الشاشات)
// ============================================================

import { useEffect, useState } from 'react';
import { fetchTeacherGroups } from './api';
import { useSession } from './session';
import type { Profile, TeacherPermKey } from './types';

export {
  TEACHER_PERMS, STAFF_ROLES, isStaff, isOwner, can, roleLabel,
  TEACHER_TABS, TEACHER_SCREENS,
} from './rbac';

export type { TeacherPermKey } from './types';

/**
 * معرفات مجموعات المدرس المسندة — null لغير المدرس (يرى الكل).
 * مصفوفة (قد تكون فارغة = بلا نطاق) للمدرس.
 */
export function useTeacherGroupIds(): string[] | null {
  const { profile } = useSession();
  const [ids, setIds] = useState<string[] | null>(null);
  useEffect(() => {
    if (profile?.role === 'teacher' && profile?.id) {
      fetchTeacherGroups(profile.id)
        .then((r) => setIds(r.map((x) => x.group_id)))
        .catch(() => setIds([]));
    } else {
      setIds(null);
    }
  }, [profile?.role, profile?.id]);
  return ids;
}
