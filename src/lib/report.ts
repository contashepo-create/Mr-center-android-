// ============================================================
// التقارير: بناء HTML عربي ومشاركته كـ PDF عبر expo-print
// ============================================================

import * as Print from 'expo-print';
import * as Sharing from 'expo-sharing';

function esc(s: string): string {
  return String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

export interface ReportSection {
  title: string;
  rows: string[][];
  headers?: string[];
}

/** يبني صفحة HTML عربية بتدرج بسيط وجداول */
export function buildReportHtml(title: string, subtitle: string, sections: ReportSection[], operator?: { name?: string; printedAt?: string; center?: string }): string {
  const body = sections.map((sec) => `
    <h2>${esc(sec.title)}</h2>
    <table>
      ${sec.headers ? `<tr>${sec.headers.map((h) => `<th>${esc(h)}</th>`).join('')}</tr>` : ''}
      ${sec.rows.map((r) => `<tr>${r.map((c) => `<td>${esc(c)}</td>`).join('')}</tr>`).join('') || '<tr><td>لا توجد بيانات</td></tr>'}
    </table>`).join('');
  return `<!DOCTYPE html><html dir="rtl" lang="ar"><head><meta charset="utf-8"/>
  <style>
    body{font-family:sans-serif;direction:rtl;padding:24px;color:#111}
    h1{font-size:22px;margin:0} .sub{color:#555;font-size:13px;margin:4px 0 16px}
    .meta{font-size:11px;color:#666;border-bottom:1px solid #ddd;padding-bottom:8px} h2{font-size:16px;margin:20px 0 8px;color:#047857}
    table{width:100%;border-collapse:collapse;font-size:13px}
    th,td{border:1px solid #ccc;padding:6px 8px;text-align:right}
    th{background:#ede9fe}
  </style></head><body>
  <h1>${esc(title)}</h1><div class="sub">${esc(subtitle)}</div><div class="meta">${operator?.center ? `السنتر: ${esc(operator.center)} · ` : ''}نفذ التقرير: ${esc(operator?.name || 'غير محدد')} · وقت الطباعة: ${esc(operator?.printedAt || new Date().toLocaleString('ar-EG'))}</div>${body}</body></html>`;
}

/** يولد PDF من HTML ويفتح المشاركة — يرد مسار الملف */
export async function shareReportPdf(html: string, fileName: string): Promise<string> {
  const { uri } = await Print.printToFileAsync({ html });
  if (!(await Sharing.isAvailableAsync())) throw new Error('sharing_unavailable');
  await Sharing.shareAsync(uri, { dialogTitle: fileName, mimeType: 'application/pdf' });
  return uri;
}
