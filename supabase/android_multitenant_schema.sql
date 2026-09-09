-- ============================================================================
--  نظام Mr Center — مخطط تعدد السناتر (Multi-Tenant) للتطبيق + الموقع
-- ----------------------------------------------------------------------------
--  ✦ هذا الملف يضيف للمشروع الحالي (موقع centerpuplish) نظام:
--      • السناتر (centers) بكود فريد ثابت لكل سنتر
--      • الملفات الشخصية (profiles) بثلاث صلاحيات: مطور / مسئول سنتر / طالب
--      • الاشتراكات (شهري/سنوي/مخصص) يتحكم بها المطور
--      • إعدادات عامة يتحكم بها المطور وتُقرأ من كل العملاء
--      • عزل كامل للبيانات بـ center_id عبر Row Level Security
--
--  ✦ آمن لإعادة التشغيل: كل شيء IF NOT EXISTS / OR REPLACE / TRANSACTION واحدة
--  ✦ لا يحذف أي بيانات ولا يكسر الموقع الحالي:
--      حساب الموقع القديم (بلا ملف في profiles) يحتفظ بصلاحية كاملة تلقائياً
-- ============================================================================

BEGIN;

-- ============================================================================
-- ١) الجداول الجديدة
-- ============================================================================

-- السناتر: الكود فريد وثابت، ٣-٨ حروف/أرقام يحددها صاحب السنتر عند التسجيل
CREATE TABLE IF NOT EXISTS public.centers (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name        TEXT NOT NULL,
  code        TEXT NOT NULL,
  owner_name  TEXT NOT NULL DEFAULT '',
  owner_email TEXT,
  owner_phone TEXT,
  status      TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active','suspended')),
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS centers_code_unique ON public.centers (upper(code));
CREATE INDEX IF NOT EXISTS idx_centers_status ON public.centers(status);

-- الملفات الشخصية: تربط حساب Supabase Auth بصلاحيته وسنتره
CREATE TABLE IF NOT EXISTS public.profiles (
  id          UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  role        TEXT NOT NULL CHECK (role IN ('super_admin','center_admin','student')),
  center_id   UUID REFERENCES public.centers(id) ON DELETE CASCADE,
  student_id  TEXT,
  full_name   TEXT NOT NULL DEFAULT '',
  email       TEXT,
  phone       TEXT,
  is_active   BOOLEAN NOT NULL DEFAULT true,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
-- البريد ورقم الهاتف فريدان على مستوى النظام كله (حتى لو اختلف السنتر)
CREATE UNIQUE INDEX IF NOT EXISTS profiles_email_unique
  ON public.profiles (lower(email)) WHERE email IS NOT NULL AND email <> '';
CREATE UNIQUE INDEX IF NOT EXISTS profiles_phone_unique
  ON public.profiles (phone) WHERE phone IS NOT NULL AND phone <> '';
CREATE INDEX IF NOT EXISTS idx_profiles_center ON public.profiles(center_id);
CREATE INDEX IF NOT EXISTS idx_profiles_student ON public.profiles(student_id);

-- اشتراكات السناتر (يتحكم بها المطور فقط)
CREATE TABLE IF NOT EXISTS public.center_subscriptions (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  center_id  UUID NOT NULL REFERENCES public.centers(id) ON DELETE CASCADE,
  plan_type  TEXT NOT NULL DEFAULT 'monthly' CHECK (plan_type IN ('monthly','yearly','custom')),
  starts_on  DATE NOT NULL DEFAULT CURRENT_DATE,
  ends_on    DATE NOT NULL,
  status     TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active','expired','suspended')),
  notes      TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_subs_center ON public.center_subscriptions(center_id);

-- إعدادات التطبيق العامة (صفحة «حول التطبيق» + توجيه مفاتيح الربط + رسالة المطور)
CREATE TABLE IF NOT EXISTS public.app_config (
  key        TEXT PRIMARY KEY,
  value      JSONB NOT NULL DEFAULT '{}',
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
-- الصف العام الذي يقرأه كل العملاء (محتوى «حول التطبيق» ورسالة المطور).
-- ملاحظة: مفاتيح قاعدة البيانات والتحديثات لا تمرّ من هنا — بل من عامل
-- كلاود فلير الوسيط (انظر مجلد cloudflare في المشروع).
INSERT INTO public.app_config (key, value) VALUES ('public_config', '{
  "about_title": "Mr Center",
  "about_body": "تطبيق إدارة السناتر التعليمية: طلاب، مجموعات، حضور، مدفوعات ودرجات — بنظام عزل كامل لكل سنتر.",
  "contact_whatsapp": "",
  "contact_email": "",
  "global_message": "",
  "min_app_version": "1.0.0"
}'::jsonb)
ON CONFLICT (key) DO NOTHING;

-- ============================================================================
-- ٢) توسيع جداول الموقع الحالية بعمود center_id (لا يمس البيانات الحالية)
--    الصفوف القديمة تبقى center_id = NULL وتخص حساب الموقع القديم فقط
-- ============================================================================

ALTER TABLE public.grades        ADD COLUMN IF NOT EXISTS center_id UUID REFERENCES public.centers(id) ON DELETE CASCADE;
ALTER TABLE public.groups        ADD COLUMN IF NOT EXISTS center_id UUID REFERENCES public.centers(id) ON DELETE CASCADE;
ALTER TABLE public.students      ADD COLUMN IF NOT EXISTS center_id UUID REFERENCES public.centers(id) ON DELETE CASCADE;
ALTER TABLE public.students      ADD COLUMN IF NOT EXISTS guardian_phone TEXT;
ALTER TABLE public.dues          ADD COLUMN IF NOT EXISTS center_id UUID REFERENCES public.centers(id) ON DELETE CASCADE;
ALTER TABLE public.payments      ADD COLUMN IF NOT EXISTS center_id UUID REFERENCES public.centers(id) ON DELETE CASCADE;
ALTER TABLE public.sessions      ADD COLUMN IF NOT EXISTS center_id UUID REFERENCES public.centers(id) ON DELETE CASCADE;
ALTER TABLE public.attendance    ADD COLUMN IF NOT EXISTS center_id UUID REFERENCES public.centers(id) ON DELETE CASCADE;
ALTER TABLE public.announcements ADD COLUMN IF NOT EXISTS center_id UUID REFERENCES public.centers(id) ON DELETE CASCADE;
ALTER TABLE public.manual_grades ADD COLUMN IF NOT EXISTS center_id UUID REFERENCES public.centers(id) ON DELETE CASCADE;
ALTER TABLE public.exams         ADD COLUMN IF NOT EXISTS center_id UUID REFERENCES public.centers(id) ON DELETE CASCADE;
ALTER TABLE public.honorees      ADD COLUMN IF NOT EXISTS center_id UUID REFERENCES public.centers(id) ON DELETE CASCADE;
ALTER TABLE public.shared_files  ADD COLUMN IF NOT EXISTS center_id UUID REFERENCES public.centers(id) ON DELETE CASCADE;
ALTER TABLE public.important_links ADD COLUMN IF NOT EXISTS center_id UUID REFERENCES public.centers(id) ON DELETE CASCADE;

CREATE INDEX IF NOT EXISTS idx_grades_center        ON public.grades(center_id);
CREATE INDEX IF NOT EXISTS idx_groups_center        ON public.groups(center_id);
CREATE INDEX IF NOT EXISTS idx_students_center      ON public.students(center_id);
CREATE INDEX IF NOT EXISTS idx_dues_center          ON public.dues(center_id);
CREATE INDEX IF NOT EXISTS idx_payments_center      ON public.payments(center_id);
CREATE INDEX IF NOT EXISTS idx_sessions_center      ON public.sessions(center_id);
CREATE INDEX IF NOT EXISTS idx_attendance_center    ON public.attendance(center_id);
CREATE INDEX IF NOT EXISTS idx_announcements_center ON public.announcements(center_id);
CREATE INDEX IF NOT EXISTS idx_manual_grades_center ON public.manual_grades(center_id);

-- ============================================================================
-- ٣) دوال مساعدة للسياسات (أمنية: SECURITY DEFINER)
-- ============================================================================

-- صلاحية المستخدم الحالي من ملفه الشخصي
CREATE OR REPLACE FUNCTION public.my_role()
RETURNS TEXT LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT role FROM public.profiles WHERE id = auth.uid();
$$;

-- سنتر المستخدم الحالي
CREATE OR REPLACE FUNCTION public.my_center_id()
RETURNS UUID LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT center_id FROM public.profiles WHERE id = auth.uid();
$$;

-- سجل الطالب المرتبط بالمستخدم الحالي (إن كان طالباً)
CREATE OR REPLACE FUNCTION public.my_student_id()
RETURNS TEXT LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT student_id FROM public.profiles WHERE id = auth.uid();
$$;

-- «حساب الموقع القديم»: فقط حسابات المصادقة الموجودة لحظة تشغيل هذا الترحيل
-- تُدرج تلقائياً في قائمة allowed الحسابات القديمة (app_config ← legacy_admins).
-- أي حساب يُنشأ بعد الترحيل يمرّ إجبارياً عبر نظام profiles والصلاحيات —
-- فلا يستطيع مهاجم التسجيل بنفسه والادعاء أنه «مالك النظام القديم».
INSERT INTO public.app_config (key, value)
SELECT 'legacy_admins', COALESCE(jsonb_agg(u.id::text), '[]'::jsonb)
FROM auth.users u
ON CONFLICT (key) DO NOTHING;

-- هل المستخدم الحالي ضمن القائمة البيضاء لحسابات النظام القديم؟
CREATE OR REPLACE FUNCTION public.is_legacy_admin()
RETURNS BOOLEAN LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT auth.role() = 'authenticated'
     AND EXISTS (
       SELECT 1 FROM public.app_config
       WHERE key = 'legacy_admins' AND value ? (auth.uid())::text
     );
$$;

-- هل سنتر معين فعّال (غير موقوف)؟ تُستخدم لمنع الكتابة عند الإيقاف
CREATE OR REPLACE FUNCTION public.center_is_active(cid UUID)
RETURNS BOOLEAN LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.centers WHERE id = cid AND status = 'active');
$$;

-- صلاحية كاملة للأدوار الإدارية على صف معين: مطور أو موقع قديم أو مسئول نفس السنتر
CREATE OR REPLACE FUNCTION public.admin_owns_center(cid UUID)
RETURNS BOOLEAN LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT public.is_legacy_admin()
      OR public.my_role() = 'super_admin'
      OR (public.my_role() = 'center_admin' AND cid IS NOT NULL AND cid = public.my_center_id());
$$;

-- ============================================================================
-- ٤) دوال RPC الخاصة بالتسجيل والدخول (تُستدعى من التطبيق)
-- ============================================================================

