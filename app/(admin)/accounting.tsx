import React,{useCallback,useMemo,useState} from 'react';
import {Alert,Modal,Pressable,ScrollView,StyleSheet,Text,View} from 'react-native';
import {useFocusEffect,router} from 'expo-router';
import {Ionicons} from '@expo/vector-icons';
import {AppButton,AppInput,Card,NoAccess,SectionTitle} from '../../src/components/controls';
import {BackHeader,GradientScreen,KeyboardScreen} from '../../src/components/layout';
import {FormMessage,OptionPicker} from '../../src/components/pickers';
import {useSession} from '../../src/lib/session';
import {getSupabase} from '../../src/lib/supabase';
import {isOwner} from '../../src/lib/staff';
import {amendAccountingLedgerEntry,amendStaffDeduction,closeFiscalYear,fetchAccountingEnabled,fetchFiscalYears,fetchStaffDeductions,openFiscalYear,recordManualLedgerEntry,recordPayrollSettlement,recordSalaryPayment,recordStaffAdvance,recordStaffCommissionPayment,recordStaffDeduction} from '../../src/lib/api';
import {LEDGER_ENTRY_LABEL,periodTotals,summarizeEmployeePayroll,valueOf,type AccountingLedgerRow,type LedgerEntryType} from '../../src/lib/accounting';
import {arabicError,todayIso} from '../../src/lib/utils';
import type {FiscalYear,StaffDeduction} from '../../src/lib/types';
import {colors,font,radius,spacing,themedStyles} from '../../src/theme';
import { buildReportHtml, buildPayrollReportHtml, fetchReportBranding, shareReportPdf } from '../../src/lib/report';

type Staff={id:string;full_name:string;role:string};
type Ledger=AccountingLedgerRow & {center_id:string;category:string;description:string;occurred_on:string;created_by_name:string;source_payment_id:string|null;created_at:string};
type CommissionRule={id:string;staff_id:string;rate:number;starts_on:string;ends_on:string|null;is_active:boolean};

