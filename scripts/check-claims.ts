import fs from 'node:fs';
import path from 'node:path';
import { execSync } from 'node:child_process';

const FORBIDDEN_CLAIMS = [
  /100%\s+bug\s+free/i,
  /zero\s+leakage/i,
  /guaranteed\s+retention/i,
  /flawless\s+execution/i,
  /completely\s+unhackable/i,
  /zero\s+vulnerabilities/i,
  /guaranteed\s+conversion/i,
  /all\s+31\s+tests/i, // Stale count! Now 35 unit/integration + 8 e2e = 43 tests
];

const SCAN_EXTENSIONS = ['.md', '.ts', '.tsx', '.html', '.json'];
const IGNORED_DIRS = ['node_modules', 'dist', '.git', 'test-results', 'playwright-report'];

function checkFiles(dir: string, violations: string[] = []): string[] {
  const entries = fs.readdirSync(dir, { withFileTypes: true });

  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    const relPath = path.relative(process.cwd(), fullPath);

    if (IGNORED_DIRS.some((d) => relPath.includes(d))) continue;

    if (entry.isDirectory()) {
      checkFiles(fullPath, violations);
    } else if (entry.isFile()) {
      const ext = path.extname(entry.name);
      if (SCAN_EXTENSIONS.includes(ext) && entry.name !== 'check-claims.ts') {
        try {
          const content = fs.readFileSync(fullPath, 'utf8');
          const lines = content.split('\n');
          for (let i = 0; i < lines.length; i++) {
            const line = lines[i];
            // Skip rule statements instructing NOT to claim something
            if (/never\s+claim|do\s+not\s+claim|avoid\s+claiming|forbidden|rejected/i.test(line)) {
              continue;
            }
            for (const pattern of FORBIDDEN_CLAIMS) {
              if (pattern.test(line)) {
                violations.push(`Forbidden hyperbolic or stale claim matching ${pattern} found in ${relPath}:${i + 1}`);
              }
            }
          }
        } catch {
          // Ignore
        }
      }
    }
  }

  return violations;
}

console.info('--- Running RaidRelay Truthfulness & Claims Check ---');
const violations = checkFiles(process.cwd());

let currentSha = 'UNCOMMITTED';
try {
  currentSha = execSync('git rev-parse HEAD', { encoding: 'utf8' }).trim();
} catch {
  // Untracked
}

const auditReport = {
  timestamp: new Date().toISOString(),
  commitSha: currentSha,
  checker: 'RaidRelay Claims & Truthfulness Auditor v2.0',
  passed: violations.length === 0,
  violationsCount: violations.length,
  violations,
};

fs.writeFileSync(path.join(process.cwd(), 'docs/claims-audit.json'), JSON.stringify(auditReport, null, 2));

if (violations.length > 0) {
  console.error(`Claims check failed with ${violations.length} violations:`);
  violations.forEach((v) => console.error(`  - ${v}`));
  process.exit(1);
} else {
  console.info('✓ Claims check passed: Zero forbidden hyperbolic, ungrounded, or stale claims found.');
  process.exit(0);
}