-- البحث عن سنتر بالكود — متاح للزائر قبل التسجيل (يعرض الاسم واسم المسئول فقط)
CREATE OR REPLACE FUNCTION public.lookup_center_by_code(p_code TEXT)
RETURNS TABLE(id UUID, name TEXT, owner_name TEXT)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
BEGIN
  RETURN QUERY
  SELECT c.id, c.name, c.owner_name
  FROM public.centers c
  WHERE upper(trim(c.code)) = upper(trim(p_code))
    AND c.status = 'active'
  LIMIT 1;
END;
$$;

-- فحص توفر البريد/الهاتف قبل التسجيل — لتظهر رسالة واضحة «مستخدم من قبل»
CREATE OR REPLACE FUNCTION public.check_registration_availability(p_email TEXT, p_phone TEXT)
RETURNS JSONB LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_email_taken BOOLEAN := false;
  v_phone_taken BOOLEAN := false;
BEGIN
  IF p_email IS NOT NULL AND trim(p_email) <> '' THEN
    SELECT EXISTS (
      SELECT 1 FROM auth.users u WHERE lower(u.email) = lower(trim(p_email))
      UNION ALL
      SELECT 1 FROM public.profiles p WHERE lower(p.email) = lower(trim(p_email))
    ) INTO v_email_taken;
  END IF;
  IF p_phone IS NOT NULL AND trim(p_phone) <> '' THEN
    SELECT EXISTS (SELECT 1 FROM public.profiles WHERE phone = trim(p_phone)) INTO v_phone_taken;
  END IF;
  RETURN jsonb_build_object('email_taken', v_email_taken, 'phone_taken', v_phone_taken);