export default function Accounting(){
 const {profile}=useSession(); const [rows,setRows]=useState<Ledger[]>([]); const [staff,setStaff]=useState<Staff[]>([]);
 const [deductions,setDeductions]=useState<StaffDeduction[]>([]);
 const [enabled,setEnabled]=useState<boolean|null>(null); const [years,setYears]=useState<FiscalYear[]>([]); const [newYear,setNewYear]=useState('');
 const [kind,setKind]=useState<'income'|'expense'>('expense'); const [entryType,setEntryType]=useState('general'); const [employee,setEmployee]=useState<string|null>(null);
 const [category,setCategory]=useState(''); const [desc,setDesc]=useState(''); const [amount,setAmount]=useState(''); const [bonus,setBonus]=useState('0');
 const [advanceApplied,setAdvanceApplied]=useState('0'); const [selectedDeductionIds,setSelectedDeductionIds]=useState<string[]>([]); const [salaryCommission,setSalaryCommission]=useState('0');
 const [fromDate,setFromDate]=useState(''); const [toDate,setToDate]=useState('');
 const [rules,setRules]=useState<CommissionRule[]>([]);
 const [infoOpen,setInfoOpen]=useState(false); const [busy,setBusy]=useState(false); const [formError,setFormError]=useState<string|null>(null);

 // نموذج قاعدة عمولة تحصيل (نسبة مرتبطة بفترة زمنية starts_on/ends_on بدل استبدال دائم)
 const [ruleOpen,setRuleOpen]=useState(false); const [ruleStaff,setRuleStaff]=useState<string|null>(null); const [ruleRate,setRuleRate]=useState('3');
 const [ruleStarts,setRuleStarts]=useState(todayIso()); const [ruleEnds,setRuleEnds]=useState(''); const [ruleActive,setRuleActive]=useState(true); const [ruleError,setRuleError]=useState<string|null>(null);

 // نموذج صرف عمولة مستقلة (بدون ضمها لتسوية راتب)
 const [commissionPayOpen,setCommissionPayOpen]=useState(false); const [commissionPayEmployee,setCommissionPayEmployee]=useState<string|null>(null);
 const [commissionPayAmount,setCommissionPayAmount]=useState(''); const [commissionPayDesc,setCommissionPayDesc]=useState(''); const [commissionPayDate,setCommissionPayDate]=useState(todayIso()); const [commissionPayError,setCommissionPayError]=useState<string|null>(null);

 // نموذج تسجيل/تعديل خصم موظف — التزام معلّق حتى يُسوّى عند صرف راتبه
 const [deductionOpen,setDeductionOpen]=useState(false); const [deductionEditId,setDeductionEditId]=useState<string|null>(null);
 const [deductionEmployee,setDeductionEmployee]=useState<string|null>(null); const [deductionAmount,setDeductionAmount]=useState('');
 const [deductionReason,setDeductionReason]=useState(''); const [deductionNotes,setDeductionNotes]=useState(''); const [deductionDate,setDeductionDate]=useState(todayIso());
 const [deductionError,setDeductionError]=useState<string|null>(null);

 // نموذج تعديل قيد دفتر يدوي (تاريخ/تصنيف/بيان/مبلغ) — تحصيل الطالب وصرف الراتب لهما قيود خاصة يتحقق منها الخادم
 const [ledgerEditRow,setLedgerEditRow]=useState<Ledger|null>(null); const [ledgerEditDate,setLedgerEditDate]=useState('');
 const [ledgerEditCategory,setLedgerEditCategory]=useState(''); const [ledgerEditDesc,setLedgerEditDesc]=useState(''); const [ledgerEditAmount,setLedgerEditAmount]=useState('');
 const [ledgerEditError,setLedgerEditError]=useState<string|null>(null);

 const load=useCallback(async()=>{if(!profile?.center_id)return;const sb=getSupabase();
  const en=await fetchAccountingEnabled(profile.center_id); setEnabled(en); if(!en)return;
  const [{data:r},{data:s},y,d,{data:cr}]=await Promise.all([sb.from('center_ledger').select('*').eq('center_id',profile.center_id).order('occurred_on',{ascending:false}).limit(200),sb.from('profiles').select('id,full_name,role').eq('center_id',profile.center_id).in('role',['teacher','manager','secretary']),fetchFiscalYears(profile.center_id),fetchStaffDeductions(profile.center_id).catch(()=>[]),sb.from('staff_commission_rules').select('*').eq('center_id',profile.center_id).order('created_at',{ascending:false})]);setRows((r??[]) as Ledger[]);setStaff(s??[]);setYears(y??[]);setDeductions(d);setRules((cr??[]) as CommissionRule[])},[profile?.center_id]); useFocusEffect(useCallback(()=>{void load()},[load]));
 if(!isOwner(profile))return <GradientScreen><BackHeader title="الحسابات"/><NoAccess message="قسم الحسابات متاح لصاحب السنتر فقط."/></GradientScreen>;
 if(enabled===false)return <GradientScreen><BackHeader title="الحسابات" subtitle="خدمة مدفوعة"/><KeyboardScreen><SalesPitch/></KeyboardScreen></GradientScreen>;

 const openYear=async()=>{const y=parseInt(newYear,10);if(!y||y<2000||y>2100)return Alert.alert('سنة غير صحيحة','أدخل سنة بين 2000 و2100');try{await openFiscalYear(y);setNewYear('');await load();Alert.alert('تم الفتح',`سنة ${y} مفتوحة الآن برصيد أول مدة مرحّل`)}catch(e){Alert.alert('تعذر الفتح',String((e as Error).message).includes('year_exists')?'السنة موجودة بالفعل':String(e))}};
 const closeYear=async(y:number)=>{Alert.alert('إغلاق السنة المالية',`سيُغلق حساب ${y} نهائياً ويُرحَّل رصيده لسنة ${y+1} تلقائياً. هل أنت متأكد؟`,[{text:'إلغاء',style:'cancel'},{text:'إغلاق السنة',style:'destructive',onPress:async()=>{try{await closeFiscalYear(y);await load();Alert.alert('تم الإغلاق',`تم ترحيل الرصيد إلى سنة ${y+1} وفتحها تلقائياً`)}catch(e){Alert.alert('تعذر الإغلاق',String(e))}}}])};

 // الخصومات المعلّقة (لم تُسوَّ كلياً) الخاصة بالموظف المختار حالياً في نموذج صرف الراتب
 const openDeductionsFor=useMemo(()=>deductions.filter(d=>d.status!=='settled'&&(valueOf(d.amount)-valueOf(d.applied_amount))>0&&d.staff_id===employee),[deductions,employee]);
 const selectedDeductionBalance=useMemo(()=>openDeductionsFor.filter(d=>selectedDeductionIds.includes(d.id)).reduce((sum,d)=>sum+valueOf(d.amount)-valueOf(d.applied_amount),0),[openDeductionsFor,selectedDeductionIds]);
 const employeeAdvanceOutstanding=useMemo(()=>employee?summarizeEmployeePayroll(rows as AccountingLedgerRow[],employee).advancesOutstanding:0,[rows,employee]);

 const save=async()=>{
  setFormError(null);
  const n=Number(amount);
  if(!category.trim()||!n||n<=0)return setFormError('أدخل التصنيف والمبلغ الصحيح');
  if(kind==='income'&&entryType!=='general')return setFormError('إيرادات الطلاب تُسجل تلقائياً من قسم التحصيل');
  const emp=staff.find(x=>x.id===employee);
  if(['salary','advance','bonus'].includes(entryType)&&!employee)return setFormError('اختر الموظف أولاً');
  setBusy(true);
  try{
   const centerId=profile!.center_id!;
   if(entryType==='advance'){
    await recordStaffAdvance({centerId,employeeId:employee!,amount:n,description:desc.trim()});
   }else if(entryType==='salary'){
    // الراتب الأساسي يُصرف عبر RPC صرف الراتب الكامل مع اختيار سلف/خصومات محددة بمعرفها،
    // فتُسوَّى ذرّياً ضمن نفس المعاملة (بدل الخصم الإجمالي المبسّط فقط).
    const advanceApp=Math.min(Number(advanceApplied)||0,employeeAdvanceOutstanding);
    await recordSalaryPayment({
     centerId, employeeId:employee!, baseSalary:n, bonus:Math.max(0,Number(bonus)||0), commission:Math.max(0,Number(salaryCommission)||0),
     advanceApplied:advanceApp, deductionApplied:selectedDeductionBalance, deductionIds:selectedDeductionIds,
     description:desc.trim(),
    });
   }else if(entryType==='bonus'){
    // المكافأة المستقلة تُصرف عبر نفس مسار التسوية المبسّط (راتب أساسي رمزي + مكافأة).
    await recordPayrollSettlement({centerId, employeeId:employee!, baseSalary:0.01, bonus:n, description:desc.trim()});
   }else{
    // عام/إيجار/مرافق/مشتريات: إيراد أو مصروف يدوي بسيط
    await recordManualLedgerEntry({centerId,kind,category:category.trim(),description:desc.trim(),amount:n});
   }
   setCategory('');setDesc('');setAmount('');setBonus('0');setSalaryCommission('0');setAdvanceApplied('0');setSelectedDeductionIds([]);setEmployee(null);await load();
   Alert.alert('تم الحفظ',emp?`تم تسجيل الحركة على ${emp.full_name}`:'تم تسجيل الحركة');
  }catch(e){setFormError(arabicError(e));}
  finally{setBusy(false);}
 };

 const openDeductionForm=(d?:StaffDeduction)=>{
  setDeductionError(null);
  if(d){setDeductionEditId(d.id);setDeductionEmployee(d.staff_id);setDeductionAmount(String(valueOf(d.amount)));setDeductionReason(d.reason);setDeductionNotes(d.notes);setDeductionDate(d.occurred_on);}
  else{setDeductionEditId(null);setDeductionEmployee(null);setDeductionAmount('');setDeductionReason('');setDeductionNotes('');setDeductionDate(todayIso());}
  setDeductionOpen(true);
 };
 const saveDeduction=async()=>{
  setDeductionError(null);
  const n=Number(deductionAmount);
  if(!deductionEmployee||!n||n<=0||!deductionReason.trim())return setDeductionError('اختر الموظف وأدخل سبباً ومبلغاً صحيحاً أكبر من صفر');
  setBusy(true);
  try{
   if(deductionEditId){
    await amendStaffDeduction({deductionId:deductionEditId,amount:n,reason:deductionReason.trim(),notes:deductionNotes.trim(),date:deductionDate||todayIso()});
   }else{
    await recordStaffDeduction({centerId:profile!.center_id!,employeeId:deductionEmployee,amount:n,reason:deductionReason.trim(),notes:deductionNotes.trim(),date:deductionDate||todayIso()});
   }
   setDeductionOpen(false);await load();
   Alert.alert('تم الحفظ',deductionEditId?'تم تعديل الخصم':'تم تسجيل الخصم — سيظهر مقترحاً عند صرف راتب الموظف');
  }catch(e){setDeductionError(arabicError(e));}
  finally{setBusy(false);}
 };

 const openLedgerEdit=(row:Ledger)=>{
  setLedgerEditError(null);setLedgerEditRow(row);setLedgerEditDate(row.occurred_on);setLedgerEditCategory(row.category);setLedgerEditDesc(row.description);setLedgerEditAmount(String(valueOf(row.amount)));
 };
 const saveLedgerEdit=async()=>{
  if(!ledgerEditRow)return;
  setLedgerEditError(null);
  const amountLocked=ledgerEditRow.entry_type==='salary';
  const n=Number(ledgerEditAmount);
  if(!amountLocked&&(!n||n<=0))return setLedgerEditError('أدخل مبلغاً صحيحاً أكبر من صفر');
  setBusy(true);
  try{
   await amendAccountingLedgerEntry({entryId:ledgerEditRow.id,date:ledgerEditDate||todayIso(),category:ledgerEditCategory.trim(),description:ledgerEditDesc.trim(),amount:amountLocked?null:n});
   setLedgerEditRow(null);await load();
   Alert.alert('تم الحفظ','تم تعديل القيد المحاسبي');
  }catch(e){setLedgerEditError(arabicError(e));}
  finally{setBusy(false);}
 };

 const filteredRows=rows.filter(r=>(!fromDate||r.occurred_on>=fromDate)&&(!toDate||r.occurred_on<=toDate));
 const totals=periodTotals(filteredRows as AccountingLedgerRow[]);
 const income=totals.income, expense=totals.operatingCosts;
 const collectorTotals=Object.entries(filteredRows.filter(r=>r.entry_type==='payment_collection').reduce((a:any,r:any)=>{const k=(r as any).created_by_name||'غير معروف';a[k]=(a[k]||0)+Number(r.amount);return a},{}));
 const employeeTotals=Object.entries(filteredRows.filter(r=>r.kind==='expense'&&r.employee_id).reduce((a:any,r:any)=>{const k=r.employee_id;a[k]=(a[k]||0)+Number(r.amount);return a},{}));
 // قاعدة عمولة مرتبطة بفترة (starts_on/ends_on) بدل استبدال دائم — تسمح بتاريخ نسب متعدد للموظف نفسه بمرور الوقت
 const openRuleForm=(r?:CommissionRule)=>{
  setRuleError(null);
  if(r){setRuleStaff(r.staff_id);setRuleRate(String(r.rate));setRuleStarts(r.starts_on);setRuleEnds(r.ends_on||'');setRuleActive(r.is_active);}
  else{setRuleStaff(staff[0]?.id??null);setRuleRate('3');setRuleStarts(todayIso());setRuleEnds('');setRuleActive(true);}
  setRuleOpen(true);
 };
 const saveRule=async()=>{
  setRuleError(null);
  if(!ruleStaff||!profile?.center_id)return setRuleError('اختر الموظف أولاً');
  const rate=Number(ruleRate);
  if(!Number.isFinite(rate)||rate<0||rate>100)return setRuleError('أدخل نسبة عمولة صحيحة بين 0 و100');
  setBusy(true);
  try{
   const {error}=await getSupabase().from('staff_commission_rules').upsert({center_id:profile.center_id,staff_id:ruleStaff,rate,starts_on:ruleStarts||todayIso(),ends_on:ruleEnds||null,is_active:ruleActive},{onConflict:'center_id,staff_id'});
   if(error)throw error;
   setRuleOpen(false);await load();
   Alert.alert('تم الحفظ','تم حفظ قاعدة العمولة');
  }catch(e){setRuleError(arabicError(e));}
  finally{setBusy(false);}
 };
 const openCommissionPay=()=>{setCommissionPayError(null);setCommissionPayEmployee(staff[0]?.id??null);setCommissionPayAmount('');setCommissionPayDesc('');setCommissionPayDate(todayIso());setCommissionPayOpen(true);};
 const saveCommissionPayment=async()=>{
  setCommissionPayError(null);
  if(!commissionPayEmployee||!profile?.center_id)return setCommissionPayError('اختر الموظف أولاً');
  const n=Number(commissionPayAmount);
  if(!n||n<=0)return setCommissionPayError('أدخل مبلغ عمولة صحيح أكبر من صفر');
  setBusy(true);
  try{
   await recordStaffCommissionPayment({centerId:profile.center_id,employeeId:commissionPayEmployee,amount:n,date:commissionPayDate||todayIso(),description:commissionPayDesc.trim()});
   setCommissionPayOpen(false);await load();
   Alert.alert('تم الصرف','تم تسجيل صرف العمولة المستقلة');
  }catch(e){setCommissionPayError(arabicError(e));}
  finally{setBusy(false);}
 };
 const payroll=staff.map(emp=>{const s=summarizeEmployeePayroll(filteredRows as AccountingLedgerRow[],emp.id);return {...emp,salary:s.baseSalary,advance:s.advancesIssued,advanceOutstanding:s.advancesOutstanding,bonus:s.bonuses,commission:s.commissions,deduction:s.deductions,net:s.netPayroll};}).filter(x=>x.salary||x.advance||x.bonus||x.deduction||x.commission);
 const openDeductionsAll=deductions.filter(d=>d.status!=='settled');

 return <GradientScreen><BackHeader title="الحسابات" subtitle="دفتر مالي احترافي للسنتر"/><KeyboardScreen>
  <View style={{alignItems:'flex-start',marginBottom:spacing.md}}><AppButton title="معلومات حول القسم" icon="information-circle" variant="ghost" small onPress={()=>setInfoOpen(true)}/></View>
  <InfoSheet open={infoOpen} onClose={()=>setInfoOpen(false)}/>
  <Card><View style={styles.summary}><Stat t="الإيرادات" v={income}/><Stat t="المصروفات" v={expense}/><Stat t="الصافي" v={income-expense}/></View></Card>

  <SectionTitle title="السنوات المالية"/>
  <Card>
   {years.length===0?<Text style={styles.hint}>لا توجد سنوات مالية بعد — افتح سنة لتبدأ التتبع السنوي.</Text>:
    years.map((fy)=>(
     <View key={fy.id} style={styles.yearRow}>
       <View style={{flex:1}}>
         <Text style={styles.yearTitle}>{fy.fiscal_year} — {fy.status==='open'?'مفتوحة':'مغلقة'}</Text>
         <Text style={styles.meta}>أول المدة: {Number(fy.opening_balance).toFixed(2)} ج{fy.status==='closed'&&fy.closing_balance!=null?` · الإغلاق: ${Number(fy.closing_balance).toFixed(2)} ج`:''}</Text>
       </View>
       {fy.status==='open'?<AppButton title="إغلاق السنة وترحيل الرصيد" icon="lock-closed" small variant="danger" onPress={()=>closeYear(fy.fiscal_year)}/>:null}
     </View>))}
   <View style={styles.filters}><AppInput label="سنة جديدة (مثال 2026)" value={newYear} onChangeText={setNewYear} keyboardType="number-pad"/><AppButton title="فتح سنة" icon="add-circle-outline" onPress={openYear}/></View>
   <Text style={styles.hint}>عند إغلاق سنة يُرحَّل الصافي تلقائياً كرصيد أول مدة للسنة التالية وتُفتح تلقائياً.</Text>
  </Card>

  <SectionTitle title="تقرير مالي حسب الفترة"/>
  <Card>
   <View style={styles.filters}><AppInput label="من تاريخ YYYY-MM-DD" value={fromDate} onChangeText={setFromDate}/><AppInput label="إلى تاريخ YYYY-MM-DD" value={toDate} onChangeText={setToDate}/></View>
   <AppButton title="تصدير تقرير PDF" icon="document-text" variant="outline" onPress={async()=>{const branding=await fetchReportBranding(profile?.center_id);const html=buildReportHtml('التقرير المالي',`${fromDate||'البداية'} — ${toDate||'اليوم'}`,[{title:'الملخص',headers:['البند','القيمة'],rows:[['الإيرادات',`${income.toFixed(2)} جنيه`],['المصروفات',`${expense.toFixed(2)} جنيه`],['الصافي',`${(income-expense).toFixed(2)} جنيه`]]},{title:'الحركات',headers:['التاريخ','النوع','التصنيف','المبلغ','المنفذ'],rows:filteredRows.map(r=>[r.occurred_on,r.kind==='income'?'إيراد':'مصروف',r.category,`${Number(r.amount).toFixed(2)} جنيه`,r.created_by_name||'—'])}],{name:profile?.full_name||'—',branding});try{await shareReportPdf(html,'التقرير المالي')}catch(e){Alert.alert('تعذر إنشاء التقرير',String(e))}}}/>
  </Card>

  <SectionTitle title="إضافة مصروف / إيراد يدوي / راتب / سلفة"/>
  <Card>
   <Text style={styles.hint}>إيرادات الطلاب لا تُضاف يدوياً؛ تنتقل آلياً من التحصيل. استخدم «إيراد يدوي» لإيراد آخر غير مرتبط بطالب.</Text>
   <OptionPicker label="نوع الحركة" value={kind==='income'?'general_income':entryType} options={[['general_expense','مصروف عام'],['general_income','إيراد يدوي آخر'],['salary','راتب موظف'],['advance','سلفة موظف'],['bonus','مكافأة'],['rent','إيجار'],['utility','مرافق'],['purchase','مشتريات']].map(([value,label])=>({value,label}))} onChange={(v)=>{setSelectedDeductionIds([]);setAdvanceApplied('0');setBonus('0');setSalaryCommission('0');if(v==='general_income'){setKind('income');setEntryType('general');}else{setKind('expense');setEntryType(v==='general_expense'?'general':v);}}}/>
   {['salary','advance','bonus'].includes(entryType)?<OptionPicker label="الموظف" value={employee} options={staff.map(s=>({value:s.id,label:`${s.full_name} — ${s.role==='teacher'?'مدرس':s.role==='secretary'?'سكرتير':'مدير'}`}))} onChange={(v)=>{setEmployee(v);setSelectedDeductionIds([]);setAdvanceApplied('0');}} placeholder="اختر الموظف"/>:null}
   <AppInput label="التصنيف" value={category} onChangeText={setCategory} placeholder="مثال: راتب سبتمبر"/>
   <AppInput label={entryType==='salary'?'الراتب الأساسي':'المبلغ'} value={amount} onChangeText={setAmount} keyboardType="decimal-pad"/>
   {entryType==='salary'?<AppInput label="مكافأة (اختياري)" value={bonus} onChangeText={setBonus} keyboardType="decimal-pad"/>:null}
   {entryType==='salary'?<AppInput label="عمولة ضمن الراتب (اختياري)" value={salaryCommission} onChangeText={setSalaryCommission} keyboardType="decimal-pad"/>:null}
   {entryType==='salary'&&employee?<>
    <Text style={[styles.hint,{marginTop:spacing.sm}]}>رصيد السلف القائم لهذا الموظف: {employeeAdvanceOutstanding.toFixed(2)} جنيه</Text>
    {employeeAdvanceOutstanding>0?<AppInput label="سلفة تُخصم من هذا الراتب (اختياري)" value={advanceApplied} onChangeText={setAdvanceApplied} keyboardType="decimal-pad"/>:null}
    <Text style={[styles.hint,{marginTop:spacing.sm}]}>الخصومات المعلّقة على هذا الموظف — اختر ما تريد اعتماده الآن (اختياري):</Text>
    {openDeductionsFor.length===0?<Text style={styles.hint}>لا توجد خصومات معلّقة لهذا الموظف.</Text>:openDeductionsFor.map(d=>{
     const active=selectedDeductionIds.includes(d.id); const remaining=valueOf(d.amount)-valueOf(d.applied_amount);
     return <Pressable key={d.id} style={[styles.deductionRow,active&&styles.deductionRowActive]} onPress={()=>setSelectedDeductionIds(ids=>active?ids.filter(x=>x!==d.id):[...ids,d.id])}>
      <Ionicons name={active?'checkbox':'square-outline'} size={20} color={active?colors.success:colors.textMuted}/>
      <View style={{flex:1}}><Text style={styles.title}>{d.reason}</Text><Text style={styles.meta}>رصيد متبقٍ من {d.occurred_on}{d.notes?` — ${d.notes}`:''}</Text></View>
      <Text style={styles.money}>{remaining.toFixed(2)} ج</Text>
     </Pressable>;
    })}
    {selectedDeductionIds.length>0?<Text style={[styles.hint,{marginTop:spacing.xs}]}>إجمالي الخصومات المعتمدة الآن: {selectedDeductionBalance.toFixed(2)} جنيه</Text>:null}
   </>:null}
   <AppInput label="الوصف" value={desc} onChangeText={setDesc}/>
   <FormMessage type="error" text={formError}/>
   <AppButton title={kind==='income'?'حفظ الإيراد':'حفظ الحركة'} icon="checkmark" variant="danger" onPress={save} loading={busy}/>
  </Card>

  <SectionTitle title="خصومات الموظفين" action={<AppButton title="+ خصم جديد" icon="remove-circle" small variant="outline" onPress={()=>openDeductionForm()}/>}/>
  {openDeductionsAll.length===0?<Card><Text style={styles.hint}>لا توجد خصومات معلّقة حالياً.</Text></Card>:openDeductionsAll.map(d=>{
   const name=staff.find(s=>s.id===d.staff_id)?.full_name||'موظف'; const remaining=valueOf(d.amount)-valueOf(d.applied_amount);
   return <Card key={d.id} style={styles.row}>
    <Text style={styles.title}>{name} · {d.reason}</Text>
    <Text style={styles.meta}>{d.occurred_on} · إجمالي {valueOf(d.amount).toFixed(2)} ج · مُسدَّد {valueOf(d.applied_amount).toFixed(2)} ج · متبقٍ {remaining.toFixed(2)} ج · {d.status==='open'?'مفتوح':d.status==='partial'?'مسدَّد جزئياً':'مسدَّد بالكامل'}</Text>
    {d.status!=='settled'?<AppButton title="تعديل" icon="create" small variant="ghost" onPress={()=>openDeductionForm(d)}/>:null}
   </Card>;
  })}

  <SectionTitle title="تحصيل كل موظف"/>{collectorTotals.map(([name,total])=><Card key={name} style={styles.row}><Text style={styles.title}>{name}</Text><Text style={styles.money}>{Number(total).toFixed(2)} جنيه محصل</Text></Card>)}

  <SectionTitle title="قواعد عمولة التحصيل" action={<AppButton title="+ قاعدة جديدة" icon="add-circle" small variant="outline" onPress={()=>openRuleForm()}/>}/>
  {rules.length===0?<Card><Text style={styles.hint}>لا توجد قاعدة عمولة بعد — أضف نسبة لكل محصل لحساب مستحقه تلقائياً.</Text></Card>:rules.map(r=>{
   const name=staff.find(s=>s.id===r.staff_id)?.full_name||'موظف';
   return <Card key={r.id} style={styles.row}>
    <Text style={styles.title}>{name} · {r.rate}%</Text>
    <Text style={styles.meta}>سارية من {r.starts_on} إلى {r.ends_on||'بلا نهاية'} · {r.is_active?'فعالة':'موقوفة'}</Text>
    <AppButton title="تعديل" icon="create" small variant="ghost" onPress={()=>openRuleForm(r)}/>
   </Card>;
  })}
  <Card>
   <Text style={styles.hint}>يمكن صرف العمولة ضمن راتب الموظف (حقل «عمولة ضمن الراتب» عند اختيار «راتب موظف» أعلاه) أو مستقلة عن الراتب بالكامل من هنا.</Text>
   <AppButton title="صرف عمولة مستقلة" icon="cash" variant="outline" onPress={openCommissionPay}/>
  </Card>

  <SectionTitle title="كشف الرواتب والسلفيات والخصومات"/>
  {payroll.map(p=><Card key={p.id} style={styles.row}>
   <Text style={styles.title}>{p.full_name}</Text>
   <Text style={styles.meta}>راتب: {p.salary.toFixed(2)} · سلف صادرة: {p.advance.toFixed(2)} · مكافآت: {p.bonus.toFixed(2)} · عمولات: {p.commission.toFixed(2)}</Text>
   <Text style={styles.meta}>خصومات: {p.deduction.toFixed(2)} · سلف قائمة (لم تُسوَّ): {p.advanceOutstanding.toFixed(2)} · صافي المستحق: {p.net.toFixed(2)} جنيه</Text>
   <AppButton title="كشف راتب PDF" icon="document-text" small variant="outline" onPress={async()=>{const branding=await fetchReportBranding(profile?.center_id);const html=buildPayrollReportHtml({name:p.full_name,role:p.role},`${fromDate||'البداية'} — ${toDate||'اليوم'}`,{base:p.salary,bonus:p.bonus,advances:p.advance,deductions:p.deduction,net:p.net},{name:profile?.full_name||'—',branding});try{await shareReportPdf(html,`كشف راتب ${p.full_name}`)}catch(e){Alert.alert('تعذر التصدير',String(e))}}}/>
  </Card>)}
  {employeeTotals.map(([id,total])=><Card key={id} style={styles.row}><Text style={styles.title}>{staff.find(s=>s.id===id)?.full_name||'موظف'}</Text><Text style={styles.money}>{Number(total).toFixed(2)} جنيه خلال السجل الحالي</Text></Card>)}

  <SectionTitle title="آخر الحركات"/>
  <ScrollView>{filteredRows.map(r=><Card key={r.id} style={styles.row}>
   <Text style={styles.title}>{r.category} · {r.kind==='income'?'إيراد':'مصروف'}</Text>
   <Text style={styles.meta}>{r.description||'بدون وصف'} · {r.occurred_on}</Text>
   <Text style={[styles.money,{color:r.kind==='income'?colors.success:colors.danger}]}>{Number(r.amount).toFixed(2)} جنيه</Text>
   <Text style={styles.by}>سجلها: {r.created_by_name||'—'}</Text>
   {r.entry_type!=='payment_collection'&&!r.source_payment_id?<AppButton title="تعديل القيد" icon="create" small variant="ghost" onPress={()=>openLedgerEdit(r)}/>:null}
  </Card>)}</ScrollView>

  <DeductionSheet
   open={deductionOpen} editing={!!deductionEditId} staff={staff}
   employee={deductionEmployee} onEmployee={setDeductionEmployee} amount={deductionAmount} onAmount={setDeductionAmount}
   reason={deductionReason} onReason={setDeductionReason} notes={deductionNotes} onNotes={setDeductionNotes}
   date={deductionDate} onDate={setDeductionDate} error={deductionError} busy={busy}
   onClose={()=>setDeductionOpen(false)} onSave={saveDeduction}
  />

  <LedgerEditSheet
   row={ledgerEditRow} date={ledgerEditDate} onDate={setLedgerEditDate} category={ledgerEditCategory} onCategory={setLedgerEditCategory}
   description={ledgerEditDesc} onDescription={setLedgerEditDesc} amount={ledgerEditAmount} onAmount={setLedgerEditAmount}
   error={ledgerEditError} busy={busy} onClose={()=>setLedgerEditRow(null)} onSave={saveLedgerEdit}
  />

  <RuleSheet
   open={ruleOpen} staff={staff} employee={ruleStaff} onEmployee={setRuleStaff} rate={ruleRate} onRate={setRuleRate}
   starts={ruleStarts} onStarts={setRuleStarts} ends={ruleEnds} onEnds={setRuleEnds} active={ruleActive} onActive={setRuleActive}
   error={ruleError} busy={busy} onClose={()=>setRuleOpen(false)} onSave={saveRule}
  />

  <CommissionPaySheet
   open={commissionPayOpen} staff={staff} employee={commissionPayEmployee} onEmployee={setCommissionPayEmployee}
   amount={commissionPayAmount} onAmount={setCommissionPayAmount} date={commissionPayDate} onDate={setCommissionPayDate}
   description={commissionPayDesc} onDescription={setCommissionPayDesc} error={commissionPayError} busy={busy}
   onClose={()=>setCommissionPayOpen(false)} onSave={saveCommissionPayment}
  />
 </KeyboardScreen></GradientScreen>;
}

