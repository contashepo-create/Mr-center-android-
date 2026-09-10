#!/usr/bin/env node
// ============================================================================
// سكريبت تحويل لمرة واحدة: يلفّ كل `const styles = StyleSheet.create({...})`
// على مستوى الوحدة بـ themedStyles(() => ...) ويضيف الاستيراد —
// فتصبح كل شاشة التطبيق تتبع الوضع الفاتح/الداكن تلقائياً.
// ============================================================================
import { readFileSync, writeFileSync } from 'node:fs';
import { readdirSync, statSync } from 'node:fs';
import { dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');

function* walk(dir) {
  for (const e of readdirSync(dir)) {
    const p = join(dir, e);
    if (statSync(p).isDirectory()) {
      if (e === 'node_modules' || e === '.git' || e === 'scripts') continue;
      yield* walk(p);
    } else if (/\.tsx?$/.test(e)) yield p;
  }
}

const files = [...walk(join(root, 'app')), ...walk(join(root, 'src'))];
let converted = 0, importsAdded = 0, alreadyDone = 0;

for (const file of files) {
  let code = readFileSync(file, 'utf8');
  const marker = 'const styles = StyleSheet.create({';
  if (!code.includes(marker)) continue;
  if (code.includes('const styles = themedStyles(() => StyleSheet.create({')) {
    alreadyDone++;
    continue;
  }

  // لفّ كل occurrence (عادة واحدة) مع موازنة الأقواس
  let out = '';
  let i = 0;
  let count = 0;
  while (true) {
    const start = code.indexOf(marker, i);
    if (start === -1) { out += code.slice(i); break; }
    // موضع فتح القوس الأول بعد create({
    const openBrace = code.indexOf('{', start + marker.length - 1);
    // موازنة الأقواس من openBrace
    let depth = 0, j = openBrace;
    for (; j < code.length; j++) {
      const ch = code[j];
      if (ch === '{') depth++;
      else if (ch === '}') { depth--; if (depth === 0) break; }
    }
    // بعد القوس المغلق تأتي `);`
    const closeParen = code.indexOf(');', j);
    if (closeParen === -1) { out += code.slice(i); break; }
    // الأمان: بين } و ); لا شيء سوى مسافات
    const between = code.slice(j + 1, closeParen);
    if (!/^\s*$/.test(between)) { out += code.slice(i); break; }
    out += code.slice(i, start)
      + 'const styles = themedStyles(() => StyleSheet.create({'
      + code.slice(start + marker.length, j + 1)
      + '));';
    i = closeParen + 2;
    count++;
  }
  code = out;
  if (count === 0) continue;
  converted++;

  // أضف themedStyles إلى استيراد الثيم
  const themeImportRe = /import\s*\{([^}]*)\}\s*from\s*'([^']*\/theme)';/;
  const m = code.match(themeImportRe);
  if (m && !m[1].includes('themedStyles')) {
    const names = m[1].split(',').map((s) => s.trim()).filter(Boolean);
    names.push('themedStyles');
    code = code.replace(themeImportRe, `import { ${names.join(', ')} } from '${m[2]}';`);
    importsAdded++;
  } else if (!m) {
    // لا يوجد استيراد للثيم — أضف واحداً بمسار نسبي صحيح
    const rel = relative(dirname(file), join(root, 'src/theme')).replace(/\\/g, '/');
    const importLine = `import { themedStyles } from '${rel.startsWith('.') ? rel : './' + rel}';\n`;
    // بعد أول استيراد
    const firstImport = code.search(/^import /m);
    const lineEnd = code.indexOf('\n', firstImport);
    code = code.slice(0, lineEnd + 1) + importLine + code.slice(lineEnd + 1);
    importsAdded++;
  }
  writeFileSync(file, code);
}

console.log(`تم تحويل ${converted} ملف — استيرادات مضافة/معدلة: ${importsAdded} — كان محولاً مسبقاً: ${alreadyDone}`);
