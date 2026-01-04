#!/usr/bin/env node
/**
 * Release script for Proxxied
 * Usage:
 *   npm run release              # Bump patch and release stable
 *   npm run release -- --beta    # Bump patch and release as beta
 *   npm run release -- --minor   # Bump minor version
 *   npm run release -- --major   # Bump major version
 *   npm run release -- 1.0.0     # Release specific version
 *   npm run release -- 1.0.0 --beta  # Release as 1.0.0-beta.1
 *   npm run release -- --dry-run # Preview without making changes
 *   npm run release -- --revert  # Revert the latest release (delete tag)
 *   npm run release -- --revert v1.0.0  # Revert specific release
 *   npm run release -- --skip-validation  # Skip build/lint validation
 */

import { execSync, spawn } from 'child_process';
import { readFileSync, writeFileSync } from 'fs';
import { createInterface } from 'readline';

// Colors
const RED = '\x1b[31m';
const GREEN = '\x1b[32m';
const YELLOW = '\x1b[33m';
const BLUE = '\x1b[34m';
const GRAY = '\x1b[90m';
const NC = '\x1b[0m';

const info = (msg) => console.log(`${BLUE}ℹ${NC}  ${msg}`);
const success = (msg) => console.log(`${GREEN}✓${NC}  ${msg}`);
const warn = (msg) => console.log(`${YELLOW}⚠${NC}  ${msg}`);
const error = (msg) => { console.log(`${RED}✗${NC}  ${msg}`); process.exit(1); };

// Parse arguments
const args = process.argv.slice(2);
const isPatch = args.includes('--patch');
const isMinor = args.includes('--minor');
const isMajor = args.includes('--major');
const isDryRun = args.includes('--dry-run');
const isRevert = args.includes('--revert');
const isPromoteStable = args.includes('--promote-stable');
const skipValidation = args.includes('--skip-validation');

// Check for explicit version (non-flag argument, also matches v1.0.0 format)
const explicitVersion = args.find(arg => !arg.startsWith('--') && /^v?\d+\.\d+\.\d+/.test(arg));

// Helper to run shell commands
// throwOnError: if true, throws instead of calling error() - use inside try-catch blocks
const run = (cmd, options = {}) => {
    try {
        const result = execSync(cmd, { encoding: 'utf8', stdio: options.silent ? 'pipe' : 'inherit', ...options });
        return result ? result.trim() : '';
    } catch (e) {
        if (options.ignoreError) {
            return '';
        }
        if (options.throwOnError) {
            throw new Error(`Command failed: ${cmd}\n${e.message}`);
        }
        error(`Command failed: ${cmd}\n${e.message}`);
    }
};

// Helper to prompt user
const prompt = (question) => {
    const rl = createInterface({ input: process.stdin, output: process.stdout });
    return new Promise((resolve) => {
        rl.question(question, (answer) => {
            rl.close();
            resolve(answer.toLowerCase());
        });
    });
};

// Helper to prompt for multi-line input
const promptMultiLine = (question) => {
    const rl = createInterface({ input: process.stdin, output: process.stdout });
    return new Promise((resolve) => {
        console.log(question);
        console.log(`${GRAY}(Enter your notes, then press Enter twice to finish)${NC}`);
        let lines = [];
        let emptyCount = 0;
        rl.on('line', (line) => {
            if (line === '') {
                emptyCount++;
                if (emptyCount >= 1) {
                    rl.close();
                    resolve(lines.join('\n'));
                    return;
                }
            } else {
                emptyCount = 0;
            }
            lines.push(line);
        });
    });
};

// Helper to get GitHub repo slug (owner/repo) from git remote
const getGitHubRepoSlug = () => {
    const remote = run('git remote get-url origin', { silent: true, ignoreError: true });
    if (!remote) return null;

    // Handle SSH format: git@github.com:user/repo.git
    // Handle HTTPS format: https://github.com/user/repo.git
    let match = remote.match(/github\.com[:/](.+?)(?:\.git)?$/);
    if (match) {
        return match[1].replace(/\.git$/, '');
    }
    return null;
};