function Stat({t,v}:{t:string;v:number}){return <View><Text style={styles.meta}>{t}</Text><Text style={styles.stat}>{v.toFixed(0)} ج</Text></View>}

/** نافذة تسجيل/تعديل خصم موظف */
function DeductionSheet({open,editing,staff,employee,onEmployee,amount,onAmount,reason,onReason,notes,onNotes,date,onDate,error,busy,onClose,onSave}:{
 open:boolean;editing:boolean;staff:Staff[];employee:string|null;onEmployee:(v:string)=>void;amount:string;onAmount:(v:string)=>void;
 reason:string;onReason:(v:string)=>void;notes:string;onNotes:(v:string)=>void;date:string;onDate:(v:string)=>void;
 error:string|null;busy:boolean;onClose:()=>void;onSave:()=>void;
}){
 return <Modal visible={open} transparent animationType="slide" onRequestClose={onClose}>
  <View style={styles.modalBackdrop}>
   <View style={styles.modalSheet}>
    <Text style={styles.modalTitle}>{editing?'تعديل خصم على موظف':'تسجيل خصم على موظف'}</Text>
    <ScrollView showsVerticalScrollIndicator={false}>
     <Text style={styles.hint}>الخصم يظل معلقاً في حساب الموظف ويظهر تلقائياً عند صرف راتبه — لا ينشئ مصروفاً أو حركة نقدية مستقلة.</Text>
     <OptionPicker label="الموظف" value={employee} options={staff.map(s=>({value:s.id,label:s.full_name}))} onChange={onEmployee} placeholder="اختر الموظف"/>
     <AppInput label="مبلغ الخصم" value={amount} onChangeText={onAmount} keyboardType="decimal-pad"/>
     <AppInput label="سبب الخصم" value={reason} onChangeText={onReason}/>
     <AppInput label="تاريخ التسجيل YYYY-MM-DD" value={date} onChangeText={onDate}/>
     <AppInput label="تفاصيل أو مرجع (اختياري)" value={notes} onChangeText={onNotes} multiline/>
     <FormMessage type="error" text={error}/>
     <AppButton title={editing?'حفظ التعديل':'تسجيل الخصم'} icon="checkmark" onPress={onSave} loading={busy}/>
     <View style={{height:spacing.sm}}/>
     <AppButton title="إلغاء" icon="close" variant="ghost" onPress={onClose}/>
     <View style={{height:spacing.xl}}/>
    </ScrollView>
   </View>
  </View>
 </Modal>;
}

