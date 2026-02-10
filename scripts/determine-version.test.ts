import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { execSync } from 'child_process';
import fs from 'fs';
import path from 'path';
import os from 'os';

describe('determine-version.sh', () => {
    let tempDir: string;
    let scriptPath: string;
    let githubOutputFile: string;

    beforeEach(() => {
        tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'version-test-'));
        scriptPath = path.resolve(__dirname, 'determine-version.sh');
        githubOutputFile = path.join(tempDir, 'github_output');
        execSync('git init', { cwd: tempDir, stdio: 'ignore' });
        execSync('git config user.email "test@example.com"', { cwd: tempDir, stdio: 'ignore' });
        execSync('git config user.name "Test User"', { cwd: tempDir, stdio: 'ignore' });
        execSync('git config commit.gpgsign false', { cwd: tempDir, stdio: 'ignore' });
    });

    afterEach(() => {
        fs.rmSync(tempDir, { recursive: true, force: true });
    });

    const runScript = (currentVersion: string, commitMsg: string, eventName = 'push', ref = 'refs/heads/main', promoteStable = 'false', prBody = '') => {
        fs.writeFileSync(path.join(tempDir, 'package.json'), JSON.stringify({ version: currentVersion }));
        execSync('git add package.json', { cwd: tempDir, stdio: 'ignore' });
        execSync('git commit -m "setup"', { cwd: tempDir, stdio: 'ignore' });
        fs.writeFileSync(path.join(tempDir, 'dummy'), 'change');
        execSync('git add dummy', { cwd: tempDir, stdio: 'ignore' });
        execSync(`git commit -m "${commitMsg}"`, { cwd: tempDir, stdio: 'ignore' });
        try {
            execSync(`bash "${scriptPath}"`, {
                cwd: tempDir,
                env: {
                    ...process.env,
                    GITHUB_EVENT_NAME: eventName,
                    GITHUB_REF: ref,
                    INPUT_PROMOTE_STABLE: promoteStable,
                    GITHUB_OUTPUT: githubOutputFile,
                    GIT_DIR: path.join(tempDir, '.git'),
                    GIT_WORK_TREE: tempDir,
                    PR_BODY: prBody
                },
                stdio: 'ignore'
            });
        } catch (e) {
            throw new Error(`Script failed: ${e}`);
        }
        if (fs.existsSync(githubOutputFile)) {
            const content = fs.readFileSync(githubOutputFile, 'utf-8');
            const versionMatch = content.match(/version=(.*)/);
            const stableMatch = content.match(/update_stable=(.*)/);
            const releaseMatch = content.match(/should_release=(.*)/);
            return {
                version: versionMatch ? versionMatch[1] : null,
                updateStable: stableMatch ? stableMatch[1] : null,
                shouldRelease: releaseMatch ? releaseMatch[1] : null
            };
        }
        return { version: null, updateStable: null, shouldRelease: null };
    };

    it('should NOT release for untagged feat commits', () => {
        const result = runScript('0.0.2', 'feat: new feature');
        expect(result.version).toBe('0.1.0');
        expect(result.shouldRelease).toBe('false');
        expect(result.updateStable).toBe('false');
    });

    it('should NOT release for untagged fix commits', () => {
        const result = runScript('0.0.2', 'fix: bug');
        expect(result.version).toBe('0.0.3');
        expect(result.shouldRelease).toBe('false');
        expect(result.updateStable).toBe('false');
    });

    it('should bump Minor for feat commits (1.x) but not release', () => {
        const result = runScript('1.0.0', 'feat: new feature');
        expect(result.version).toBe('1.1.0');
        expect(result.shouldRelease).toBe('false');
        expect(result.updateStable).toBe('false');
    });

    it('should release Minor with release:minor', () => {
        const result = runScript('0.0.2', 'chore: update release:minor');
        expect(result.version).toBe('0.1.0');
        expect(result.shouldRelease).toBe('true');
        expect(result.updateStable).toBe('false');
    });

    it('should release Patch with release:patch', () => {
        const result = runScript('0.0.2', 'feat: small tweak release:patch');
        expect(result.version).toBe('0.0.3');
        expect(result.shouldRelease).toBe('true');
        expect(result.updateStable).toBe('false');
    });

    it('should release Major with release:major', () => {
        const result = runScript('0.0.2', 'feat: break release:major');
        expect(result.version).toBe('1.0.0');
        expect(result.shouldRelease).toBe('true');
        expect(result.updateStable).toBe('true');
    });

    it('should trigger stable update with release:stable', () => {
        const result = runScript('0.0.2', 'fix: critical release:stable');
        expect(result.version).toBe('0.0.3');
        expect(result.shouldRelease).toBe('true');
        expect(result.updateStable).toBe('true');
    });

    it('should handle release:stable combined with release:minor', () => {
        const result = runScript('0.0.2', 'feat: big change release:minor release:stable');
        expect(result.version).toBe('0.1.0');
        expect(result.shouldRelease).toBe('true');
        expect(result.updateStable).toBe('true');
    });

    it('should detect release tags in commit body (multiline)', () => {
        const msg = `fix: a bug

This is a detailed description.
It spans multiple lines.

release:minor`;
        const result = runScript('0.0.2', msg);
        expect(result.version).toBe('0.1.0');
        expect(result.shouldRelease).toBe('true');
        expect(result.updateStable).toBe('false');
    });

    it('should detect stable tag in commit body (multiline)', () => {
        const msg = `fix: a bug

Detailed description.

release:stable`;
        const result = runScript('0.0.2', msg);
        expect(result.version).toBe('0.0.3');
        expect(result.shouldRelease).toBe('true');
        expect(result.updateStable).toBe('true');
    });

    it('should still detect BREAKING CHANGE for major bump', () => {
        const result = runScript('0.0.2', 'feat: BREAKING CHANGE something');
        expect(result.version).toBe('1.0.0');
        expect(result.shouldRelease).toBe('true');
        expect(result.updateStable).toBe('true');
    });

    it('should skip release for sync merge commits', () => {
        const result = runScript('0.1.0', 'chore: bump version to 0.1.0');
        expect(result.shouldRelease).toBe('false');
    });

    it('should detect release:stable in PR body', () => {
        const result = runScript('0.0.2', 'fix: some fix (#99)', 'push', 'refs/heads/main', 'false', 'PR description here\nrelease:stable');
        expect(result.version).toBe('0.0.3');
        expect(result.shouldRelease).toBe('true');
        expect(result.updateStable).toBe('true');
    });

    it('should detect release:patch in PR body', () => {
        const result = runScript('0.0.2', 'fix: some fix (#99)', 'push', 'refs/heads/main', 'false', 'release:patch');
        expect(result.version).toBe('0.0.3');
        expect(result.shouldRelease).toBe('true');
        expect(result.updateStable).toBe('false');
    });

    it('should detect release:minor in PR body with release:stable in commit', () => {
        const result = runScript('0.0.2', 'feat: big change release:stable', 'push', 'refs/heads/main', 'false', 'release:minor');
        expect(result.version).toBe('0.1.0');
        expect(result.shouldRelease).toBe('true');
        expect(result.updateStable).toBe('true');
    });
});