// Helper to get full GitHub repo URL from git remote
const getGitHubRepoUrl = () => {
    const slug = getGitHubRepoSlug();
    return slug ? `https://github.com/${slug}` : null;
};

// Validate semver format
const isValidSemver = (version) => {
    const semverRegex = /^v?\d+\.\d+\.\d+(-[a-zA-Z0-9.]+)?$/;
    return semverRegex.test(version);
};

// Check if tag exists locally or remotely
const tagExists = (tag) => {
    const localTag = run(`git tag -l "${tag}"`, { silent: true });
    if (localTag) return 'local';

    const remoteTag = run(`git ls-remote --tags origin "refs/tags/${tag}"`, { silent: true, ignoreError: true });
    if (remoteTag) return 'remote';

    return false;
};

// Check network connectivity to GitHub
const checkConnectivity = () => {
    const result = run('git ls-remote --exit-code origin HEAD', { silent: true, ignoreError: true });
    return result !== '';
};

// Check gh CLI authentication
const checkGhAuth = () => {
    const ghAvailable = run('which gh', { silent: true, ignoreError: true });
    if (!ghAvailable) return { available: false, authenticated: false };

    const authStatus = run('gh auth status 2>&1', { silent: true, ignoreError: true });
    const authenticated = authStatus.includes('Logged in');
    return { available: true, authenticated };
};

// Run pre-release validation (build + lint)
const runValidation = () => {
    info('Running pre-release validation...');
    console.log('');

    info('Building client...');
    run('npm run build --prefix client', { throwOnError: true });
    success('Build passed!');

    info('Linting client...');
    run('npm run lint --prefix client', { throwOnError: true });
    success('Lint passed!');

    console.log('');
    success('Pre-release validation complete!');
};

// Get commits since last tag for changelog
const getCommitsSinceLastTag = () => {
    const lastTag = run('git describe --tags --abbrev=0', { silent: true, ignoreError: true });
    const range = lastTag ? `${lastTag}..HEAD` : 'HEAD';
    // Use --no-color to prevent ANSI codes from breaking regex parsing
    const commits = run(`git log ${range} --oneline --no-color`, { silent: true, ignoreError: true });
    return { lastTag, commits: commits || '' };
};