END;
$$;

-- إتمام تسجيل صاحب سنتر جديد: ينشئ السنتر + الملف + اشتراكاً تجريبياً ٣٠ يوماً
CREATE OR REPLACE FUNCTION public.complete_center_registration(
  p_center_name TEXT, p_code TEXT, p_owner_name TEXT, p_phone TEXT
) RETURNS UUID LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_uid UUID := auth.uid();
  v_email TEXT;
  v_center_id UUID;
  v_code TEXT := upper(regexp_replace(trim(p_code), '\s+', '', 'g'));
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'not_authenticated'; END IF;
  IF EXISTS (SELECT 1 FROM public.profiles WHERE id = v_uid) THEN
    RAISE EXCEPTION 'already_registered';
  END IF;
  IF char_length(v_code) < 3 OR char_length(v_code) > 8 THEN
    RAISE EXCEPTION 'invalid_code_format';
  END IF;
  SELECT email INTO v_email FROM auth.users WHERE id = v_uid;

  -- الكود فريد: أي تشابه يرفض العملية برسالة «الكود غير متاح»
  BEGIN
    INSERT INTO public.centers (name, code, owner_name, owner_email, owner_phone)
    VALUES (trim(p_center_name), v_code, trim(p_owner_name), v_email, nullif(trim(p_phone), ''))
    RETURNING id INTO v_center_id;
  EXCEPTION WHEN unique_violation THEN
    RAISE EXCEPTION 'center_code_taken';
  END;

  BEGIN
    INSERT INTO public.profiles (id, role, center_id, full_name, email, phone)
    VALUES (v_uid, 'center_admin', v_center_id, trim(p_owner_name), v_email, nullif(trim(p_phone), ''));
  EXCEPTION WHEN unique_violation THEN
    DELETE FROM public.centers WHERE id = v_center_id;
    RAISE EXCEPTION 'phone_taken';
  END;

  -- اشتراك تجريبي شهري يبدأ فوراً — والمطور يعدّله من لوحته متى شاء
  INSERT INTO public.center_subscriptions (center_id, plan_type, starts_on, ends_on, status, notes)
  VALUES (v_center_id, 'monthly', CURRENT_DATE, CURRENT_DATE + 30, 'active', 'اشتراك تجريبي عند التسجيل');

  RETURN v_center_id;
