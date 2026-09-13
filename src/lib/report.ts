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
