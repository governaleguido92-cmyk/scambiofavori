#!/usr/bin/env node
/**
 * Controlli automatici sull'interfaccia, per non ripetere errori già visti:
 *  1. scuro su scuro: uno stile con sfondo scuro e testo scuro, oppure un'icona scura dentro un pulsante con sfondo scuro
 *     (es. i pulsanti −/+ neri con il segno nero di «Dona al Fondo»);
 *  2. «1 ore» / «1 Granelli»: un numero accanto a una parola sempre plurale;
 *  3. un colore della palette scritto a mano invece del token del tema.
 * Esce con codice 1 se trova qualcosa, così la CI si ferma.
 */
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';

const ROOT = new URL('..', import.meta.url).pathname;
const DARK_LUMINANCE = 0.3;

const walk = (dir) => readdirSync(dir).flatMap((name) => {
  const path = join(dir, name);
  if (name === 'node_modules' || name.startsWith('.')) return [];
  return statSync(path).isDirectory() ? walk(path) : [path];
});
const files = [...walk(join(ROOT, 'app')), ...walk(join(ROOT, 'src'))].filter((f) => /\.(tsx?|jsx?)$/.test(f));

const palette = {};
for (const line of readFileSync(join(ROOT, 'src/theme/colors.ts'), 'utf8').split('\n')) {
  const m = line.match(/^\s*(\w+):\s*'(#[0-9A-Fa-f]{6})'/);
  if (m) palette[m[1]] = m[2];
}
const toHex = (expr) => {
  const v = expr.trim().replace(/[,'"]/g, '');
  if (/^#[0-9A-Fa-f]{3}$/.test(v)) return `#${[...v.slice(1)].map((c) => c + c).join('')}`;
  if (/^#[0-9A-Fa-f]{6}$/.test(v)) return v;
  const m = v.match(/^colors\.(\w+)$/);
  return m ? palette[m[1]] ?? null : null;
};
const luminance = (hex) => [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255)
  .reduce((sum, c, i) => sum + c * [0.2126, 0.7152, 0.0722][i], 0);
const isDark = (hex) => hex !== null && luminance(hex) < DARK_LUMINANCE;

// Stili semplici «nome: { ... }» con il loro sfondo e il colore del testo
const styleBlocks = (text) => {
  const out = {};
  for (const m of text.matchAll(/\n\s+(\w+):\s*\{([^{}]*)\}/g)) {
    const bg = m[2].match(/backgroundColor:\s*([^,\n]+)/);
    const fg = m[2].match(/(?<![\w])color:\s*([^,\n]+)/);
    out[m[1]] = { bg: bg ? toHex(bg[1]) : null, fg: fg ? toHex(fg[1]) : null };
  }
  return out;
};
const sources = Object.fromEntries(files.map((f) => [f, readFileSync(f, 'utf8')]));
const allStyles = Object.assign({}, ...files.filter((f) => f.includes('/styles/')).map((f) => styleBlocks(sources[f])));

const problems = [];
const report = (file, index, text) => {
  const line = sources[file].slice(0, index).split('\n').length;
  problems.push(`${relative(ROOT, file)}:${line}: ${text}`);
};

for (const file of files) {
  const text = sources[file];
  const local = styleBlocks(text);

  // 1a. stesso stile con sfondo e testo scuri
  for (const m of text.matchAll(/\n\s+(\w+):\s*\{([^{}]*)\}/g)) {
    const { bg, fg } = local[m[1]] ?? {};
    if (isDark(bg) && isDark(fg)) report(file, m.index, `stile «${m[1]}»: testo scuro su sfondo scuro`);
  }

  // 1b. icona scura come unico contenuto di un pulsante con sfondo scuro fisso (stile con nome, senza sfondi dinamici)
  for (const m of text.matchAll(/<TouchableOpacity\s+style=\{(styles\.\w+)\}(?:(?!<)[\s\S])*?>\s*<Ionicons(?:(?!<)[\s\S])*?color=(?:"([^"]+)"|\{([^}]+)\})(?:(?!<)[\s\S])*?\/>\s*<\/TouchableOpacity>/g)) {
    const name = m[1].split('.')[1];
    const bg = (local[name] ?? allStyles[name] ?? {}).bg ?? null;
    const fg = toHex(m[2] ?? m[3]);
    if (isDark(bg) && isDark(fg)) report(file, m.index, `pulsante «${name}»: icona scura su sfondo scuro`);
  }

  // 1c. un colore della palette scritto a mano: va usato il token (colors.xxx), così un cambio di colore vale ovunque
  // +html.tsx è il CSS della pagina prima che parta l'app: lì il colore va scritto per forza
  if (!file.includes('/theme/') && !file.endsWith('+html.tsx')) {
    for (const m of text.matchAll(/(['"])#([0-9A-Fa-f]{6}|[0-9A-Fa-f]{3})\1/g)) {
      const hex = toHex(`#${m[2]}`)?.toUpperCase();
      const token = Object.entries(palette).find(([, value]) => value.toUpperCase() === hex)?.[0];
      if (token) report(file, m.index, `colore ${m[0]} scritto a mano: usa colors.${token}`);
    }
  }

  // 2. numero + parola sempre plurale senza la forma singolare
  for (const m of text.matchAll(/\{\s*([\w.?]+)\s*\}\s*\{\s*tt\('ore'\)\s*\}/g)) {
    report(file, m.index, `«${m[1]} ore» senza singolare: usa ${m[1]} === 1 ? tt('ora') : tt('ore')`);
  }
  for (const m of text.matchAll(/<Text[^>]*>\s*\{tt\('ore'\)\}\s*<\/Text>/g)) {
    report(file, m.index, "«ore» fisso accanto a un numero: serve anche «ora» per 1");
  }
}

if (problems.length) {
  console.error(`Controllo interfaccia: ${problems.length} problemi\n${problems.join('\n')}`);
  process.exit(1);
}
console.log(`Controllo interfaccia: nessun problema in ${files.length} file.`);