/** نافذة تعديل قيد دفتر يدوي — المبلغ مقفل لقيود الراتب لارتباطها بسلف وخصومات مسوّاة */
function LedgerEditSheet({row,date,onDate,category,onCategory,description,onDescription,amount,onAmount,error,busy,onClose,onSave}:{
 row:{entry_type:LedgerEntryType}|null;date:string;onDate:(v:string)=>void;category:string;onCategory:(v:string)=>void;
 description:string;onDescription:(v:string)=>void;amount:string;onAmount:(v:string)=>void;error:string|null;busy:boolean;onClose:()=>void;onSave:()=>void;
}){
 if(!row)return null;
 const amountLocked=row.entry_type==='salary';
 return <Modal visible={!!row} transparent animationType="slide" onRequestClose={onClose}>
  <View style={styles.modalBackdrop}>
   <View style={styles.modalSheet}>
    <Text style={styles.modalTitle}>تعديل قيد محاسبي</Text>
    <ScrollView showsVerticalScrollIndicator={false}>
     <Text style={styles.hint}>{amountLocked?'يمكن تعديل التاريخ والبيان فقط؛ تعديل مبلغ صرف راتب يحتاج عكساً موثقاً لأن السلف والخصومات مرتبطة به.':'عدّل بيانات القيد ثم احفظ التغيير.'}</Text>
     <AppInput label="التاريخ YYYY-MM-DD" value={date} onChangeText={onDate}/>
     <AppInput label="المبلغ" value={amount} onChangeText={onAmount} keyboardType="decimal-pad" editable={!amountLocked} style={amountLocked?{opacity:0.5}:undefined}/>
     {row.entry_type==='general'?<AppInput label="التصنيف" value={category} onChangeText={onCategory}/>:<View style={styles.lockedType}><Text style={styles.meta}>نوع القيد: {LEDGER_ENTRY_LABEL[row.entry_type]}</Text></View>}
     <AppInput label="البيان أو المرجع" value={description} onChangeText={onDescription} multiline/>
     <FormMessage type="error" text={error}/>
     <AppButton title="حفظ التعديل" icon="checkmark" onPress={onSave} loading={busy}/>
     <View style={{height:spacing.sm}}/>
     <AppButton title="إلغاء" icon="close" variant="ghost" onPress={onClose}/>
     <View style={{height:spacing.xl}}/>
    </ScrollView>
   </View>
  </View>
 </Modal>;
}

