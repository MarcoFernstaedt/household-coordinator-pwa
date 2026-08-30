#!/usr/bin/env node
import { execFileSync } from 'node:child_process';
import { readFileSync, readdirSync } from 'node:fs';
import { join, relative, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const privatePath = new RegExp('/' + 'ho' + 'me' + '/[^/\\s]+/', 'i');
const email = /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi;
const secretAssignment = /\b(?:API_KEY|SECRET|TOKEN|PASSWORD)\s*=\s*([^\s#]+)/gi;
const credentialShapes = [
  ['private_key_marker', new RegExp('BEGIN ' + '(?:RSA |EC |OPENSSH )?' + 'PRIVATE KEY')],
  ['github_token', new RegExp('gh' + '[opsu]_[A-Za-z0-9]{20,}')],
];

export function scanText(text, path) {
  const findings = [];
  if (privatePath.test(text)) findings.push('private_absolute_path');
  for (const match of text.matchAll(email)) {
    const value = match[0].toLowerCase();
    if (!value.endsWith('@example.test') && !value.endsWith('@users.noreply.github.com'))
      findings.push('email_identifier');
  }
  for (const match of text.matchAll(secretAssignment)) {
    const value = match[1] ?? '';
    if (!/^<[^>]+>$/.test(value) && !/^(change-me|placeholder)$/i.test(value))
      findings.push('secret_assignment');
  }
  for (const [name, pattern] of credentialShapes) if (pattern.test(text)) findings.push(name);
  const policyDocument =
    path.startsWith('docs/') ||
    ['README.md', 'CONTRIBUTING.md', 'SECURITY.md', 'AGENTS.md', 'CLAUDE.md'].includes(path);
  if (/\b(?:SSN|social security|precise location|camera feed)\b/i.test(text) && !policyDocument)
    findings.push('forbidden_private_term');
  return [...new Set(findings)];
}

function git(...args) {
  return execFileSync('git', args, { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
}

export function collectCurrentFiles(root = process.cwd()) {
  const excluded = new Set([
    '.git',
    'node_modules',
    'coverage',
    'playwright-report',
    'test-results',
  ]);
  const files = [];
  const visit = (directory) => {
    for (const entry of readdirSync(directory, { withFileTypes: true })) {
      if (excluded.has(entry.name)) continue;
      const absolute = join(directory, entry.name);
      if (entry.isDirectory()) visit(absolute);
      else if (entry.isFile()) files.push(relative(root, absolute).split(sep).join('/'));
    }
  };
  visit(root);
  return files.sort();
}

function currentFiles() {
  return collectCurrentFiles();
}

function scanCurrent() {
  const findings = [];
  for (const path of currentFiles()) {
    if (path === 'tools/scan-public.mjs' || path.startsWith('tests/security/')) continue;
    let text;
    try {
      text = readFileSync(path, 'utf8');
    } catch {
      continue;
    }
    for (const detector of scanText(text, path)) findings.push({ detector, path });
  }
  return findings;
}

function scanHistory() {
  let objects = '';
  try {
    objects = git('rev-list', '--objects', '--all');
  } catch {
    return [];
  }
  const findings = [];
  const seen = new Set();
  for (const line of objects.split('\n')) {
    const [oid, ...parts] = line.split(' ');
    const path = parts.join(' ');
    if (
      !oid ||
      !path ||
      seen.has(oid) ||
      path === 'tools/scan-public.mjs' ||
      path.startsWith('tests/security/')
    )
      continue;
    seen.add(oid);
    let text;
    try {
      text = git('cat-file', '-p', oid);
    } catch {
      continue;
    }
    for (const detector of scanText(text, path)) findings.push({ detector, path });
  }
  return findings;
}

const self = fileURLToPath(import.meta.url);
if (process.argv[1] === self) {
  const mode = process.argv.includes('--history') ? 'history' : 'current';
  const findings = mode === 'history' ? scanHistory() : scanCurrent();
  if (findings.length) {
    for (const finding of findings) console.error(`${finding.detector}: ${finding.path}`);
    process.exitCode = 1;
  } else {
    console.log(`public_scan mode=${mode} findings=0`);
  }
}