END;
$$;

-- إتمام تسجيل طالب جديد: يتحقق من السنتر ويربط الحساب بسجل الطالب تلقائياً
CREATE OR REPLACE FUNCTION public.complete_student_registration(
  p_center_id UUID, p_full_name TEXT, p_phone TEXT, p_guardian_phone TEXT DEFAULT ''
) RETURNS TEXT LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_uid UUID := auth.uid();
  v_email TEXT;
  v_student_id TEXT := gen_random_uuid()::text;
  v_status TEXT;
  v_now TEXT := to_char(now() AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"');
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'not_authenticated'; END IF;
  IF EXISTS (SELECT 1 FROM public.profiles WHERE id = v_uid) THEN
    RAISE EXCEPTION 'already_registered';
  END IF;
  SELECT status INTO v_status FROM public.centers WHERE id = p_center_id;
  IF v_status IS NULL THEN RAISE EXCEPTION 'center_not_found'; END IF;
  IF v_status <> 'active' THEN RAISE EXCEPTION 'center_suspended'; END IF;
  SELECT email INTO v_email FROM auth.users WHERE id = v_uid;

  INSERT INTO public.students (id, name, phone, guardian_phone, email, status, center_id, created_at, updated_at)
  VALUES (v_student_id, trim(p_full_name), nullif(trim(p_phone), ''), nullif(trim(p_guardian_phone), ''), v_email, 'active', p_center_id, v_now, v_now);

  BEGIN
    INSERT INTO public.profiles (id, role, center_id, student_id, full_name, email, phone)
    VALUES (v_uid, 'student', p_center_id, v_student_id, trim(p_full_name), v_email, nullif(trim(p_phone), ''));
  EXCEPTION WHEN unique_violation THEN
    DELETE FROM public.students WHERE id = v_student_id;
    RAISE EXCEPTION 'phone_taken';
  END;

  RETURN v_student_id;
END;
$$;

-- حالة اشتراك سنتر المستخدم الحالي (تُستدعى عند كل تشغيل)
CREATE OR REPLACE FUNCTION public.get_my_subscription()
RETURNS JSONB LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_role TEXT; v_center UUID; v_center_status TEXT;
  v_sub public.center_subscriptions%ROWTYPE;
  v_effective TEXT;
BEGIN
  SELECT role, center_id INTO v_role, v_center FROM public.profiles WHERE id = auth.uid();
  IF v_role IS NULL THEN RETURN jsonb_build_object('status', 'none'); END IF;
  IF v_role = 'super_admin' THEN
    RETURN jsonb_build_object('status', 'active', 'plan_type', 'custom', 'ends_on', null, 'days_left', null, 'center_status', 'active');
  END IF;
  IF v_center IS NULL THEN RETURN jsonb_build_object('status', 'none'); END IF;

  SELECT status INTO v_center_status FROM public.centers WHERE id = v_center;
  SELECT * INTO v_sub FROM public.center_subscriptions
   WHERE center_id = v_center ORDER BY ends_on DESC LIMIT 1;

  IF v_center_status = 'suspended' OR (v_sub.id IS NOT NULL AND v_sub.status = 'suspended') THEN
    v_effective := 'suspended';
  ELSIF v_sub.id IS NULL THEN
    v_effective := 'none';
  ELSIF v_sub.ends_on < CURRENT_DATE OR v_sub.status = 'expired' THEN
    v_effective := 'expired';
  ELSE
    v_effective := 'active';
  END IF;

  RETURN jsonb_build_object(
    'status', v_effective,
    'plan_type', v_sub.plan_type,
    'ends_on', v_sub.ends_on,
    'days_left', CASE WHEN v_sub.id IS NULL THEN null ELSE (v_sub.ends_on - CURRENT_DATE) END,
    'center_status', coalesce(v_center_status, 'active')
  );
END;
$$;

-- ============================================================================
-- ٥) مشغلات الحماية والمزامنة
-- ============================================================================

