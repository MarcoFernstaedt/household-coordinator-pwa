import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const dependabotConfig = readFileSync('.github/dependabot.yml', 'utf8');

describe('Dependabot update policy', () => {
  it('ignores routine major version updates while keeping compatible updates enabled', () => {
    expect(dependabotConfig).toContain('open-pull-requests-limit: 5');
    expect(dependabotConfig).toMatch(/dependency-name:\s*['"]\*['"]/);
    expect(dependabotConfig).toMatch(/update-types:\s*\[['"]version-update:semver-major['"]\]/);
    expect(dependabotConfig).not.toContain('open-pull-requests-limit: 0');
  });
});