/** نافذة إضافة/تعديل قاعدة عمولة تحصيل — نسبة مرتبطة بفترة (starts_on/ends_on) */
function RuleSheet({open,staff,employee,onEmployee,rate,onRate,starts,onStarts,ends,onEnds,active,onActive,error,busy,onClose,onSave}:{
 open:boolean;staff:Staff[];employee:string|null;onEmployee:(v:string)=>void;rate:string;onRate:(v:string)=>void;
 starts:string;onStarts:(v:string)=>void;ends:string;onEnds:(v:string)=>void;active:boolean;onActive:(v:boolean)=>void;
 error:string|null;busy:boolean;onClose:()=>void;onSave:()=>void;
}){
 return <Modal visible={open} transparent animationType="slide" onRequestClose={onClose}>
  <View style={styles.modalBackdrop}>
   <View style={styles.modalSheet}>
    <Text style={styles.modalTitle}>قاعدة عمولة تحصيل</Text>
    <ScrollView showsVerticalScrollIndicator={false}>
     <Text style={styles.hint}>النسبة التي يستحقها الموظف من إجمالي تحصيله خلال فترة سريان القاعدة (يمكن ترك تاريخ الانتهاء فارغاً لقاعدة مفتوحة).</Text>
     <OptionPicker label="الموظف" value={employee} options={staff.map(s=>({value:s.id,label:s.full_name}))} onChange={onEmployee} placeholder="اختر الموظف"/>
     <AppInput label="نسبة العمولة %" value={rate} onChangeText={onRate} keyboardType="decimal-pad"/>
     <AppInput label="تبدأ من YYYY-MM-DD" value={starts} onChangeText={onStarts}/>
     <AppInput label="تنتهي في (اختياري)" value={ends} onChangeText={onEnds}/>
     <Pressable style={styles.checkRow} onPress={()=>onActive(!active)}>
      <Ionicons name={active?'checkbox':'square-outline'} size={20} color={active?colors.success:colors.textMuted}/>
      <Text style={styles.title}>القاعدة فعّالة</Text>
     </Pressable>
     <FormMessage type="error" text={error}/>
     <AppButton title="حفظ القاعدة" icon="checkmark" onPress={onSave} loading={busy}/>
     <View style={{height:spacing.sm}}/>
     <AppButton title="إلغاء" icon="close" variant="ghost" onPress={onClose}/>
     <View style={{height:spacing.xl}}/>
    </ScrollView>
   </View>
  </View>
 </Modal>;
}