-- حماية ثوابت السنتر: الكود ثابت، والإيقاف/التفعيل (status) بيد المطور فقط —
-- فلا يستطيع مسئول السنتر تغيير كوده ولا إعادة تفعيل سنتره بعد إيقافه
CREATE OR REPLACE FUNCTION public.guard_center_code()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF public.my_role() IS DISTINCT FROM 'super_admin' AND NOT public.is_legacy_admin() THEN
    IF NEW.code IS DISTINCT FROM OLD.code THEN
      RAISE EXCEPTION 'code_is_fixed';
    END IF;
    IF NEW.status IS DISTINCT FROM OLD.status THEN
      RAISE EXCEPTION 'status_managed_by_developer';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS trg_guard_center_code ON public.centers;
CREATE TRIGGER trg_guard_center_code BEFORE UPDATE ON public.centers
  FOR EACH ROW EXECUTE FUNCTION public.guard_center_code();

-- حماية الهوية: الصلاحية والسنتر وربط الطالب لا يغيّرها إلا المطور
CREATE OR REPLACE FUNCTION public.guard_profile_identity()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT public.is_legacy_admin() AND public.my_role() IS DISTINCT FROM 'super_admin' THEN
    IF NEW.role IS DISTINCT FROM OLD.role
       OR NEW.center_id IS DISTINCT FROM OLD.center_id
       OR NEW.student_id IS DISTINCT FROM OLD.student_id
       OR NEW.is_active IS DISTINCT FROM OLD.is_active THEN
      RAISE EXCEPTION 'identity_protected';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS trg_guard_profile_identity ON public.profiles;
CREATE TRIGGER trg_guard_profile_identity BEFORE UPDATE ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.guard_profile_identity();

-- مزامنة عدد طلاب المجموعة تلقائياً
CREATE OR REPLACE FUNCTION public.sync_group_student_count()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF TG_OP IN ('INSERT', 'UPDATE') AND NEW.group_id IS NOT NULL THEN
    UPDATE public.groups
       SET students_count = (SELECT count(*) FROM public.students s WHERE s.group_id = NEW.group_id AND s.status = 'active')
     WHERE id = NEW.group_id;
  END IF;
  IF TG_OP IN ('DELETE', 'UPDATE') AND OLD.group_id IS NOT NULL THEN
    UPDATE public.groups
       SET students_count = (SELECT count(*) FROM public.students s WHERE s.group_id = OLD.group_id AND s.status = 'active')
     WHERE id = OLD.group_id;
  END IF;
  RETURN COALESCE(NEW, OLD);
END;
$$;
DROP TRIGGER IF EXISTS trg_sync_group_count ON public.students;
CREATE TRIGGER trg_sync_group_count
  AFTER INSERT OR DELETE OR UPDATE OF group_id, status ON public.students
  FOR EACH ROW EXECUTE FUNCTION public.sync_group_student_count();

-- ============================================================================
-- ٦) سياسات العزل (RLS) — قلب الأمان في النظام
-- ============================================================================

ALTER TABLE public.centers               ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.profiles              ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.center_subscriptions  ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.app_config            ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.grades                ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.groups                ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.students              ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.dues                  ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.payments              ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sessions              ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.attendance            ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.announcements         ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.manual_grades         ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.exams                 ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.honorees              ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.shared_files          ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.important_links       ENABLE ROW LEVEL SECURITY;

-- ---------- centers ----------
DROP POLICY IF EXISTS "centers_super_admin" ON public.centers;
CREATE POLICY "centers_super_admin" ON public.centers FOR ALL TO authenticated
  USING (public.my_role() = 'super_admin') WITH CHECK (public.my_role() = 'super_admin');
DROP POLICY IF EXISTS "centers_legacy" ON public.centers;
CREATE POLICY "centers_legacy" ON public.centers FOR ALL TO authenticated
  USING (public.is_legacy_admin()) WITH CHECK (public.is_legacy_admin());
DROP POLICY IF EXISTS "centers_member_read" ON public.centers;
CREATE POLICY "centers_member_read" ON public.centers FOR SELECT TO authenticated
  USING (id = public.my_center_id());
DROP POLICY IF EXISTS "centers_admin_update" ON public.centers;
CREATE POLICY "centers_admin_update" ON public.centers FOR UPDATE TO authenticated
  USING (public.my_role() = 'center_admin' AND id = public.my_center_id())
  WITH CHECK (public.my_role() = 'center_admin' AND id = public.my_center_id());

-- ---------- profiles ----------
DROP POLICY IF EXISTS "profiles_super_admin" ON public.profiles;
CREATE POLICY "profiles_super_admin" ON public.profiles FOR ALL TO authenticated
  USING (public.my_role() = 'super_admin') WITH CHECK (public.my_role() = 'super_admin');
