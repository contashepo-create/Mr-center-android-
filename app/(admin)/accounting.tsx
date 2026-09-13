import React,{useCallback,useState} from 'react';
import {Alert,Modal,ScrollView,StyleSheet,Text,View} from 'react-native';
import {useFocusEffect,router} from 'expo-router';
import {Ionicons} from '@expo/vector-icons';
import {AppButton,AppInput,Card,NoAccess,SectionTitle} from '../../src/components/controls';
import {BackHeader,GradientScreen,KeyboardScreen} from '../../src/components/layout';
import {OptionPicker} from '../../src/components/pickers';
import {useSession} from '../../src/lib/session';
import {getSupabase} from '../../src/lib/supabase';
import {isOwner} from '../../src/lib/staff';
import {closeFiscalYear,fetchAccountingEnabled,fetchFiscalYears,openFiscalYear,recordManualLedgerEntry,recordPayrollSettlement,recordStaffAdvance} from '../../src/lib/api';
import {arabicError} from '../../src/lib/utils';
import type {FiscalYear} from '../../src/lib/types';
import {colors,font,radius,spacing,themedStyles} from '../../src/theme';
import { buildReportHtml, buildPayrollReportHtml, fetchReportBranding, shareReportPdf } from '../../src/lib/report';

type Staff={id:string;full_name:string;role:string};
export default function Accounting(){
 const {profile}=useSession(); const [rows,setRows]=useState<any[]>([]); const [staff,setStaff]=useState<Staff[]>([]);
 const [enabled,setEnabled]=useState<boolean|null>(null); const [years,setYears]=useState<FiscalYear[]>([]); const [newYear,setNewYear]=useState('');
 const [kind,setKind]=useState<'income'|'expense'>('expense'); const [entryType,setEntryType]=useState('general'); const [employee,setEmployee]=useState<string|null>(null);
 const [category,setCategory]=useState(''); const [desc,setDesc]=useState(''); const [amount,setAmount]=useState(''); const [deduction,setDeduction]=useState('0');
 const [fromDate,setFromDate]=useState(''); const [toDate,setToDate]=useState(''); const [commissionStaff,setCommissionStaff]=useState<string|null>(null); const [commissionRate,setCommissionRate]=useState('3');
 const [infoOpen,setInfoOpen]=useState(false);
 const load=useCallback(async()=>{if(!profile?.center_id)return;const sb=getSupabase();
  const en=await fetchAccountingEnabled(profile.center_id); setEnabled(en); if(!en)return;
  const [{data:r},{data:s},y]=await Promise.all([sb.from('center_ledger').select('*').eq('center_id',profile.center_id).order('occurred_on',{ascending:false}).limit(200),sb.from('profiles').select('id,full_name,role').eq('center_id',profile.center_id).in('role',['teacher','manager','secretary']),fetchFiscalYears(profile.center_id)]);setRows(r??[]);setStaff(s??[]);setYears(y??[])},[profile?.center_id]); useFocusEffect(useCallback(()=>{void load()},[load]));
 if(!isOwner(profile))return <GradientScreen><BackHeader title="الحسابات"/><NoAccess message="قسم الحسابات متاح لصاحب السنتر فقط."/></GradientScreen>;
 if(enabled===false)return <GradientScreen><BackHeader title="الحسابات" subtitle="خدمة مدفوعة"/><KeyboardScreen><SalesPitch/></KeyboardScreen></GradientScreen>;
 const openYear=async()=>{const y=parseInt(newYear,10);if(!y||y<2000||y>2100)return Alert.alert('سنة غير صحيحة','أدخل سنة بين 2000 و2100');try{await openFiscalYear(y);setNewYear('');await load();Alert.alert('تم الفتح',`سنة ${y} مفتوحة الآن برصيد أول مدة مرحّل`)}catch(e){Alert.alert('تعذر الفتح',String((e as Error).message).includes('year_exists')?'السنة موجودة بالفعل':String(e))}};
 const closeYear=async(y:number)=>{Alert.alert('إغلاق السنة المالية',`سيُغلق حساب ${y} نهائياً ويُرحَّل رصيده لسنة ${y+1} تلقائياً. هل أنت متأكد؟`,[{text:'إلغاء',style:'cancel'},{text:'إغلاق السنة',style:'destructive',onPress:async()=>{try{await closeFiscalYear(y);await load();Alert.alert('تم الإغلاق',`تم ترحيل الرصيد إلى سنة ${y+1} وفتحها تلقائياً`)}catch(e){Alert.alert('تعذر الإغلاق',String(e))}}}])};
 const save=async()=>{
  const n=Number(amount);
  if(!category.trim()||!n||n<=0)return Alert.alert('بيانات ناقصة','أدخل التصنيف والمبلغ الصحيح');
  if(kind==='income'&&entryType!=='general')return Alert.alert('تنبيه','إيرادات الطلاب تُسجل تلقائياً من قسم التحصيل');
  const emp=staff.find(x=>x.id===employee);
  if(['salary','advance','bonus'].includes(entryType)&&!employee)return Alert.alert('بيانات ناقصة','اختر الموظف أولاً');
  try{
   const centerId=profile!.center_id!;
   if(entryType==='advance'){
    await recordStaffAdvance({centerId,employeeId:employee!,amount:n,description:desc.trim()});
   }else if(entryType==='salary'||entryType==='bonus'){
    // الراتب/المكافأة يُصرفان عبر نفس RPC صرف الراتب: المكافأة راتب أساسي=0 وبقية القيم صفر عدا المكافأة.
    await recordPayrollSettlement({
     centerId, employeeId:employee!,
     baseSalary: entryType==='salary'?n:0.01,
     bonus: entryType==='bonus'?n:0,
     deduction: Math.max(0,Number(deduction)||0),
     description: desc.trim(),
    });
   }else{
    // عام/إيجار/مرافق/مشتريات: إيراد أو مصروف يدوي بسيط
    await recordManualLedgerEntry({centerId,kind,category:category.trim(),description:desc.trim(),amount:n});
   }
   setCategory('');setDesc('');setAmount('');setDeduction('0');setEmployee(null);await load();
   Alert.alert('تم الحفظ',emp?`تم تسجيل الحركة على ${emp.full_name}`:'تم تسجيل الحركة');
  }catch(e){Alert.alert('تعذر الحفظ',arabicError(e));}
 };
 const filteredRows=rows.filter(r=>(!fromDate||r.occurred_on>=fromDate)&&(!toDate||r.occurred_on<=toDate));
 const income=filteredRows.filter(r=>r.kind==='income').reduce((s,r)=>s+Number(r.amount),0), expense=filteredRows.filter(r=>r.kind==='expense').reduce((s,r)=>s+Number(r.amount),0);
 const collectorTotals=Object.entries(filteredRows.filter(r=>r.entry_type==='payment_collection').reduce((a:any,r:any)=>{const k=r.created_by_name||'غير معروف';a[k]=(a[k]||0)+Number(r.amount);return a},{}));
 const employeeTotals=Object.entries(filteredRows.filter(r=>r.kind==='expense'&&r.employee_id).reduce((a:any,r:any)=>{const k=r.employee_id;a[k]=(a[k]||0)+Number(r.amount);return a},{}));
 const saveCommission = async()=>{if(!commissionStaff||!profile?.center_id)return;const rate=Number(commissionRate);if(rate<0||rate>100)return Alert.alert('نسبة غير صحيحة','أدخل نسبة بين 0 و100');const {error}=await getSupabase().from('staff_commission_rules').upsert({center_id:profile.center_id,staff_id:commissionStaff,rate,starts_on:fromDate||new Date().toISOString().slice(0,10),is_active:true},{onConflict:'center_id,staff_id'});if(error)Alert.alert('تعذر حفظ العمولة',error.message);else Alert.alert('تم الحفظ','تم تحديث نسبة العمولة للموظف');};
 const payroll=staff.map(emp=>{const mine=filteredRows.filter(r=>r.employee_id===emp.id);const salary=mine.filter(r=>r.entry_type==='salary').reduce((a,r)=>a+Number(r.amount),0);const advance=mine.filter(r=>r.entry_type==='advance').reduce((a,r)=>a+Number(r.amount),0);const bonus=mine.filter(r=>r.entry_type==='bonus').reduce((a,r)=>a+Number(r.amount),0);const deduction=mine.reduce((a,r)=>a+Number(r.deduction||0),0);return {...emp,salary,advance,bonus,deduction,net:salary+bonus-deduction-advance};}).filter(x=>x.salary||x.advance||x.bonus||x.deduction);
 return <GradientScreen><BackHeader title="الحسابات" subtitle="دفتر مالي احترافي للسنتر"/><KeyboardScreen><View style={{alignItems:'flex-start',marginBottom:spacing.md}}><AppButton title="معلومات حول القسم" icon="information-circle" variant="ghost" small onPress={()=>setInfoOpen(true)}/></View><InfoSheet open={infoOpen} onClose={()=>setInfoOpen(false)}/><Card><View style={styles.summary}><Stat t="الإيرادات" v={income}/><Stat t="المصروفات" v={expense}/><Stat t="الصافي" v={income-expense}/></View></Card><SectionTitle title="السنوات المالية"/>
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
<SectionTitle title="تقرير مالي حسب الفترة"/><Card><View style={styles.filters}><AppInput label="من تاريخ YYYY-MM-DD" value={fromDate} onChangeText={setFromDate}/><AppInput label="إلى تاريخ YYYY-MM-DD" value={toDate} onChangeText={setToDate}/></View><AppButton title="تصدير تقرير PDF" icon="document-text" variant="outline" onPress={async()=>{const branding=await fetchReportBranding(profile?.center_id);const html=buildReportHtml('التقرير المالي',`${fromDate||'البداية'} — ${toDate||'اليوم'}`,[{title:'الملخص',headers:['البند','القيمة'],rows:[['الإيرادات',`${income.toFixed(2)} جنيه`],['المصروفات',`${expense.toFixed(2)} جنيه`],['الصافي',`${(income-expense).toFixed(2)} جنيه`]]},{title:'الحركات',headers:['التاريخ','النوع','التصنيف','المبلغ','المنفذ'],rows:filteredRows.map(r=>[r.occurred_on,r.kind==='income'?'إيراد':'مصروف',r.category,`${Number(r.amount).toFixed(2)} جنيه`,r.created_by_name||'—'])}],{name:profile?.full_name||'—',branding});try{await shareReportPdf(html,'التقرير المالي')}catch(e){Alert.alert('تعذر إنشاء التقرير',String(e))}}}/></Card><SectionTitle title="إضافة مصروف / إيراد يدوي / راتب / سلفة"/><Card><Text style={styles.hint}>إيرادات الطلاب لا تُضاف يدوياً؛ تنتقل آلياً من التحصيل. استخدم «إيراد يدوي» لإيراد آخر غير مرتبط بطالب.</Text><OptionPicker label="نوع الحركة" value={kind==='income'?'general_income':entryType} options={[['general_expense','مصروف عام'],['general_income','إيراد يدوي آخر'],['salary','راتب موظف'],['advance','سلفة موظف'],['bonus','مكافأة'],['rent','إيجار'],['utility','مرافق'],['purchase','مشتريات']].map(([value,label])=>({value,label}))} onChange={(v)=>{if(v==='general_income'){setKind('income');setEntryType('general');}else{setKind('expense');setEntryType(v==='general_expense'?'general':v);}}}/>{['salary','advance','bonus'].includes(entryType)?<OptionPicker label="الموظف" value={employee} options={staff.map(s=>({value:s.id,label:`${s.full_name} — ${s.role==='teacher'?'مدرس':s.role==='secretary'?'سكرتير':'مدير'}`}))} onChange={setEmployee} placeholder="اختر الموظف"/>:null}<AppInput label="التصنيف" value={category} onChangeText={setCategory} placeholder="مثال: راتب سبتمبر"/><AppInput label="المبلغ" value={amount} onChangeText={setAmount} keyboardType="decimal-pad"/>{entryType==='salary'?<AppInput label="خصم من الراتب (اختياري)" value={deduction} onChangeText={setDeduction} keyboardType="decimal-pad"/>:null}<AppInput label="الوصف" value={desc} onChangeText={setDesc}/><AppButton title={kind==='income'?'حفظ الإيراد':'حفظ الحركة'} icon="checkmark" variant="danger" onPress={save}/></Card><SectionTitle title="تحصيل كل موظف"/>{collectorTotals.map(([name,total])=><Card key={name} style={styles.row}><Text style={styles.title}>{name}</Text><Text style={styles.money}>{Number(total).toFixed(2)} جنيه محصل</Text></Card>)}<SectionTitle title="إعداد عمولة التحصيل"/><Card><OptionPicker label="الموظف" value={commissionStaff} options={staff.map(x=>({value:x.id,label:x.full_name}))} onChange={setCommissionStaff} placeholder="اختر الموظف"/><AppInput label="النسبة المئوية" value={commissionRate} onChangeText={setCommissionRate} keyboardType="decimal-pad"/><AppButton title="حفظ نسبة العمولة" icon="save" variant="success" onPress={saveCommission}/></Card><SectionTitle title="كشف الرواتب والسلفيات والخصومات"/>{payroll.map(p=><Card key={p.id} style={styles.row}><Text style={styles.title}>{p.full_name}</Text><Text style={styles.meta}>راتب: {p.salary.toFixed(2)} · سلف: {p.advance.toFixed(2)} · مكافآت: {p.bonus.toFixed(2)}</Text><Text style={styles.meta}>خصومات: {p.deduction.toFixed(2)} · صافي المستحق: {p.net.toFixed(2)} جنيه</Text><AppButton title="كشف راتب PDF" icon="document-text" small variant="outline" onPress={async()=>{const branding=await fetchReportBranding(profile?.center_id);const html=buildPayrollReportHtml({name:p.full_name,role:p.role},`${fromDate||'البداية'} — ${toDate||'اليوم'}`,{base:p.salary,bonus:p.bonus,advances:p.advance,deductions:p.deduction,net:p.net},{name:profile?.full_name||'—',branding});try{await shareReportPdf(html,`كشف راتب ${p.full_name}`)}catch(e){Alert.alert('تعذر التصدير',String(e))}}}/></Card>)}{employeeTotals.map(([id,total])=><Card key={id} style={styles.row}><Text style={styles.title}>{staff.find(s=>s.id===id)?.full_name||'موظف'}</Text><Text style={styles.money}>{Number(total).toFixed(2)} جنيه خلال السجل الحالي</Text></Card>)}<SectionTitle title="آخر الحركات"/><ScrollView>{filteredRows.map(r=><Card key={r.id} style={styles.row}><Text style={styles.title}>{r.category} · {r.kind==='income'?'إيراد':'مصروف'}</Text><Text style={styles.meta}>{r.description||'بدون وصف'} · {r.occurred_on}</Text><Text style={[styles.money,{color:r.kind==='income'?colors.success:colors.danger}]}>{Number(r.amount).toFixed(2)} جنيه</Text><Text style={styles.by}>سجلها: {r.created_by_name||'—'}</Text></Card>)}</ScrollView></KeyboardScreen></GradientScreen>}
function Stat({t,v}:{t:string;v:number}){return <View><Text style={styles.meta}>{t}</Text><Text style={styles.stat}>{v.toFixed(0)} ج</Text></View>}

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
       '«إضافة مصروف/راتب/سلفة»: اختر نوع الحركة، ولو كانت على موظف اختر اسمه — المكافأة والخصم تُنسب لصافي راتبه في الكشف.',
       'إيرادات الطلاب لا تُدخل يدوياً أبداً — تنتقل آلياً من تسجيل الدفعات في قسم المدفوعات/المسح.',
       '«تحصيل كل موظف» و«إعداد عمولة التحصيل»: اضبط نسبة العمولة لكل موظف ويُحسب مستحقها على تحصيله.',
       '«عهدة التحصيل» (من قائمة المزيد): المحصل يسلم عهدته يومياً ويُطابقها القسم بالتحصيل الفعلي، وانت تعتمدها من سجل العهد.',
       '«كشف الرواتب»: زر PDF لكل موظف يصدر كشفاً بالأساسي والمكافآت والسلف والخصومات والصافي.',
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
pitchTitle:{color:colors.text,fontSize:font.lg,fontWeight:'900',textAlign:'right',marginBottom:spacing.sm},
pitchText:{color:colors.textSecondary,fontSize:font.sm,textAlign:'right',lineHeight:21,marginBottom:spacing.sm},
pitchRow:{flexDirection:'row',alignItems:'flex-start',gap:spacing.md},
pitchIcon:{width:42,height:42,borderRadius:radius.md,backgroundColor:colors.primary+'22',borderWidth:1,borderColor:colors.primary+'55',alignItems:'center',justifyContent:'center'},
infoLine:{color:colors.textSecondary,fontSize:font.sm,textAlign:'right',lineHeight:22,marginBottom:spacing.sm},
modalBackdrop:{flex:1,backgroundColor:'rgba(0,0,0,0.65)',justifyContent:'flex-end'},
modalSheet:{backgroundColor:colors.bgSoft,borderTopLeftRadius:radius.xl,borderTopRightRadius:radius.xl,padding:spacing.xl,paddingBottom:spacing.xxl*1.5,borderWidth:1,borderColor:colors.border,maxHeight:'90%'},
modalTitle:{color:colors.text,fontSize:font.lg,fontWeight:'900',textAlign:'center',marginBottom:spacing.lg}}));