/** نافذة صرف عمولة مستقلة بدون ضمها لتسوية راتب */
function CommissionPaySheet({open,staff,employee,onEmployee,amount,onAmount,date,onDate,description,onDescription,error,busy,onClose,onSave}:{
 open:boolean;staff:Staff[];employee:string|null;onEmployee:(v:string)=>void;amount:string;onAmount:(v:string)=>void;
 date:string;onDate:(v:string)=>void;description:string;onDescription:(v:string)=>void;error:string|null;busy:boolean;onClose:()=>void;onSave:()=>void;
}){
 return <Modal visible={open} transparent animationType="slide" onRequestClose={onClose}>
  <View style={styles.modalBackdrop}>
   <View style={styles.modalSheet}>
    <Text style={styles.modalTitle}>صرف عمولة مستقلة</Text>
    <ScrollView showsVerticalScrollIndicator={false}>
     <Text style={styles.hint}>يُستخدم إذا أردت صرف العمولة بمعزل عن تسوية الراتب — تظهر كحركة «عمولة مصروفة» منفصلة في السجل.</Text>
     <OptionPicker label="الموظف" value={employee} options={staff.map(s=>({value:s.id,label:s.full_name}))} onChange={onEmployee} placeholder="اختر الموظف"/>
     <AppInput label="المبلغ" value={amount} onChangeText={onAmount} keyboardType="decimal-pad"/>
     <AppInput label="التاريخ YYYY-MM-DD" value={date} onChangeText={onDate}/>
     <AppInput label="بيان الصرف (اختياري)" value={description} onChangeText={onDescription} multiline/>
     <FormMessage type="error" text={error}/>
     <AppButton title="صرف العمولة" icon="cash" onPress={onSave} loading={busy}/>
     <View style={{height:spacing.sm}}/>
     <AppButton title="إلغاء" icon="close" variant="ghost" onPress={onClose}/>
     <View style={{height:spacing.xl}}/>
    </ScrollView>
   </View>
  </View>
 </Modal>;
}