DROP POLICY IF EXISTS "profiles_legacy" ON public.profiles;
CREATE POLICY "profiles_legacy" ON public.profiles FOR ALL TO authenticated
  USING (public.is_legacy_admin()) WITH CHECK (public.is_legacy_admin());
DROP POLICY IF EXISTS "profiles_self_read" ON public.profiles;
CREATE POLICY "profiles_self_read" ON public.profiles FOR SELECT TO authenticated
  USING (id = auth.uid());
DROP POLICY IF EXISTS "profiles_self_update" ON public.profiles;
CREATE POLICY "profiles_self_update" ON public.profiles FOR UPDATE TO authenticated
  USING (id = auth.uid()) WITH CHECK (id = auth.uid());
DROP POLICY IF EXISTS "profiles_center_admin_read" ON public.profiles;
CREATE POLICY "profiles_center_admin_read" ON public.profiles FOR SELECT TO authenticated
  USING (public.my_role() = 'center_admin' AND center_id = public.my_center_id());

-- ---------- center_subscriptions ----------
DROP POLICY IF EXISTS "subs_super_admin" ON public.center_subscriptions;
CREATE POLICY "subs_super_admin" ON public.center_subscriptions FOR ALL TO authenticated
  USING (public.my_role() = 'super_admin') WITH CHECK (public.my_role() = 'super_admin');
DROP POLICY IF EXISTS "subs_legacy" ON public.center_subscriptions;
CREATE POLICY "subs_legacy" ON public.center_subscriptions FOR ALL TO authenticated
  USING (public.is_legacy_admin()) WITH CHECK (public.is_legacy_admin());
DROP POLICY IF EXISTS "subs_member_read" ON public.center_subscriptions;
CREATE POLICY "subs_member_read" ON public.center_subscriptions FOR SELECT TO authenticated
  USING (center_id = public.my_center_id());

-- ---------- app_config ----------
-- القراءة العامة متاحة للجميع (حتى قبل تسجيل الدخول) لصف public_config فقط —
-- ليعرض محتوى «حول التطبيق» ورسالة المطور لأي عميل
DROP POLICY IF EXISTS "app_config_public_read" ON public.app_config;
CREATE POLICY "app_config_public_read" ON public.app_config FOR SELECT TO anon, authenticated
  USING (key = 'public_config');
DROP POLICY IF EXISTS "app_config_super_admin" ON public.app_config;
CREATE POLICY "app_config_super_admin" ON public.app_config FOR ALL TO authenticated
  USING (public.my_role() = 'super_admin') WITH CHECK (public.my_role() = 'super_admin');
DROP POLICY IF EXISTS "app_config_legacy" ON public.app_config;
CREATE POLICY "app_config_legacy" ON public.app_config FOR ALL TO authenticated
  USING (public.is_legacy_admin()) WITH CHECK (public.is_legacy_admin());
GRANT SELECT ON public.app_config TO anon, authenticated;

-- ============================================================================
--  سياسات الجداول المشتركة مع الموقع
--  نستبدل السياسة الواسعة القديمة بسياسات معزولة بـ center_id، مع:
--   • سياسة «الموقع القديم» تمنح حساب الموقع الأول صلاحية كاملة (لا ينكسر شيء)
--   • القراءة العامة (anon) تبقى فقط للصفوف القديمة center_id IS NULL
--     (الصفحة العامة للموقع تعمل كما هي، وبيانات السناتر الجديدة محمية)
-- ============================================================================

-- ---------- grades ----------
DROP POLICY IF EXISTS "authenticated full access" ON public.grades;
DROP POLICY IF EXISTS "public read grades" ON public.grades;
DROP POLICY IF EXISTS "grades_admin_all" ON public.grades;
CREATE POLICY "grades_admin_all" ON public.grades FOR ALL TO authenticated
  USING (public.admin_owns_center(center_id)) WITH CHECK (public.admin_owns_center(center_id));
DROP POLICY IF EXISTS "grades_member_read" ON public.grades;
CREATE POLICY "grades_member_read" ON public.grades FOR SELECT TO authenticated
  USING (center_id IS NOT NULL AND center_id = public.my_center_id());
DROP POLICY IF EXISTS "grades_public_legacy_read" ON public.grades;
CREATE POLICY "grades_public_legacy_read" ON public.grades FOR SELECT TO anon
  USING (center_id IS NULL);

