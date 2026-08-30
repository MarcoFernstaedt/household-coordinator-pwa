import { describe, expect, it } from 'vitest';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { collectCurrentFiles, scanText } from '../../tools/scan-public.mjs';

describe('public-boundary scanner canaries', () => {
  it('detects private paths, credential assignments, and non-fixture personal email', () => {
    expect(scanText(`prefix ${'/ho' + 'me/example/private'} suffix`, 'sample.txt')).toContain(
      'private_absolute_path',
    );
    expect(scanText(`${'API_' + 'KEY'}=real-looking-secret-value`, 'sample.txt')).toContain(
      'secret_assignment',
    );
    expect(scanText(`contact ${'person@' + 'example.com'}`, 'sample.txt')).toContain(
      'email_identifier',
    );
  });

  it('scans a clean exported directory without Git metadata', () => {
    const root = mkdtempSync(join(tmpdir(), 'hcpwa-scan-export-'));
    try {
      writeFileSync(join(root, 'README.md'), 'Synthetic export');
      expect(collectCurrentFiles(root)).toEqual(['README.md']);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it('includes generated build output while excluding dependency trees', () => {
    const root = mkdtempSync(join(tmpdir(), 'hcpwa-scan-build-'));
    try {
      mkdirSync(join(root, 'dist'));
      mkdirSync(join(root, 'dist-server'));
      mkdirSync(join(root, 'node_modules'));
      writeFileSync(join(root, 'dist', 'app.js'), 'built client');
      writeFileSync(join(root, 'dist-server', 'index.js'), 'built server');
      writeFileSync(join(root, 'node_modules', 'dependency.js'), 'dependency');
      expect(collectCurrentFiles(root)).toEqual(['dist-server/index.js', 'dist/app.js']);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it('allows documented placeholders and synthetic example.test identities', () => {
    expect(
      scanText('owner@example.test\nAPI_KEY=<set-in-your-secret-manager>', '.env.example'),
    ).toEqual([]);
  });
});