// Analyze commits for conventional commit prefixes to suggest bump type
const analyzeCommits = (commits) => {
    if (!commits) return { suggested: 'minor', reason: 'no commits found', counts: {} };

    const lines = commits.split('\n').filter(Boolean);
    const counts = { major: 0, minor: 0, patch: 0 };
    let hasBreakingChange = false;

    // Regex patterns - allow optional prefix like [TESTING] or similar before type
    const breakingPattern = /(?:^|\]\s*)(feat|fix|refactor|chore|docs|style|test|perf|ci|build)!:/i;
    const featPattern = /(?:^|\]\s*)feat(\(.+\))?:/i;
    const patchPattern = /(?:^|\]\s*)(fix|refactor|chore|docs|style|test|perf|ci|build)(\(.+\))?:/i;

    for (const line of lines) {
        // Remove commit hash prefix
        const message = line.replace(/^[a-f0-9]+\s+/, '');

        // Check for breaking changes
        if (breakingPattern.test(message) || /BREAKING CHANGE/i.test(message)) {
            hasBreakingChange = true;
            counts.major++;
        }
        // Check for features
        else if (featPattern.test(message)) {
            counts.minor++;
        }
        // Check for fixes and other patch-level changes
        else if (patchPattern.test(message)) {
            counts.patch++;
        }
    }

    // Determine suggested bump type
    let suggested = 'minor'; // Default to minor
    let reason = 'default (no conventional commits detected)';

    if (hasBreakingChange || counts.major > 0) {
        suggested = 'major';
        reason = `${counts.major} breaking change(s) detected`;
    } else if (counts.minor > 0) {
        suggested = 'minor';
        reason = `${counts.minor} feat commit(s) detected`;
    } else if (counts.patch > 0) {
        suggested = 'patch';
        reason = `${counts.patch} fix/refactor commit(s) detected`;
    }

    return { suggested, reason, counts };
};
// Start release notes generation in background (returns a promise)
// Uses npx to run gemini-cli since the 'gemini' alias isn't available in spawned shells
const startReleaseNotesGeneration = (commits, version) => {
    const promptText = `Generate release notes for version ${version}. Output ONLY the formatted notes - no introduction, no "Here are the notes", just the categorized bullet points. Use markdown headers (###) for categories like Features, Fixes, etc. Be concise.\n\nCommits:\n${commits}`;
    const escapedPrompt = promptText.replace(/"/g, '\\"');

    return new Promise((resolve) => {
        let output = '';
        let resolved = false;

        // Use npx to run gemini-cli directly (alias won't work in spawned shell)
        const child = spawn('sh', ['-c', `echo "${escapedPrompt}" | npx --yes https://github.com/google-gemini/gemini-cli`], {
            stdio: ['pipe', 'pipe', 'pipe']
        });

        // 2 minute timeout
        const timeout = setTimeout(() => {
            if (!resolved) {
                resolved = true;
                child.kill('SIGTERM');
                warn('Gemini CLI timed out after 2 minutes');
                resolve(null);
            }
        }, 120000);

        child.stdout.on('data', (data) => {
            output += data.toString();
        });

        child.on('close', (code) => {
            if (!resolved) {
                resolved = true;
                clearTimeout(timeout);
                if (code === 0 && output.trim()) {
                    resolve(output.trim());
                } else {
                    resolve(null);
                }
            }
        });

        child.on('error', () => {
            if (!resolved) {
                resolved = true;
                clearTimeout(timeout);
                resolve(null);
            }
        });
    });
};

// Interactive changelog prompt (accepts optional pre-started gemini promise)
const getInteractiveChangelog = async (newVersion, geminiPromise = null) => {
    const { lastTag, commits } = getCommitsSinceLastTag();

    console.log('');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('  Commits since last release' + (lastTag ? ` (${lastTag})` : ''));
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    if (commits) {
        console.log(GRAY + commits + NC);
    } else {
        console.log(GRAY + '(no commits found)' + NC);
    }
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('');

    // Try to get AI-generated notes (if commits exist)
    if (commits) {
        info('Generating release notes with Gemini CLI...');

        // Use pre-started promise or start fresh
        const notesPromise = geminiPromise || startReleaseNotesGeneration(commits, newVersion);
        const notes = await notesPromise;

        if (notes) {
            console.log('');
            console.log('Generated release notes:');
            console.log(GRAY + '────────────────────────' + NC);
            console.log(notes);
            console.log(GRAY + '────────────────────────' + NC);
            console.log('');

            const action = await prompt('[Y]es / [e]dit / [m]anual / [s]kip: ');
            if (action === 'y' || action === '') {
                return notes;
            } else if (action === 'e') {
                return await promptMultiLine('Enter your release notes:');
            } else if (action === 'm') {
                return await promptMultiLine('Enter your release notes:');
            } else if (action === 's') {
                info('Skipping release notes');
                return '';
            }
            // Any other input skips notes
            return '';
        } else {
            info('Gemini CLI not available or failed - falling back to manual');
        }
    }

    // Fallback to manual entry
    const addNotes = await prompt('Add release notes manually? [Y/n]: ');
    if (addNotes !== 'n') {
        return await promptMultiLine('Enter your release notes:');
    }

    return '';
};

async function main() {
    console.log('');
    info('Proxxied Release Script');
    console.log('');

    // Check for uncommitted changes
    const status = run('git status --porcelain', { silent: true });
    if (status) {
        error('Working directory has uncommitted changes. Please commit or stash them first.');
    }

    // Check branch
    const branch = run('git branch --show-current', { silent: true });
    if (branch !== 'main') {
        warn(`You're on branch '${branch}', not 'main'.`);
        const answer = await prompt('Continue anyway? [Y/n]: ');
        if (answer === 'n') process.exit(0);
    }

    // Check network connectivity
    info('Checking network connectivity...');
    if (!checkConnectivity()) {
        error('Cannot reach GitHub. Check your internet connection.');
    }
    success('Connected to GitHub');

    // Check gh CLI authentication
    const ghStatus = checkGhAuth();
    if (ghStatus.available && !ghStatus.authenticated) {
        warn('gh CLI not authenticated. GitHub Release creation may require manual setup.');
        warn('Run: gh auth login');
    }

    // Pull latest (only on main, skip on feature branches)
    if (branch === 'main') {
        info('Pulling latest changes...');
        run('git pull --rebase');
    } else {
        info('Skipping git pull on feature branch (no upstream tracking assumed)');
    }

    // Handle revert mode
    if (isRevert) {
        let tagToRevert = explicitVersion;

        // If no version specified, find the latest tag
        if (!tagToRevert) {
            const latestTag = run('git describe --tags --abbrev=0', { silent: true, ignoreError: true });
            if (!latestTag) {
                error('No tags found to revert');
            }
            tagToRevert = latestTag;
        }

        // Ensure tag has v prefix
        if (!tagToRevert.startsWith('v')) {
            tagToRevert = `v${tagToRevert}`;
        }

        // Verify tag exists
        const exists = tagExists(tagToRevert);
        if (!exists) {
            error(`Tag ${tagToRevert} does not exist`);
        }

        console.log('');
        console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
        console.log('  Revert Release');
        console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
        console.log(`  Tag to delete:    ${tagToRevert}`);
        console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
        console.log('');
        warn('This will delete the tag and GitHub Release.');
        console.log('');

        if (isDryRun) {
            warn('[DRY RUN] No changes will be made');
            process.exit(0);
        }

        const revertAnswer = await prompt('Proceed with revert? [Y/n]: ');
        if (revertAnswer === 'n') {
            info('Revert cancelled');
            process.exit(0);
        }

        info(`Deleting local tag ${tagToRevert}...`);
        run(`git tag -d "${tagToRevert}"`, { silent: true, ignoreError: true });

        info(`Deleting remote tag ${tagToRevert}...`);
        run(`git push origin --delete "${tagToRevert}"`, { silent: true, ignoreError: true });

        // Try to delete GitHub Release using gh CLI
        const repoSlug = getGitHubRepoSlug();

        if (ghStatus.available && ghStatus.authenticated && repoSlug) {
            info(`Deleting GitHub Release ${tagToRevert}...`);
            // gh release delete returns empty string on success
            run(`gh release delete "${tagToRevert}" --repo "${repoSlug}" --yes 2>/dev/null`, { silent: true, ignoreError: true });
            success(`GitHub Release ${tagToRevert} deleted (if it existed)`);
        } else if (!ghStatus.available) {
            const repoUrl = getGitHubRepoUrl();
            warn('gh CLI not found. You may need to delete the GitHub Release manually.');
            warn(`Visit: ${repoUrl ? `${repoUrl}/releases` : 'GitHub releases page'}`);
        }

        console.log('');
        success(`Release ${tagToRevert} reverted!`);
        console.log('');
        process.exit(0);
    }

    // Handle promote-stable mode
    if (isPromoteStable) {
        console.log('');
        console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
        console.log('  Promote Latest to Stable');
        console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');

        const repoSlug = getGitHubRepoSlug();
        if (!repoSlug) {
            error('Could not determine GitHub repository.');
        }

        const ghStatus = checkGhAuth();
        if (!ghStatus.available || !ghStatus.authenticated) {
            error('gh CLI must be installed and authenticated. Run: gh auth login');
        }

        // Get latest release
        const latestTag = run('gh release list --limit 1 --json tagName -q ".[0].tagName"', { silent: true, ignoreError: true });
        if (!latestTag) {
            error('No releases found to promote.');
        }

        console.log(`  Latest release: ${latestTag}`);
        console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
        console.log('');

        if (isDryRun) {
            warn('[DRY RUN] Would trigger promote-stable workflow');
            process.exit(0);
        }

        const confirmAnswer = await prompt('Promote this release to stable channel? [Y/n]: ');
        if (confirmAnswer === 'n') {
            info('Promote cancelled');
            process.exit(0);
        }

        info('Triggering promote-stable workflow...');
        run(`gh workflow run release.yml --repo "${repoSlug}" -f promote_stable=true`, { silent: true, throwOnError: true });

        console.log('');
        success('Promote-stable workflow triggered!');
        info(`Check progress at: https://github.com/${repoSlug}/actions`);
        console.log('');
        process.exit(0);
    }

    // Validate explicit version format
    if (explicitVersion && !isValidSemver(explicitVersion)) {
        error(`Invalid version format: ${explicitVersion}. Expected: X.Y.Z or X.Y.Z-prerelease`);
    }

    // Get current version
    const pkg = JSON.parse(readFileSync('package.json', 'utf8'));
    const currentVersion = pkg.version;
    info(`Current version: ${currentVersion}`);

    // Calculate new version
    let newVersion;
    let bumpType = 'explicit';

    if (explicitVersion) {
        // Use explicit version (may already include prerelease suffix)
        newVersion = explicitVersion.replace(/^v/, ''); // Remove v prefix if present
        // Check if it's already a prerelease version - use as-is
        // No automatic beta suffix addition (deprecated)
    } else {
        // No explicit version - analyze commits and prompt for bump type

        // Parse current version first
        const versionMatch = currentVersion.match(/^(\d+)\.(\d+)\.(\d+)(-.*)?$/);
        if (!versionMatch) {
            error(`Cannot parse current version: ${currentVersion}`);
        }

        let [, major, minor, patch] = versionMatch.map(Number);

        // Check if user specified bump type via flag
        if (isMajor || isMinor) {
            bumpType = isMajor ? 'major' : 'minor';
        } else {
            // Analyze commits for semantic versioning suggestion
            const { commits: analysisCommits } = getCommitsSinceLastTag();
            const analysis = analyzeCommits(analysisCommits);

            console.log('');
            info(`Commit analysis: ${analysis.reason}`);

            // Build the prompt with the suggested option bolded (capital letter)
            const majorOpt = analysis.suggested === 'major' ? `${YELLOW}[M]ajor${NC}` : '[m]ajor';
            const minorOpt = analysis.suggested === 'minor' ? `${YELLOW}m[I]nor${NC}` : 'm[i]nor';
            const patchOpt = analysis.suggested === 'patch' ? `${YELLOW}[P]atch${NC}` : '[p]atch';

            const bumpAnswer = await prompt(`Which bump type? ${majorOpt} / ${minorOpt} / ${patchOpt}: `);

            if (bumpAnswer === 'm' || bumpAnswer === 'M') {
                bumpType = 'major';
            } else if (bumpAnswer === 'i' || bumpAnswer === 'I' || bumpAnswer === '') {
                // Default to suggested if empty, or 'i' for minor
                bumpType = bumpAnswer === '' ? analysis.suggested : 'minor';
            } else if (bumpAnswer === 'p' || bumpAnswer === 'P') {
                bumpType = 'patch';
            } else {
                // If just pressing enter, use suggested
                bumpType = analysis.suggested;
            }
        }

        switch (bumpType) {
            case 'major': major++; minor = 0; patch = 0; break;
            case 'minor': minor++; patch = 0; break;
            case 'patch': patch++; break;
        }

        newVersion = `${major}.${minor}.${patch}`;
        // Note: Beta suffix no longer added automatically (use explicit version if needed)
    }

    // Check if tag already exists
    const existingTag = tagExists(`v${newVersion}`);
    if (existingTag) {
        error(`Tag v${newVersion} already exists (${existingTag}). Use --revert first or choose a different version.`);
    }

    // Start AI release notes generation early (runs in background during validation)
    const { commits: changelogCommits } = getCommitsSinceLastTag();
    let geminiPromise = null;
    if (changelogCommits) {
        info('Starting AI release notes generation in background...');
        geminiPromise = startReleaseNotesGeneration(changelogCommits, newVersion);
    }

    // Run pre-release validation unless skipped
    if (!skipValidation) {
        console.log('');
        runValidation();
    } else {
        warn('Skipping pre-release validation (--skip-validation)');
    }

    const releaseType = 'stable';
    const channel = 'latest';

    // Get release notes interactively (pass pre-started gemini promise)
    const releaseNotes = await getInteractiveChangelog(newVersion, geminiPromise);

    console.log('');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log(isDryRun ? '  [DRY RUN] Release Summary' : '  Release Summary');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log(`  Repository:       ${getGitHubRepoSlug() || 'unknown'}`);
    console.log(`  Current version:  ${currentVersion}`);
    console.log(`  New version:      ${newVersion}`);
    console.log(`  Bump type:        ${bumpType}`);
    console.log(`  Release type:     ${releaseType}`);
    console.log(`  Update channel:   ${channel}`);
    console.log(`  Git tag:          v${newVersion}`);
    if (releaseNotes) {
        console.log(`  Release notes:    (${releaseNotes.split('\n').length} lines)`);
    }
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('');

    if (isDryRun) {
        if (releaseNotes) {
            console.log('Release notes preview:');
            console.log(GRAY + '────────────────────────' + NC);
            console.log(releaseNotes);
            console.log(GRAY + '────────────────────────' + NC);
            console.log('');
        }
        warn('[DRY RUN] No changes will be made');
        process.exit(0);
    }

    // Confirm
    const confirmAnswer = await prompt('Proceed with release? [Y/n]: ');
    if (confirmAnswer === 'n') {
        info('Release cancelled');
        process.exit(0);
    }

    // Track state for rollback
    let filesModified = false;
    let committed = false;
    let tagged = false;

    // Cleanup function for rollback
    const cleanup = () => {
        console.log('');
        warn('Release failed! Rolling back changes...');

        if (tagged) {
            info('Deleting tag...');
            run(`git tag -d "v${newVersion}"`, { silent: true, ignoreError: true });
        }

        if (committed) {
            info('Reverting commit...');
            // Use --hard to fully restore working directory
            run('git reset --hard HEAD~1', { silent: true, ignoreError: true });
        } else if (filesModified) {
            // If we modified but didn't commit, restore the file
            info('Restoring package.json...');
            run('git restore --staged package.json', { silent: true, ignoreError: true });
            run('git restore package.json', { silent: true, ignoreError: true });
        }

        console.log('');
        info('Rollback complete. Working directory restored.');
    };

    try {
        // Update version in package.json
        info(`Updating version to ${newVersion}...`);
        pkg.version = newVersion;
        writeFileSync('package.json', JSON.stringify(pkg, null, 2) + '\n');
        filesModified = true;

        // Commit
        info('Committing version bump...');
        run('git add package.json', { silent: true, throwOnError: true });
        run(`git commit -m "chore: bump version to ${newVersion}"`, { silent: true, throwOnError: true });
        committed = true;

        // Tag (with optional release notes)
        info(`Creating tag v${newVersion}...`);
        if (releaseNotes) {
            // Create annotated tag with release notes
            const escapedNotes = releaseNotes.replace(/"/g, '\\"').replace(/\n/g, '\\n');
            run(`git tag -a "v${newVersion}" -m "${escapedNotes}"`, { silent: true, throwOnError: true });
        } else {
            run(`git tag "v${newVersion}"`, { silent: true, throwOnError: true });
        }
        tagged = true;

        // Push (use --set-upstream if branch has no upstream)
        info('Pushing changes and tag...');
        try {
            const hasUpstream = run(`git config branch.${branch}.remote`, { silent: true, ignoreError: true });
            if (hasUpstream) {
                run('git push', { silent: true, throwOnError: true });
            } else {
                run(`git push --set-upstream origin ${branch}`, { silent: true, throwOnError: true });
            }
            run('git push --tags', { silent: true, throwOnError: true });
        } catch (e) {
            // Better error messages for common push failures
            if (e.message.includes('protected branch')) {
                throw new Error('Push rejected: Branch is protected. Release from a PR or adjust branch protection rules.');
            } else if (e.message.includes('permission denied') || e.message.includes('Permission denied')) {
                throw new Error('Push rejected: Permission denied. Check your SSH/HTTPS credentials.');
            } else if (e.message.includes('non-fast-forward')) {
                throw new Error('Push rejected: Remote has changes not in your local branch. Pull and try again.');
            }
            throw e;
        }

        // Update CHANGELOG.md
        if (releaseNotes) {
            info('Updating CHANGELOG.md...');
            const today = new Date().toISOString().split('T')[0];
            const changelogEntry = `## [${newVersion}] - ${today}\n\n${releaseNotes}\n\n`;
            try {
                const existingChangelog = readFileSync('CHANGELOG.md', 'utf8');
                writeFileSync('CHANGELOG.md', changelogEntry + existingChangelog);
            } catch {
                // File doesn't exist, create it
                writeFileSync('CHANGELOG.md', `# Changelog\n\n${changelogEntry}`);
            }
            run('git add CHANGELOG.md', { silent: true, ignoreError: true });
            run(`git commit --amend --no-edit`, { silent: true, ignoreError: true });
            run('git push --force-with-lease', { silent: true, ignoreError: true });
        }

        // Create GitHub release with notes (if gh CLI available)
        const repoSlug = getGitHubRepoSlug();
        const ghStatus = checkGhAuth();
        if (ghStatus.available && ghStatus.authenticated && repoSlug && releaseNotes) {
            info('Creating GitHub Release with notes...');
            const escapedNotes = releaseNotes.replace(/"/g, '\\"').replace(/`/g, '\\`');
            run(`gh release create "v${newVersion}" --repo "${repoSlug}" --title "v${newVersion}" --notes "${escapedNotes}"`, { silent: true, ignoreError: true });
        }

        // Success summary with dynamic width
        const repoUrl = getGitHubRepoUrl();

        // Calculate content lines and max width
        const lines = [
            `🎉 Release v${newVersion} Published Successfully!`,
            '',
            `Version:     ${newVersion}`,
            `Channel:     ${channel}`,
            `Tag:         v${newVersion}`,
        ];
        if (releaseNotes) {
            lines.push(`Notes:       ${releaseNotes.split('\n').length} lines`);
        }
        lines.push('');
        lines.push('📦 GitHub Actions building release...');
        if (repoUrl) {
            lines.push(`🔗 ${repoUrl}/actions`);
            lines.push(`📋 ${repoUrl}/releases`);
        }

        // Find max line length (accounting for emoji width as 2 chars)
        const getVisualLength = (str) => {
            // Strip ANSI codes first
            const stripped = str.replace(/\x1b\[[0-9;]*m/g, '');
            // Count emojis as 2 chars wide (they take up 2 columns in terminal)
            // Common emoji pattern: single codepoint or combining sequences
            let len = 0;
            for (const c of stripped) {
                // Emoji ranges (simplified - covers most common emojis)
                const cp = c.codePointAt(0);
                if (cp > 0x1F300 && cp < 0x1FBFF) {
                    len += 2; // Emoji - 2 chars wide
                } else {
                    len += 1;
                }
            }
            return len;
        };
        const maxLen = Math.max(...lines.filter(l => l).map(l => getVisualLength(l))) + 4; // padding
        const boxWidth = Math.max(maxLen, 40);

        // Helper to pad line content
        const padLine = (content) => {
            const visLen = getVisualLength(content);
            const padding = boxWidth - visLen - 4;
            return `│  ${content}${' '.repeat(Math.max(0, padding))}  │`;
        };

        const border = '─'.repeat(boxWidth);
        console.log('');
        console.log(`┌${border}┐`);
        console.log(padLine(`${GREEN}${lines[0]}${NC}`));
        console.log(`├${border}┤`);
        // Info lines (skip title and first empty)
        for (let i = 2; i < lines.length; i++) {
            if (lines[i] === '') {
                console.log(`├${border}┤`);
            } else {
                console.log(padLine(lines[i]));
            }
        }
        console.log(`└${border}┘`);
        console.log('');
    } catch (e) {
        cleanup();
        error(e.message);
    }
}

main().catch(e => {
    console.log(`${RED}✗${NC} ${e.message}`);
    process.exit(1);
});
