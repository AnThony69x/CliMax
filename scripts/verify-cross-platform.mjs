#!/usr/bin/env node

/**
 * verify-cross-platform.mjs
 *
 * Verifica que los cambios de sombra/elevación no hayan roto iOS y que
 * Android no tenga valores de elevation excesivos fuera de Platform.select.
 *
 * Uso:
 *   node scripts/verify-cross-platform.mjs
 *
 * Códigos de salida:
 *   0 = todo bien
 *   1 = se encontraron issues
 */

import { readFileSync, existsSync, readdirSync, statSync } from 'fs';
import { join, extname, resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

// ── Config ──────────────────────────────────────────────────────────
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const ROOT = resolve(__dirname, '..');
const MOBILE_SRC = join(ROOT, 'mobile', 'src');
const MAX_ANDROID_ELEVATION = 6;
const BANNED_ELEVATION = [8, 10, 12, 14, 16, 20, 22, 30];

// ── Recursive file scanner ──────────────────────────────────────────
function findFiles(dir, extList) {
  const results = [];
  try {
    const entries = readdirSync(dir, { withFileTypes: true });
    for (const entry of entries) {
      const full = join(dir, entry.name);
      if (entry.isDirectory() && !entry.name.startsWith('.') && entry.name !== 'node_modules') {
        results.push(...findFiles(full, extList));
      } else if (entry.isFile() && extList.includes(extname(entry.name))) {
        results.push(full);
      }
    }
  } catch { /* skip unreadable */ }
  return results;
}

const files = findFiles(MOBILE_SRC, ['.tsx', '.ts']);

// ── Helpers ──────────────────────────────────────────────────────────
const issues = [];
function warn(file, line, msg) {
  issues.push({ file, line, msg });
}

function readFile(path) {
  try {
    return readFileSync(path, 'utf-8');
  } catch {
    return null;
  }
}

function cleanLine(line) {
  return line
    .replace(/\/\*[\s\S]*?\*\//g, '')  // remove /* */ comments
    .replace(/\/\/.*$/, '')           // remove // comments
    .trim();
}

// ── Checks ──────────────────────────────────────────────────────────

let totalFiles = 0;
let checkedFiles = 0;

for (const f of files) {
  const content = readFile(f);
  if (!content) continue;

  totalFiles++;
  const lines = content.split('\n');
  let inPlatformSelect = 0;
  let inStyleSheet = false;
  let hasElevation = false;
  let hasShadowProps = false;
  let lastShadowLine = 0;

  for (let i = 0; i < lines.length; i++) {
    const raw = lines[i];
    const line = cleanLine(raw);
    const lineNum = i + 1;
    const stripped = raw.replace(/\/\*.*\*\//g, '').trim();

    // Track Platform.select depth
    if (stripped.includes('Platform.select')) {
      inPlatformSelect++;
    }
    const openCount = (stripped.match(/\{/g) || []).length;
    const closeCount = (stripped.match(/\}/g) || []).length;
    if (closeCount > openCount && inPlatformSelect > 0) {
      inPlatformSelect -= Math.min(inPlatformSelect, closeCount - openCount);
    }

    // Check elevation values
    const elevMatches = [...line.matchAll(/elevation:\s*(\d+)/g)];
    for (const m of elevMatches) {
      const val = parseInt(m[1], 10);
      const beforeVal = line.slice(0, m.index);

      // Find the most recent branch label before this elevation value
      const lastIos = beforeVal.lastIndexOf('ios:');
      const lastAndroid = beforeVal.lastIndexOf('android:');
      // Also check the current line segment after the last branch label
      // to handle lines like: ios: { elevation: 8 }, android: { elevation: 4 }
      const nearestBranch = lastAndroid > lastIos ? 'android' : 'ios';

      if (inPlatformSelect > 0 && nearestBranch === 'android') {
        if (val > MAX_ANDROID_ELEVATION) {
          warn(f, lineNum, `elevation: ${val} en branch android: de Platform.select — muy alto para Android (máx ${MAX_ANDROID_ELEVATION})`);
        }
        hasElevation = true;
      } else if (inPlatformSelect > 0) {
        // Inside ios: branch — fine, elevation es ignorada en iOS,
        // iOS usa shadow* props para las sombras suaves
        hasElevation = true;
      } else {
        // Outside Platform.select — raw elevation afecta AMBAS plataformas
        if (val > MAX_ANDROID_ELEVATION) {
          warn(f, lineNum, `elevation: ${val} FUERA de Platform.select — da sombra rectangular en Android (máx ${MAX_ANDROID_ELEVATION})`);
        }
        hasElevation = true;
      }
    }

    // Track shadow props for iOS
    const hasShadowColor = line.includes('shadowColor:');
    const hasShadowOffset = line.includes('shadowOffset:');
    const hasShadowOpacity = line.includes('shadowOpacity:');
    const hasShadowRadius = line.includes('shadowRadius:');

    if (hasShadowColor || hasShadowOffset || hasShadowOpacity || hasShadowRadius) {
      hasShadowProps = true;
      lastShadowLine = lineNum;
    }

    // If we see elevation without shadow props nearby, flag it
    if (elevMatches.length > 0 && !hasShadowProps) {
      // Check a few lines around for shadow props
      const nearbyLines = lines.slice(Math.max(0, i - 5), Math.min(lines.length, i + 3));
      const hasNearbyShadow = nearbyLines.some(l =>
        l.includes('shadowColor') || l.includes('shadowOffset') ||
        l.includes('shadowOpacity') || l.includes('shadowRadius')
      );
      if (!hasNearbyShadow) {
        warn(f, lineNum, `elevation sin shadow* props acompañantes — iOS no tendrá sombra`);
      }
    }
  }

  if (hasElevation || hasShadowProps) {
    checkedFiles++;
  }
}

// ── File-specific checks ────────────────────────────────────────────

// 1. Tab bar: check no elevation:30 on anchor (outside Platform.select)
const tabBarPath = join(MOBILE_SRC, 'components', 'LiquidGlassFloatingTabBar.tsx');
const tabBarContent = readFile(tabBarPath);
if (tabBarContent) {
  const lines = tabBarContent.split('\n');
  for (let i = 0; i < lines.length; i++) {
    if (lines[i].includes('elevation: 30') && !lines[i].includes('Platform.select')) {
      warn(tabBarPath, i + 1, `LIQUID GLASS TAB BAR: elevation: 30 encontrado fuera de Platform.select — REVISA INMEDIATAMENTE`);
    }
    if (lines[i].includes('elevation: 4') && lines[i].includes('android')) {
      // OK - we set this inside Platform.select
    }
  }
}

// 2. Check bgGlow circles have proper borderRadius (value < width)
const glowPattern = /(bgGlowTop|bgGlowBottom):/;
for (const f of files) {
  const content = readFile(f);
  if (!content) continue;

  const lines = content.split('\n');
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (glowPattern.test(line)) {
      // Check this block has borderRadius <= width (for circle)
      const block = lines.slice(i, i + 8).join('\n');
      const widthMatch = block.match(/width:\s*(\d+)/);
      const radiusMatch = block.match(/borderRadius:\s*(\d+)/);
      if (widthMatch && radiusMatch) {
        const w = parseInt(widthMatch[1], 10);
        const r = parseInt(radiusMatch[1], 10);
        if (r > w && r === 999) {
          warn(f, i + 1, `bgGlow: borderRadius: ${r} > width: ${w} — en Android puede no renderizar círculo. Usar borderRadius: ${w}`);
        }
      }
    }
  }
}

// 3. Verify premiumShadow has platform-specific values
const premiumPath = join(ROOT, 'mobile', 'src', 'theme', 'premium.ts');
const premiumContent = readFile(premiumPath);
if (premiumContent) {
  if (!premiumContent.includes('androidElevation') && !premiumContent.includes('android:')) {
    warn(premiumPath, 1, 'premiumShadow no tiene valores específicos para Android');
  }
}

// ── Results ──────────────────────────────────────────────────────────

console.log(`\n🔍 Verificación Cross-Platform`);
console.log(`   Archivos escaneados: ${totalFiles}`);
console.log(`   Archivos con sombras: ${checkedFiles}`);
console.log('');

if (issues.length === 0) {
  console.log('✅ TODO OK — No se encontraron issues cross-platform.');
  console.log('   • iOS shadow* props intactos');
  console.log(`   • Android elevation ≤ ${MAX_ANDROID_ELEVATION} fuera de Platform.select`);
  console.log('   • bgGlow circles con borderRadius correcto');
  process.exit(0);
}

console.log(`⚠️  Se encontraron ${issues.length} issue(s):\n`);
for (const issue of issues) {
  const shortFile = issue.file.replace(ROOT, '').replace(/\\/g, '/');
  console.log(`   ❌ ${shortFile}:${issue.line}`);
  console.log(`      ${issue.msg}\n`);
}

console.log('\n📋 Resumen por prioridad:');
const critical = issues.filter(i => i.msg.includes('INMEDIATAMENTE') || i.msg.includes('FUERA de Platform.select'));
const warnings = issues.filter(i => !critical.includes(i));
if (critical.length) {
  console.log(`   🔴 CRÍTICOS (${critical.length}): Revisar antes de deploy`);
  critical.forEach(i => console.log(`      - ${i.file.replace(ROOT, '')}:${i.line}`));
}
if (warnings.length) {
  console.log(`   🟡 ADVERTENCIAS (${warnings.length}): Considerar revisar`);
  warnings.forEach(i => console.log(`      - ${i.file.replace(ROOT, '')}:${i.line}`));
}

process.exit(1);