/** الصفحة التسويقية لغير المشترك: ماذا سيحصل وماذا سيستفيد */
function SalesPitch(){
 return <>
  <Card>
   <Text style={styles.pitchTitle}>سنترك غير مشترك في قسم الحسابات</Text>
   <Text style={styles.pitchText}>قسم الحسابات خدمة مدفوعة تُفتح لسنترك من مطور التطبيق. سجل تحصيلك يُحفظ تلقائياً في الخلفية منذ اليوم الأول — فعند الاشتراك تجد حساباتك جاهزة كاملة منذ بداية اشتراكك، بلا أي فقدان.</Text>
   <AppButton title="اطلب التفعيل من صفحة الباقات" icon="card" onPress={()=>router.push('/subscription')}/>
  </Card>
  <SectionTitle title="ماذا يمنحك القسم؟"/>
  {[
   {icon:'trending-up',t:'إيرادات تلقائية دقيقة',d:'كل دفعة تحصيلها من طالب تتحول تلقائياً لإيراد مسجل باسم المحصل وتاريخه — بدون إدخال يدوي وبلا أخطاء.'},
   {icon:'cash',t:'مصروفات ورواتب وسلف',d:'سجل مصروفات السنتر العامة (إيجار، مرافق، مشتريات) ورواتب الموظفين وسلفهم ومكافآتهم وخصوماتهم.'},
   {icon:'people',t:'تحصيل كل محصل',d:'إجمالي ما حصّله كل مدرس/سكرتير خلال أي فترة — للمطابقة وتوزيع العمولات.'},
   {icon:'percent',t:'عمولات التحصيل',d:'حدد نسبة عمولة لكل موظف ويُحسب مستحق منها تلقائياً على تحصيله.'},
   {icon:'briefcase',t:'عهدة يومية للمحصلين',d:'المحصل يسلّم عهدته يومياً وتُطابق مع تحصيله فعلياً (عجز/زيادة/مطابقة) وانت تعتمدها.'},
   {icon:'calendar',t:'سنوات مالية بترحيل',d:'افتح سنة مالية، وعند إغلاقها يُرحَّل صافيها تلقائياً كرصيد أول مدة للسنة التالية.'},
   {icon:'document-text',t:'تقارير PDF احترافية',d:'تقرير مالي لأي فترة تختارها + كشف راتب لكل موظف (أساسي/مكافآت/سلف/خصومات/صافي) قابل للمشاركة والطباعة.'},
  ].map((f)=>(
   <Card key={f.t} style={styles.row}>
    <View style={styles.pitchRow}>
     <View style={styles.pitchIcon}><Ionicons name={f.icon as keyof typeof Ionicons.glyphMap} size={20} color={colors.primary}/></View>
     <View style={{flex:1}}>
      <Text style={styles.title}>{f.t}</Text>
      <Text style={styles.pitchText}>{f.d}</Text>
     </View>
    </View>
   </Card>))}
  <SectionTitle title="كيف تعرض لك بياناتك؟"/>
  <Card><Text style={styles.pitchText}>ملخص أعلى الشاشة (إيرادات/مصروفات/صافي) + تقرير لأي فترة من/إلى + آخر الحركات بتفاصيل من نفذها + تجميع تحصيل كل موظف + كشف رواتب جاهز. كل ذلك معزولاً على سنترك، ولا يراه أحد سواك أنت والمطور.</Text></Card>
  <SectionTitle title="جاهز للاشتراك؟"/>
  <Card>
   <Text style={styles.pitchText}>اطلب التفعيل من صفحة «الباقات والترقية» أو تواصل مع مطور التطبيق مباشرة — التفعيل فوري وبياناتك القديمة جاهزة لحظة الفتح.</Text>
   <AppButton title="الذهاب لصفحة الباقات" icon="card" onPress={()=>router.push('/subscription')}/>
  </Card>
 </>;
}