-- ---------- groups ----------
DROP POLICY IF EXISTS "authenticated full access" ON public.groups;
DROP POLICY IF EXISTS "public read groups" ON public.groups;
DROP POLICY IF EXISTS "groups_admin_all" ON public.groups;
CREATE POLICY "groups_admin_all" ON public.groups FOR ALL TO authenticated
  USING (public.admin_owns_center(center_id)) WITH CHECK (public.admin_owns_center(center_id));
DROP POLICY IF EXISTS "groups_member_read" ON public.groups;
CREATE POLICY "groups_member_read" ON public.groups FOR SELECT TO authenticated
  USING (center_id IS NOT NULL AND center_id = public.my_center_id());
DROP POLICY IF EXISTS "groups_public_legacy_read" ON public.groups;
CREATE POLICY "groups_public_legacy_read" ON public.groups FOR SELECT TO anon
  USING (center_id IS NULL);

-- ---------- students ----------
DROP POLICY IF EXISTS "authenticated full access" ON public.students;
DROP POLICY IF EXISTS "public read" ON public.students;
DROP POLICY IF EXISTS "students_admin_all" ON public.students;
CREATE POLICY "students_admin_all" ON public.students FOR ALL TO authenticated
  USING (public.admin_owns_center(center_id))
  WITH CHECK (public.admin_owns_center(center_id)
              AND (center_id IS NULL OR public.center_is_active(center_id)));
DROP POLICY IF EXISTS "students_self_read" ON public.students;
CREATE POLICY "students_self_read" ON public.students FOR SELECT TO authenticated
  USING (id = public.my_student_id());

-- ---------- dues ----------
DROP POLICY IF EXISTS "authenticated full access" ON public.dues;
DROP POLICY IF EXISTS "dues_admin_all" ON public.dues;
CREATE POLICY "dues_admin_all" ON public.dues FOR ALL TO authenticated
  USING (public.admin_owns_center(center_id))
  WITH CHECK (public.admin_owns_center(center_id)
              AND (center_id IS NULL OR public.center_is_active(center_id)));
DROP POLICY IF EXISTS "dues_self_read" ON public.dues;
CREATE POLICY "dues_self_read" ON public.dues FOR SELECT TO authenticated
  USING (student_id = public.my_student_id());

-- ---------- payments ----------
DROP POLICY IF EXISTS "authenticated full access" ON public.payments;
DROP POLICY IF EXISTS "payments_admin_all" ON public.payments;
CREATE POLICY "payments_admin_all" ON public.payments FOR ALL TO authenticated
  USING (public.admin_owns_center(center_id))
  WITH CHECK (public.admin_owns_center(center_id)
              AND (center_id IS NULL OR public.center_is_active(center_id)));
DROP POLICY IF EXISTS "payments_self_read" ON public.payments;
CREATE POLICY "payments_self_read" ON public.payments FOR SELECT TO authenticated
  USING (student_id = public.my_student_id());

-- ---------- sessions ----------
DROP POLICY IF EXISTS "authenticated full access" ON public.sessions;
DROP POLICY IF EXISTS "sessions_admin_all" ON public.sessions;
CREATE POLICY "sessions_admin_all" ON public.sessions FOR ALL TO authenticated
  USING (public.admin_owns_center(center_id))
  WITH CHECK (public.admin_owns_center(center_id)
              AND (center_id IS NULL OR public.center_is_active(center_id)));
DROP POLICY IF EXISTS "sessions_member_read" ON public.sessions;
CREATE POLICY "sessions_member_read" ON public.sessions FOR SELECT TO authenticated
  USING (center_id IS NOT NULL AND center_id = public.my_center_id());

-- ---------- attendance ----------
DROP POLICY IF EXISTS "authenticated full access" ON public.attendance;
DROP POLICY IF EXISTS "attendance_admin_all" ON public.attendance;
CREATE POLICY "attendance_admin_all" ON public.attendance FOR ALL TO authenticated
  USING (public.admin_owns_center(center_id))
  WITH CHECK (public.admin_owns_center(center_id)
              AND (center_id IS NULL OR public.center_is_active(center_id)));
DROP POLICY IF EXISTS "attendance_self_read" ON public.attendance;
CREATE POLICY "attendance_self_read" ON public.attendance FOR SELECT TO authenticated
  USING (student_id = public.my_student_id());

-- ---------- announcements ----------
DROP POLICY IF EXISTS "authenticated full access" ON public.announcements;
DROP POLICY IF EXISTS "public read announcements" ON public.announcements;
DROP POLICY IF EXISTS "announcements_admin_all" ON public.announcements;
CREATE POLICY "announcements_admin_all" ON public.announcements FOR ALL TO authenticated
  USING (public.admin_owns_center(center_id))
  WITH CHECK (public.admin_owns_center(center_id)
              AND (center_id IS NULL OR public.center_is_active(center_id)));
