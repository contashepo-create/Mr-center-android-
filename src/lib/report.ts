// ============================================================
// التقارير: بناء HTML عربي ومشاركته كـ PDF عبر expo-print
// يطبّق هوية طباعة السنتر (شعار/علامة مائية/تذييل) على كل مستند،
// بنفس منطق الويب (src/lib/report.ts) بعد تكييفه لمحرك expo-print.
// ============================================================

import * as Print from 'expo-print';
import * as Sharing from 'expo-sharing';
import { fetchCenterPrintBranding } from './api';
import {
  brandForCenter, documentFooterText, watermarkDisplayText, watermarkGridColumns, watermarkRepeatCount,
  type CenterPrintBranding,
} from './printing';
import { arabicNum, CHOICE_KEYS, paperSections } from './exam-egyptian';
import { ALL_ORNAMENTS, ornamentGlyph } from './exam-ornaments';
import type { ExamOrnaments, ExamQuestion, OrnamentDensity, PaperTemplate } from './types';

export interface ReportSection {
  title: string;
  rows: string[][];
  headers?: string[];
}

type ReportOperator = { name?: string; printedAt?: string; center?: string; branding?: CenterPrintBranding };

function esc(s: unknown): string {
  return String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function reportLogoSpace(branding: CenterPrintBranding): number {
  return branding.logo_url ? Math.max(56, Math.min(132, branding.logo_size + 22)) : 0;
}

/** طبقات الهوية الثابتة تتكرر على كل صفحة PDF: شعار، علامة مائية وتذييل. */
function documentBrandingMarkup(branding: CenterPrintBranding): string {
  const watermarkCount = watermarkRepeatCount(branding);
  const watermarkMarks = Array.from({ length: watermarkCount }, () => `<div class="print-watermark-mark">${branding.watermark_image ? `<img src="${esc(branding.watermark_image)}" alt="" />` : ''}<span>${esc(watermarkDisplayText(branding))}</span></div>`).join('');
  const watermark = branding.watermark_enabled ? `
    <div class="center-print-watermark ${esc(branding.watermark_direction)} ${esc(branding.watermark_pattern)} ${esc(branding.watermark_layer)}"
      style="opacity:${branding.watermark_opacity};--watermark-font-size:${branding.watermark_font_size}px;--watermark-image-size:${branding.watermark_image_size}px;--watermark-color:${esc(branding.watermark_color)};--watermark-columns:${watermarkGridColumns(branding)}">
      <div class="print-watermark-grid">${watermarkMarks}</div>
    </div>` : '';
  const logo = branding.logo_url ? `<img class="center-print-logo ${esc(branding.logo_position)}" style="width:${branding.logo_size}px;height:${branding.logo_size}px" src="${esc(branding.logo_url)}" alt="شعار ${esc(branding.center_name)}" />` : '';
  const footer = esc(documentFooterText(branding));
  const logoSpace = reportLogoSpace(branding);
  return `${watermark}<aside class="center-print-overlay logo-${esc(branding.logo_position)}" style="--print-logo-space:${logoSpace}px" aria-hidden="true">${logo}${footer ? `<div class="center-print-footer" style="font-size:${branding.footer_font_size}px">${footer}</div>` : ''}</aside>`;
}

/** CSS مشترك لطبقات الهوية — تظهر ثابتة على كل صفحة عبر position:fixed. */
function documentBrandingCss(): string {
  return `
    .center-print-overlay{pointer-events:none;color:#173c31;font-family:"Tahoma","Arial",sans-serif}
    .center-print-watermark{position:fixed;inset:8mm;overflow:hidden;pointer-events:none}.center-print-watermark.front{z-index:3}.center-print-watermark.behind{z-index:0}
    .print-watermark-grid{display:grid;width:100%;height:100%;grid-template-columns:repeat(var(--watermark-columns,1),minmax(0,1fr));grid-auto-rows:1fr;align-items:center;justify-items:center;gap:2mm}.single .print-watermark-grid{grid-template-columns:1fr;grid-template-rows:1fr}.print-watermark-mark{display:flex;align-items:center;justify-content:center;gap:8px;max-width:100%;color:var(--watermark-color,#14513e);font-weight:900;text-align:center;line-height:1.05;white-space:nowrap}.print-watermark-mark span{display:block;max-width:100%;overflow:hidden;font-size:var(--watermark-font-size,76px);text-overflow:ellipsis}.print-watermark-mark img{width:var(--watermark-image-size,150px);max-width:38vw;max-height:26vh;object-fit:contain}.diagonal .print-watermark-mark{transform:rotate(-35deg)}.vertical .print-watermark-mark{transform:rotate(-90deg)}.staggered .print-watermark-mark:nth-child(even){transform:translateY(25%) rotate(var(--watermark-rotation,0deg))}.staggered.diagonal .print-watermark-mark:nth-child(even){--watermark-rotation:-35deg}.staggered.vertical .print-watermark-mark:nth-child(even){--watermark-rotation:-90deg}
    .center-print-logo{position:fixed;z-index:5;height:auto;max-height:24mm;object-fit:contain}.center-print-logo.top_right{top:5mm;right:11mm}.center-print-logo.top_left{top:5mm;left:11mm}.center-print-logo.top_center{top:5mm;left:50%;transform:translateX(-50%)}.center-print-logo.bottom_right{bottom:5mm;right:11mm}.center-print-logo.bottom_left{bottom:5mm;left:11mm}
    .center-print-footer{position:fixed;z-index:5;right:11mm;left:11mm;bottom:4.5mm;overflow:hidden;color:#52695e;line-height:1.2;text-align:center;white-space:nowrap;text-overflow:ellipsis}.center-print-overlay.logo-bottom_right .center-print-footer{right:calc(11mm + var(--print-logo-space,56px))}.center-print-overlay.logo-bottom_left .center-print-footer{left:calc(11mm + var(--print-logo-space,56px))}
  `;
}

/** يبني صفحة HTML عربية بتدرج بسيط وجداول، مع طبقات هوية الطباعة إن وُجدت */
export function buildReportHtml(title: string, subtitle: string, sections: ReportSection[], operator?: ReportOperator): string {
  const branding = operator?.branding ?? brandForCenter(operator?.center);
  const printedAt = operator?.printedAt || new Date().toLocaleString('ar-EG');
  const hasLogo = !!branding.logo_url;
  const logoSpace = reportLogoSpace(branding);
  const headTopPad = hasLogo && ['top_right', 'top_left'].includes(branding.logo_position) ? logoSpace : 0;
  const body = sections.map((sec) => `
    <h2>${esc(sec.title)}</h2>
    <table>
      ${sec.headers ? `<tr>${sec.headers.map((h) => `<th>${esc(h)}</th>`).join('')}</tr>` : ''}
      ${sec.rows.map((r) => `<tr>${r.map((c) => `<td>${esc(c)}</td>`).join('')}</tr>`).join('') || '<tr><td>لا توجد بيانات</td></tr>'}
    </table>`).join('');
  return `<!DOCTYPE html><html dir="rtl" lang="ar"><head><meta charset="utf-8"/>
  <style>
    body{font-family:sans-serif;direction:rtl;padding:24px;color:#111}
    h1{font-size:22px;margin:0;${branding.logo_position === 'top_right' ? `padding-left:${headTopPad}px` : branding.logo_position === 'top_left' ? `padding-right:${headTopPad}px` : ''}} .sub{color:#555;font-size:13px;margin:4px 0 16px}
    .meta{font-size:11px;color:#666;border-bottom:1px solid #ddd;padding-bottom:8px} h2{font-size:16px;margin:20px 0 8px;color:#047857}
    table{width:100%;border-collapse:collapse;font-size:13px}
    th,td{border:1px solid #ccc;padding:6px 8px;text-align:right}
    th{background:#ede9fe}
    ${documentBrandingCss()}
  </style></head><body>${documentBrandingMarkup(branding)}
  <h1>${esc(title)}</h1><div class="sub">${esc(subtitle)}</div><div class="meta">${operator?.center ? `السنتر: ${esc(operator.center)} · ` : ''}${branding.header_show_center_name && !operator?.center ? `${esc(branding.center_name)} · ` : ''}نفذ التقرير: ${esc(operator?.name || 'غير محدد')} · وقت الطباعة: ${esc(printedAt)}</div>${body}</body></html>`;
}

/** يولد PDF من HTML ويفتح المشاركة — يرد مسار الملف */
export async function shareReportPdf(html: string, fileName: string): Promise<string> {
  const { uri } = await Print.printToFileAsync({ html });
  if (!(await Sharing.isAvailableAsync())) throw new Error('sharing_unavailable');
  await Sharing.shareAsync(uri, { dialogTitle: fileName, mimeType: 'application/pdf' });
  return uri;
}

export function buildPayrollReportHtml(employee: { name: string; role?: string }, period: string, values: { base: number; bonus: number; advances: number; deductions: number; net: number }, operator?: ReportOperator): string {
  return buildReportHtml(`كشف راتب — ${employee.name}`, period, [{ title: 'تفاصيل الاستحقاق', headers: ['البند', 'القيمة'], rows: [['الراتب الأساسي', `${values.base.toFixed(2)} جنيه`], ['المكافآت والعمولات', `${values.bonus.toFixed(2)} جنيه`], ['السلف', `${values.advances.toFixed(2)} جنيه`], ['الخصومات', `${values.deductions.toFixed(2)} جنيه`], ['صافي المستحق', `${values.net.toFixed(2)} جنيه`]] }], operator);
}

export function buildCustodyReportHtml(title: string, period: string, rows: string[][], operator?: ReportOperator): string {
  return buildReportHtml(title, period, [{ title: 'تسوية العهدة', headers: ['التاريخ', 'المتوقع', 'المسلم', 'الحالة'], rows }], operator);
}

/** يجلب هوية الطباعة الحالية للسنتر قبل بناء المستند — تطابق الويب في القراءة اللحظية. */
export async function fetchReportBranding(centerId: string | null | undefined): Promise<CenterPrintBranding> {
  if (!centerId) return brandForCenter('MR Center');
  try {
    return await fetchCenterPrintBranding(centerId);
  } catch {
    return brandForCenter('MR Center');
  }
}

// ============================================================
// ورقة الاختبار المصرية (طباعة PDF) — منفذة بـ HTML/CSS لمحرك expo-print،
// مطابقة لتصميم الويب (src/components/exam/paper.tsx + globals.css)
// ============================================================

/** ألوان/حدود كل قالب — مطابقة لقوالب Center Publish في الويب. */
const PAPER_TEMPLATE_CSS: Record<PaperTemplate, string> = {
  classic: '',
  formal: `.exam-paper{border-width:2px;border-radius:0;border-color:#1e3a5f}.exam-paper-head{border-block:3px double #1e3a5f}`,
  modern: `.exam-paper{border-radius:2px;border-color:#9ab4d0;background:linear-gradient(180deg,#f7fbff,#fff 180px)}.exam-paper-head{border-bottom-color:#81a8cf}`,
  lab: `.exam-paper{border:2.5px solid #0f766e;border-radius:12px;background:#f7fffe;color:#134e4a}.exam-paper-head{color:#0f766e;border-bottom-color:#5eead4;background:linear-gradient(to left,#f0fdfa,#ecfeff)}`,
  life: `.exam-paper{border:2.5px solid #166534;border-radius:12px;background:#f7fff9;color:#14532d}.exam-paper-head{color:#166534;border-bottom-color:#86efac;background:linear-gradient(to left,#f0fdf4,#ecfdf5)}`,
  cosmos: `.exam-paper{border:2.5px solid #c5a059;border-radius:12px;background:#fafafe;color:#1e1b4b}.exam-paper-head{color:#fde68a;border-bottom-color:#c5a059;background:#1e1b4b}.exam-paper-head .exam-paper-title,.exam-paper-head .exam-paper-sub{color:inherit}`,
  explorer: `.exam-paper{border:2.5px solid #6366f1;border-radius:14px;background:#fffefb;color:#1e1b4b}.exam-paper-head{color:#1e1b4b;border-bottom-color:#a5b4fc;background:linear-gradient(to left,#eef2ff,#fef3c7,#ecfdf5)}`,
  royal: `.exam-paper{border:2.5px solid #b8860b;border-radius:16px;background:#fbf8ef;color:#132a4a}.exam-paper-head{color:#f8f4e8;border-bottom-color:#d4af37;background:linear-gradient(135deg,#132a4a,#233a5e 60%,#b8860b 130%)}.exam-paper-head .exam-paper-title,.exam-paper-head .exam-paper-sub{color:inherit}`,
  parchment: `.exam-paper{border:1.5px solid #c9a24b;border-radius:10px;background:#fdf7ea;color:#5a4326}.exam-paper-head{color:#5a4326;border-bottom-color:#dfc37f;background:linear-gradient(135deg,#fbf1dd,#f3e2c0)}`,
  wedding: `.exam-paper{border:2.5px solid #0b5d43;border-radius:18px;background:#f2faf6;color:#0b5d43}.exam-paper-head{color:#f0faf5;border-bottom-color:#d4af37;background:linear-gradient(135deg,#0b5d43,#14805f 60%,#d4af37 130%)}.exam-paper-head .exam-paper-title,.exam-paper-head .exam-paper-sub{color:inherit}`,
};

const EXAM_PAPER_BASE_CSS = `
  .exam-paper{position:relative;overflow:hidden;background:#fff;color:#111;border-radius:14px;border:1px solid #ddd}
  .exam-paper-inner{position:relative;z-index:1;padding:22px 24px}
  .exam-paper-center{text-align:center;font-size:12px;font-weight:700;color:#555;margin-bottom:4px}
  .exam-paper-head{text-align:center;border-bottom:2.5px solid #111;padding-bottom:12px;margin-bottom:12px}
  .exam-paper-title{margin:0;font-size:20px;font-weight:800}
  .exam-paper-sub{margin-top:6px;color:#333;font-size:13px}
  .exam-paper-meta{display:flex;gap:16px;flex-wrap:wrap;margin-bottom:14px;font-size:12.5px;color:#222}
  .exam-blank{display:inline-block;min-width:9rem;border-bottom:1.5px dotted #333;vertical-align:baseline}
  .exam-blank.small{min-width:5rem}
  .exam-blank.inline{min-width:6rem;margin-inline-start:4px}
  .exam-paper-body{display:flex;flex-direction:column;gap:12px}
  .exam-paper-section{border:1.5px solid #1e3a5f;border-radius:10px;overflow:hidden;background:#fff;break-inside:avoid;page-break-inside:avoid}
  .exam-paper-sec-head{display:flex;align-items:center;justify-content:space-between;gap:10px;padding:7px 12px;border-bottom:1.5px solid #1e3a5f;background:#f4f7fb}
  .exam-paper-sec-title{margin:0;font-size:14px;font-weight:800;color:#0f172a;line-height:1.6}
  .exam-paper-sec-mark{display:inline-block;min-width:30px;text-align:center;margin-inline-end:8px;padding:2px 7px;border:1px solid #1e3a5f;border-radius:6px;background:#fff;color:#1e3a5f;font-size:11px;font-weight:800}
  .exam-paper-sec-marks{flex-shrink:0;font-size:11.5px;font-weight:800;color:#1e3a5f;background:#fff;border:1px solid #1e3a5f;padding:3px 9px;border-radius:999px;white-space:nowrap}
  .exam-paper-sec-items{padding:10px 14px 12px;display:flex;flex-direction:column;gap:9px}
  .exam-paper-item{border-bottom:1px dashed #cbd5e1;padding-bottom:9px}
  .exam-paper-item:last-child{border-bottom:0;padding-bottom:0}
  .exam-paper-q-row{display:flex;gap:14px;align-items:flex-start}
  .exam-paper-q-text{flex:1;min-width:0}
  .exam-paper-q-no{font-weight:800}
  .exam-paper-q-body{margin:0;white-space:pre-wrap;font-weight:500;line-height:1.8}
  .exam-underlined-word{text-decoration:underline}
  .exam-paper-choices{display:grid;grid-template-columns:1fr 1fr;gap:4px 20px;margin-top:4px;padding-inline-start:14px}
  .exam-paper-choice{display:flex;gap:6px;align-items:baseline;font-size:12.5px}
  .exam-paper-choice-mark{color:#333}
  .exam-paper-choice-key{font-weight:700;color:#111}
  .exam-paper-tf{display:flex;align-items:center;gap:10px;margin-top:6px;padding-inline-start:14px}
  .exam-paper-tf-box{display:inline-flex;align-items:center;justify-content:center;min-width:3.4rem;height:1.7rem;padding:0 6px;border:1.5px solid #111;border-radius:4px;font-weight:700;letter-spacing:2px}
  .exam-paper-tf-hint{color:#555;font-size:11.5px}
  .exam-paper-lines{margin-top:4px}
  .exam-paper-dots{margin-top:8px;border-bottom:1.5px dotted #999;height:26px}
  .exam-paper-match{display:flex;flex-direction:column;gap:7px;margin-top:6px}
  .exam-paper-match-row{display:flex;gap:12px;align-items:center}
  .exam-paper-match-l{flex:1;font-weight:600}
  .exam-paper-match-r{flex:1;font-weight:600}
  .exam-paper-match-blank{width:54px;border-bottom:1.5px dotted #999}
  .exam-paper-footer{text-align:center;color:#666;font-size:12.5px;margin-top:16px;font-weight:700}
  .exam-paper-bottom-note{margin-top:10px;color:#64748b;font-size:9.5px;text-align:center}
  .q-image img{width:100%;max-width:170px;height:auto;border-radius:8px;border:1px solid #ddd;background:#fff;object-fit:contain;display:block}
  .exam-paper-ornament{position:absolute;line-height:1;user-select:none;pointer-events:none}
`;

function escAttr(s: unknown): string {
  return String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

interface OrnamentSlot { top?: string; left?: string; right?: string; bottom?: string; size: number }
const ORN_CORNERS: OrnamentSlot[] = [
  { top: '1.5%', right: '1.5%', size: 1 },
  { top: '1.5%', left: '1.5%', size: 1 },
  { bottom: '1.5%', right: '1.5%', size: 1 },
  { bottom: '1.5%', left: '1.5%', size: 1 },
];
const ORN_EDGES: OrnamentSlot[] = [
  { top: '1.5%', left: '50%', size: 0.9 },
  { bottom: '1.5%', left: '50%', size: 0.9 },
  { top: '50%', right: '0.5%', size: 0.85 },
  { top: '50%', left: '0.5%', size: 0.85 },
];
const ORN_INNER: OrnamentSlot[] = [
  { top: '24%', right: '1.5%', size: 0.7 },
  { top: '24%', left: '1.5%', size: 0.7 },
  { top: '76%', right: '1.5%', size: 0.7 },
  { top: '76%', left: '1.5%', size: 0.7 },
];

function ornamentSlotsFor(density: OrnamentDensity): OrnamentSlot[] {
  if (density === 'low') return ORN_CORNERS;
  if (density === 'medium') return [...ORN_CORNERS, ...ORN_EDGES];
  return [...ORN_CORNERS, ...ORN_EDGES, ...ORN_INNER];
}

/** طبقة زخارف الورقة (تلقائي حول الحواف أو أختام يدوية) — لا تغطي نص الأسئلة. */
function ornamentsHtml(ornaments: ExamOrnaments | null | undefined): string {
  if (!ornaments) return '';
  const opacity = typeof ornaments.opacity === 'number' ? Math.max(0.02, Math.min(0.6, ornaments.opacity)) : 0.18;
  if (ornaments.placement === 'manual') {
    return (ornaments.stamps ?? []).map((st) => `<span class="exam-paper-ornament" style="top:${st.y}%;left:${st.x}%;font-size:${st.size}px;opacity:${opacity};transform:translate(-50%,-50%)">${ornamentGlyph(st.kind)}</span>`).join('');
  }
  const slots = ornamentSlotsFor(ornaments.density ?? 'medium');
  const kinds = (ornaments.kinds ?? []).length > 0 ? ornaments.kinds : ALL_ORNAMENTS.slice(0, 12).map((o) => o.kind);
  const baseSize = 26;
  return slots.map((slot, i) => {
    const pos: string[] = [];
    if (slot.top) pos.push(`top:${slot.top}`);
    if (slot.bottom) pos.push(`bottom:${slot.bottom}`);
    if (slot.left) pos.push(`left:${slot.left}`);
    if (slot.right) pos.push(`right:${slot.right}`);
    const centered = slot.left === '50%' || slot.top === '50%';
    return `<span class="exam-paper-ornament" style="${pos.join(';')};font-size:${Math.round(baseSize * slot.size)}px;opacity:${opacity};${centered ? 'transform:translate(-50%,-50%)' : ''}">${ornamentGlyph(kinds[i % kinds.length])}</span>`;
  }).join('');
}

function paperQuestionImageHtml(q: ExamQuestion): string {
  if (!q.image) return '';
  const width = Math.min(600, Math.max(80, Number(q.imageSize) || 160));
  return `<div class="q-image" style="flex-shrink:0"><img src="${escAttr(q.image)}" style="width:${width}px;max-width:${width}px" /></div>`;
}

/** يعرض نص السؤال مع تسطير الكلمات المختارة في سؤال «صوّب ما تحته خط». */
function underlinedQuestionHtml(q: ExamQuestion): string {
  if (q.type !== 'correct' || !q.underlined?.count) return esc(q.q);
  const start = Math.max(0, q.underlined.start - 1);
  const end = start + Math.max(0, q.underlined.count);
  let wordIndex = 0;
  return q.q.split(/(\s+)/).map((piece) => {
    if (!piece.trim()) return esc(piece);
    const underlined = wordIndex >= start && wordIndex < end;
    wordIndex += 1;
    return underlined ? `<u class="exam-underlined-word">${esc(piece)}</u>` : esc(piece);
  }).join('');
}

function examPaperItemHtml(q: ExamQuestion, index: number): string {
  const num = arabicNum(index + 1);
  const hasSideImage = q.image && q.imagePosition !== 'above' && q.imagePosition !== 'below';
  let body = '';
  if (q.type === 'complete') {
    body = `<p class="exam-paper-q-body"><span class="exam-paper-q-no">${num} – </span>${esc(q.q) || '........................'} <i class="exam-blank inline"></i></p>`;
  } else {
    body = `<p class="exam-paper-q-body"><span class="exam-paper-q-no">${num} – </span>${underlinedQuestionHtml(q)}</p>`;
  }

  let extra = '';
  if (q.type === 'mcq' || q.type === 'multi') {
    extra = `<div class="exam-paper-choices">${(q.choices ?? []).slice(0, 4).map((c, ci) => `<div class="exam-paper-choice"><span class="exam-paper-choice-mark">${q.type === 'mcq' ? '◯' : '□'}</span><span class="exam-paper-choice-key">${CHOICE_KEYS[ci] ?? ci + 1})</span><span>${esc(c) || '—'}</span></div>`).join('')}</div>`;
  } else if (q.type === 'tf') {
    extra = `<div class="exam-paper-tf"><span class="exam-paper-tf-box">(&nbsp;&nbsp;&nbsp;&nbsp;)</span><span class="exam-paper-tf-hint">√ أو ×</span></div>`;
  } else if (q.type === 'essay' || q.type === 'short' || q.type === 'correct') {
    const lines = q.type === 'essay' ? Math.min(4, Math.max(2, Math.ceil((Number(q.marks) || 2) / 2))) : 1;
    extra = `<div class="exam-paper-lines">${Array.from({ length: lines }, () => '<div class="exam-paper-dots"></div>').join('')}</div>`;
  } else if (q.type === 'match') {
    extra = `<div class="exam-paper-match">${(q.pairs ?? []).map((p) => `<div class="exam-paper-match-row"><span class="exam-paper-match-l">${esc(p.l)}</span><span class="exam-paper-match-blank"></span><span class="exam-paper-match-r">${esc(p.r)}</span></div>`).join('')}</div>`;
  }

  const above = q.image && q.imagePosition === 'above' ? paperQuestionImageHtml(q) : '';
  const below = q.image && q.imagePosition === 'below' ? paperQuestionImageHtml(q) : '';
  const side = hasSideImage ? paperQuestionImageHtml(q) : '';
  return `<div class="exam-paper-item">${above}<div class="exam-paper-q-row">${side}<div class="exam-paper-q-text">${body}${extra}</div></div>${below}</div>`;
}

export interface ExamPaperInput {
  title: string;
  subject: string;
  duration: number | string;
  total: number;
  questions: ExamQuestion[];
  ornaments?: ExamOrnaments | null;
  paperFooter?: string | null;
  template?: PaperTemplate;
}

/** يبني ورقة الاختبار المصرية (أقسام معنونة + زخارف + هوية طباعة) لتحويلها PDF. */
export function buildExamPaperHtml(exam: ExamPaperInput, operator?: ReportOperator): string {
  const branding = operator?.branding ?? brandForCenter(operator?.center);
  const template = exam.template ?? 'classic';
  const sections = paperSections(exam.questions);
  const hasLogo = !!branding.logo_url;
  const logoSpace = Math.max(76, Math.min(156, branding.logo_size + 24));
  const ORDINALS = ['الأول', 'الثاني', 'الثالث', 'الرابع', 'الخامس', 'السادس', 'السابع', 'الثامن', 'التاسع', 'العاشر'];
  const paperCenterName = branding.header_show_center_name ? branding.center_name : (operator?.center ?? '');
  const paperFooter = documentFooterText(branding);

  const sectionsHtml = sections.map((sec, si) => `
    <section class="exam-paper-section">
      <div class="exam-paper-sec-head">
        <h3 class="exam-paper-sec-title"><span class="exam-paper-sec-mark">${esc(sec.meta.paperMark)}</span>السؤال ${esc(ORDINALS[si] ?? arabicNum(si + 1))}: ${esc(sec.header)}</h3>
        <span class="exam-paper-sec-marks">(${sec.marks} درجة)</span>
      </div>
      <div class="exam-paper-sec-items">${sec.items.map((q, qi) => examPaperItemHtml(q, qi)).join('')}</div>
    </section>`).join('');

  const headLogoPad = hasLogo && ['top_right', 'top_left'].includes(branding.logo_position)
    ? (branding.logo_position === 'top_right' ? `padding-right:${logoSpace}px` : `padding-left:${logoSpace}px`)
    : '';

  return `<!DOCTYPE html><html dir="rtl" lang="ar"><head><meta charset="utf-8"/>
  <style>
    body{font-family:"Tahoma","Arial",sans-serif;direction:rtl;padding:16px;color:#111;background:#f3f4f6}
    ${documentBrandingCss()}
    ${EXAM_PAPER_BASE_CSS}
    ${PAPER_TEMPLATE_CSS[template] ?? ''}
  </style></head><body>${documentBrandingMarkup(branding)}
  <div class="exam-paper" style="--paper-logo-space:${logoSpace}px">
    ${ornamentsHtml(exam.ornaments)}
    <div class="exam-paper-inner">
      <div class="exam-paper-head" style="${headLogoPad}">
        ${paperCenterName ? `<div class="exam-paper-center">${esc(paperCenterName)}</div>` : ''}
        <h2 class="exam-paper-title">${esc(exam.title || 'اختبار')}</h2>
        <div class="exam-paper-sub">${exam.subject ? `المادة: ${esc(exam.subject)} · ` : ''}الزمن: ${esc(exam.duration)} دقيقة · الدرجة الكلية: ${esc(exam.total)}</div>
      </div>
      <div class="exam-paper-meta">
        <span>اسم الطالب: <i class="exam-blank"></i></span>
        <span>الفصل / المجموعة: <i class="exam-blank small"></i></span>
        <span>التاريخ: ____ / ____ / ________</span>
      </div>
      <div class="exam-paper-body">${sectionsHtml}</div>
      <div class="exam-paper-footer">${esc(exam.paperFooter?.trim() || 'انتهت الأسئلة — بالتوفيق والنجاح 🌟')}</div>
      ${paperFooter ? `<div class="exam-paper-bottom-note" style="font-size:${branding.footer_font_size}px">${esc(paperFooter)}</div>` : ''}
    </div>
  </div>
  </body></html>`;
}