/** شرح تفصيلي للاستخدام — زر صغير للمشترك */
function InfoSheet({open,onClose}:{open:boolean;onClose:()=>void}){
 return (
  <Modal visible={open} transparent animationType="slide" onRequestClose={onClose}>
   <View style={styles.modalBackdrop}>
    <View style={styles.modalSheet}>
     <Text style={styles.modalTitle}>كيف تستخدم قسم الحسابات؟</Text>
     <ScrollView showsVerticalScrollIndicator={false}>
      {[
       'الملخص أعلى الشاشة يعرض الإيرادات والمصروفات والصافي لحظياً.',
       '«تقرير مالي حسب الفترة»: أدخل من/إلى تاريخ بصيغة YYYY-MM-DD ثم صدّر PDF للمشاركة أو الطباعة.',
       '«السنوات المالية»: افتح سنة جديدة بضغط «فتح سنة»؛ وعند نهاية السنة اضغط «إغلاق السنة وترحيل الرصيد» فيُحسب صافيها وتُفتح السنة التالية برصيد أول مدة مرحّل تلقائياً.',
       '«إضافة مصروف/راتب/سلفة»: اختر نوع الحركة، ولو كانت على موظف اختر اسمه. عند اختيار «راتب موظف» يمكنك اعتماد سلفة قائمة و/أو خصومات معلّقة محددة فتُسوَّى ذرّياً مع الراتب.',
       'إيرادات الطلاب لا تُدخل يدوياً أبداً — تنتقل آلياً من تسجيل الدفعات في قسم المدفوعات/المسح.',
       '«خصومات الموظفين»: سجّل خصماً معلّقاً على موظف في أي وقت (بسبب وتاريخ)، ويظهر مقترحاً عند صرف راتبه لاحقاً؛ يمكن تعديل مبلغه/سببه/تاريخه ما لم يُسدَّد بالكامل.',
       '«تحصيل كل موظف» و«قواعد عمولة التحصيل»: أضف نسبة لكل موظف بفترة سريان محددة (من/إلى)، ويمكن أن يتغير لنفس الموظف عدة مرات بمرور الوقت دون فقد القاعدة القديمة. اصرف العمولة إما ضمن راتبه أو مستقلة عنه من زر «صرف عمولة مستقلة».',
       '«عهدة التحصيل» (من قائمة المزيد): المحصل يسلم عهدته يومياً ويُطابقها القسم بالتحصيل الفعلي، وانت تعتمدها من سجل العهد.',
       '«كشف الرواتب»: زر PDF لكل موظف يصدر كشفاً بالأساسي والمكافآت والسلف والخصومات والصافي.',
       '«تعديل القيد»: زر على كل حركة يدوية في «آخر الحركات» لتصحيح تاريخها/تصنيفها/بيانها/مبلغها — تحصيل الطالب وصرف الراتب لهما قيود خاصة يتحقق منها الخادم لحماية تكامل السجلات المرتبطة.',
      ].map((line,i)=>(
       <Text key={i} style={styles.infoLine}>• {line}</Text>
      ))}
      <View style={{height:spacing.md}}/>
      <AppButton title="فهمت" icon="checkmark" onPress={onClose}/>
      <View style={{height:spacing.xl}}/>
     </ScrollView>
    </View>
   </View>
  </Modal>
 );
}
const styles=themedStyles(()=>StyleSheet.create({filters:{gap:spacing.sm,flexDirection:'row',alignItems:'flex-end'},summary:{flexDirection:'row',justifyContent:'space-between'},stat:{color:colors.text,fontSize:font.lg,fontWeight:'900'},meta:{color:colors.textSecondary,fontSize:font.xs},hint:{color:colors.textSecondary,fontSize:font.sm,textAlign:'right',marginBottom:spacing.md},row:{marginBottom:spacing.sm},title:{color:colors.text,fontWeight:'800',textAlign:'right'},money:{fontSize:font.lg,fontWeight:'900',textAlign:'right'},by:{color:colors.textMuted,fontSize:font.xs,textAlign:'right',marginTop:4},yearRow:{flexDirection:'row',alignItems:'center',gap:spacing.sm,marginBottom:spacing.md},yearTitle:{color:colors.text,fontWeight:'900',textAlign:'right'},
deductionRow:{flexDirection:'row',alignItems:'center',gap:spacing.sm,backgroundColor:colors.surfaceAlt,borderRadius:radius.md,borderWidth:1,borderColor:colors.border,padding:spacing.sm,marginBottom:spacing.xs},
deductionRowActive:{borderColor:colors.success,backgroundColor:colors.successBg},
lockedType:{backgroundColor:colors.surfaceAlt,borderRadius:radius.md,padding:spacing.md,marginBottom:spacing.md},
checkRow:{flexDirection:'row',alignItems:'center',gap:spacing.sm,marginBottom:spacing.md},
pitchTitle:{color:colors.text,fontSize:font.lg,fontWeight:'900',textAlign:'right',marginBottom:spacing.sm},
pitchText:{color:colors.textSecondary,fontSize:font.sm,textAlign:'right',lineHeight:21,marginBottom:spacing.sm},
pitchRow:{flexDirection:'row',alignItems:'flex-start',gap:spacing.md},
pitchIcon:{width:42,height:42,borderRadius:radius.md,backgroundColor:colors.primary+'22',borderWidth:1,borderColor:colors.primary+'55',alignItems:'center',justifyContent:'center'},
infoLine:{color:colors.textSecondary,fontSize:font.sm,textAlign:'right',lineHeight:22,marginBottom:spacing.sm},
modalBackdrop:{flex:1,backgroundColor:'rgba(0,0,0,0.65)',justifyContent:'flex-end'},
modalSheet:{backgroundColor:colors.bgSoft,borderTopLeftRadius:radius.xl,borderTopRightRadius:radius.xl,padding:spacing.xl,paddingBottom:spacing.xxl*1.5,borderWidth:1,borderColor:colors.border,maxHeight:'90%'},
modalTitle:{color:colors.text,fontSize:font.lg,fontWeight:'900',textAlign:'center',marginBottom:spacing.lg}}));