DROP POLICY IF EXISTS "announcements_member_read" ON public.announcements;
CREATE POLICY "announcements_member_read" ON public.announcements FOR SELECT TO authenticated
  USING (center_id IS NOT NULL AND center_id = public.my_center_id());
DROP POLICY IF EXISTS "announcements_public_legacy_read" ON public.announcements;
CREATE POLICY "announcements_public_legacy_read" ON public.announcements FOR SELECT TO anon
  USING (center_id IS NULL);

-- ---------- manual_grades ----------
DROP POLICY IF EXISTS "authenticated full access" ON public.manual_grades;
DROP POLICY IF EXISTS "public read" ON public.manual_grades;
DROP POLICY IF EXISTS "manual_grades_admin_all" ON public.manual_grades;
CREATE POLICY "manual_grades_admin_all" ON public.manual_grades FOR ALL TO authenticated
  USING (public.admin_owns_center(center_id))
  WITH CHECK (public.admin_owns_center(center_id)
              AND (center_id IS NULL OR public.center_is_active(center_id)));
DROP POLICY IF EXISTS "manual_grades_self_read" ON public.manual_grades;
CREATE POLICY "manual_grades_self_read" ON public.manual_grades FOR SELECT TO authenticated
  USING (student_id = public.my_student_id());

-- ---------- exams (لا يستخدمها التطبيق حالياً — تبقى للموقع وترقيته لاحقاً) ----------
DROP POLICY IF EXISTS "authenticated full access" ON public.exams;
DROP POLICY IF EXISTS "exams_admin_all" ON public.exams;
CREATE POLICY "exams_admin_all" ON public.exams FOR ALL TO authenticated
  USING (public.admin_owns_center(center_id)) WITH CHECK (public.admin_owns_center(center_id));

-- ---------- honorees / shared_files / important_links (موارد الموقع العامة القديمة) ----------
DROP POLICY IF EXISTS "authenticated full access" ON public.honorees;
DROP POLICY IF EXISTS "public read honorees" ON public.honorees;
DROP POLICY IF EXISTS "honorees_admin_all" ON public.honorees;
CREATE POLICY "honorees_admin_all" ON public.honorees FOR ALL TO authenticated
  USING (public.admin_owns_center(center_id)) WITH CHECK (public.admin_owns_center(center_id));
DROP POLICY IF EXISTS "honorees_public_legacy_read" ON public.honorees;
CREATE POLICY "honorees_public_legacy_read" ON public.honorees FOR SELECT TO anon
  USING (center_id IS NULL);

DROP POLICY IF EXISTS "authenticated full access" ON public.shared_files;
DROP POLICY IF EXISTS "public read shared_files" ON public.shared_files;
DROP POLICY IF EXISTS "shared_files_admin_all" ON public.shared_files;
CREATE POLICY "shared_files_admin_all" ON public.shared_files FOR ALL TO authenticated
  USING (public.admin_owns_center(center_id)) WITH CHECK (public.admin_owns_center(center_id));
DROP POLICY IF EXISTS "shared_files_public_legacy_read" ON public.shared_files;
CREATE POLICY "shared_files_public_legacy_read" ON public.shared_files FOR SELECT TO anon
  USING (center_id IS NULL);

DROP POLICY IF EXISTS "authenticated full access" ON public.important_links;
DROP POLICY IF EXISTS "public read important_links" ON public.important_links;
DROP POLICY IF EXISTS "important_links_admin_all" ON public.important_links;
CREATE POLICY "important_links_admin_all" ON public.important_links FOR ALL TO authenticated
  USING (public.admin_owns_center(center_id)) WITH CHECK (public.admin_owns_center(center_id));
DROP POLICY IF EXISTS "important_links_public_legacy_read" ON public.important_links;
CREATE POLICY "important_links_public_legacy_read" ON public.important_links FOR SELECT TO anon
  USING (center_id IS NULL);

-- ============================================================================
-- ٧) صلاحيات تنفيذ الدوال
-- ============================================================================
GRANT EXECUTE ON FUNCTION public.lookup_center_by_code(TEXT) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.check_registration_availability(TEXT, TEXT) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.complete_center_registration(TEXT, TEXT, TEXT, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.complete_student_registration(UUID, TEXT, TEXT, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_my_subscription() TO authenticated;

COMMIT;

-- ============================================================================
-- ✅ تم. الخطوات التالية في README.md:
--   ١) إنشاء حساب المطور (سوبر أدمن) وترقيته بأمر SQL واحد
--   ٢) ضبط المصادقة (تفعيل التسجيل + إيقاف تأكيد البريد)
--   ٣) تشغيل التطبيق وربطه
-- ============================================================================
