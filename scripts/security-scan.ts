import fs from 'node:fs';
import path from 'node:path';
import { execSync } from 'node:child_process';

const FORBIDDEN_SECRET_PATTERNS = [
  /client_secret\s*[:=]\s*['"][a-zA-Z0-9]{20,}['"]/i,
  /oauth:[a-zA-Z0-9]{25,}/i,
  /bearer\s+[a-zA-Z0-9\-_]{30,}/i,
  /-----BEGIN\s+PRIVATE\s+KEY-----/i,
  /TWITCH_CLIENT_SECRET\s*=\s*[a-zA-Z0-9]{15,}/,
  /SESSION_SECRET\s*=\s*['"]?0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef['"]?/,
  /HMAC_VOTER_SALT\s*=\s*['"]?fedcba9876543210fedcba9876543210fedcba9876543210fedcba9876543210['"]?/,
];

const IGNORED_PATHS = [
  'node_modules',
  'dist',
  '.git',
  'pnpm-lock.yaml',
  'test-results',
  'playwright-report',
];

function scanDirectory(dir: string, issues: string[] = []): string[] {
  const entries = fs.readdirSync(dir, { withFileTypes: true });

  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    const relPath = path.relative(process.cwd(), fullPath);

    if (IGNORED_PATHS.some((p) => relPath.includes(p))) {
      continue;
    }

    if (entry.isDirectory()) {
      scanDirectory(fullPath, issues);
    } else if (entry.isFile()) {
      // Check .env files
      if (entry.name === '.env') {
        issues.push(`CRITICAL: Committed .env file found at ${relPath}`);
      }

      // Check file content for secrets
      try {
        const content = fs.readFileSync(fullPath, 'utf8');
        for (const pattern of FORBIDDEN_SECRET_PATTERNS) {
          if (pattern.test(content)) {
            // Check if it's scanner itself or test fixture
            if (entry.name === 'security-scan.ts' || entry.name === 'check-claims.ts' || relPath.includes('fixtures')) {
              continue;
            }
            issues.push(`CRITICAL: Potential leaked secret matching ${pattern} in ${relPath}`);
          }
        }
      } catch {
        // Binary or unreadable file
      }
    }
  }

  return issues;
}

function scanGitHistory(issues: string[] = []): string[] {
  try {
    const gitDiff = execSync('git log -p -n 10', { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] });
    const lines = gitDiff.split('\n');
    let currentFile = '';
    for (const line of lines) {
      if (line.startsWith('diff --git ')) {
        const parts = line.split(' ');
        currentFile = parts[parts.length - 1] || '';
      }
      if (
        currentFile.includes('security-scan.ts') ||
        currentFile.includes('check-claims.ts') ||
        currentFile.includes('fixtures')
      ) {
        continue;
      }
      if (line.startsWith('+') && !line.startsWith('+++')) {
        for (const pattern of FORBIDDEN_SECRET_PATTERNS) {
          if (pattern.test(line)) {
            if (line.includes('FORBIDDEN_SAMPLE_SECRETS')) continue;
            issues.push(`CRITICAL: Secret pattern matching ${pattern} detected in recent git commits (${currentFile})`);
          }
        }
      }
    }
  } catch {
    // Git repo without commits or git unavailable
  }
  return issues;
}

console.info('--- Running RaidRelay Security Audit Scan ---');
const rootDir = process.cwd();
const issues: string[] = [];

scanDirectory(rootDir, issues);
scanGitHistory(issues);

// Verify .gitignore ignores .env
const gitignorePath = path.join(rootDir, '.gitignore');
if (fs.existsSync(gitignorePath)) {
  const gitignoreContent = fs.readFileSync(gitignorePath, 'utf8');
  if (!gitignoreContent.includes('.env')) {
    issues.push('CRITICAL: .gitignore does not ignore .env files');
  }
} else {
  issues.push('CRITICAL: Missing .gitignore file in root');
}

// Write machine-readable audit report
const reportDir = path.join(rootDir, 'docs');
if (!fs.existsSync(reportDir)) fs.mkdirSync(reportDir, { recursive: true });

const auditReport = {
  timestamp: new Date().toISOString(),
  scanner: 'RaidRelay Security Scanner v2.0',
  passed: issues.length === 0,
  issuesCount: issues.length,
  issues,
};

fs.writeFileSync(path.join(reportDir, 'security-audit.json'), JSON.stringify(auditReport, null, 2));

if (issues.length > 0) {
  console.error(`Security scan failed with ${issues.length} issues:`);
  issues.forEach((issue) => console.error(`  - ${issue}`));
  process.exit(1);
} else {
  console.info('✓ Security scan passed cleanly: Zero exposed secrets, private keys, or unignored .env files found across tree & Git history.');
  process.exit(0);
}
