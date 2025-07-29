// .githooks/validate-new-service.js

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');
const yaml = require('yaml');

// --- Configuration ---
// A. The path to your primary CI workflow file.
const WORKFLOW_FILE_PATH = '.github/workflows/ci.yml'; 
// B. The prefixes for scripts we expect in the root package.json.
const REQUIRED_SCRIPT_PREFIXES = ['build:', 'test:', 'lint:'];
// C. A regex to identify where your JS packages live.
const PACKAGE_LOCATION_PATTERN = /^(services|libs)\/[^/]+\/package\.json$/;
// --- End Configuration ---

const RED = '\x1b[31m';
const YELLOW = '\x1b[33m';
const CYAN = '\x1b[36m';
const RESET = '\x1b[0m';

/**
 * Gets a list of staged files.
 * @returns {string[]} An array of file paths.
 */
function getStagedFiles() {
    try {
        // --cached gets staged files, --name-only gets just the filenames
        const output = execSync('git diff --cached --name-only --diff-filter=A', { encoding: 'utf-8' });
        return output.split('\n').filter(Boolean); // Filter out empty lines
    } catch (error) {
        console.error(`${RED}Error getting staged files.${RESET}`);
        return [];
    }
}

/**
 * Finds newly added package.json files from a list of staged files.
 * @param {string[]} stagedFiles - A list of all staged files.
 * @returns {{name: string, path: string}[]} A list of new packages.
 */
function findNewPackages(stagedFiles) {
    const newPackages = [];
    for (const file of stagedFiles) {
        if (PACKAGE_LOCATION_PATTERN.test(file)) {
            const packageDir = path.dirname(file);
            const packageName = path.basename(packageDir);
            newPackages.push({ name: packageName, path: packageDir });
        }
    }
    return newPackages;
}

/**
 * Checks if the new packages are included in the workflow file paths.
 * @param {{name: string, path: string}[]} newPackages - List of new packages to check.
 * @returns {string[]} A list of warning messages.
 */
function checkWorkflowPaths(newPackages) {
    const warnings = [];
    if (!fs.existsSync(WORKFLOW_FILE_PATH)) {
        warnings.push(`Workflow file not found at ${CYAN}${WORKFLOW_FILE_PATH}${RESET}. Skipping check.`);
        return warnings;
    }

    const workflowFile = fs.readFileSync(WORKFLOW_FILE_PATH, 'utf8');
    const workflowData = yaml.parse(workflowFile);
    const triggerPaths = workflowData?.on?.pull_request?.paths || workflowData?.on?.push?.paths || [];

    for (const pkg of newPackages) {
        const expectedPath = `${pkg.path}/**`;
        if (!triggerPaths.includes(expectedPath)) {
            warnings.push(
                `The new service ${CYAN}${pkg.name}${RESET} is not added to the CI workflow paths in ${CYAN}${WORKFLOW_FILE_PATH}${RESET}.\n  > Please add ${YELLOW}'${expectedPath}'${RESET} to the 'paths' list.`
            );
        }
    }
    return warnings;
}

/**
 * Checks if the root package.json has the required scripts for new packages.
 * @param {{name: string, path: string}[]} newPackages - List of new packages to check.
 * @returns {string[]} A list of warning messages.
 */
function checkRootScripts(newPackages) {
    const warnings = [];
    const rootPackageJson = JSON.parse(fs.readFileSync('package.json', 'utf8'));
    const rootScripts = rootPackageJson.scripts || {};

    for (const pkg of newPackages) {
        for (const prefix of REQUIRED_SCRIPT_PREFIXES) {
            const expectedScript = `${prefix}${pkg.name}`;
            if (!rootScripts[expectedScript]) {
                warnings.push(
                    `The root ${CYAN}package.json${RESET} is missing the script: ${YELLOW}${expectedScript}${RESET}.`
                );
            }
        }
    }
    return warnings;
}

// --- Main Execution ---
function main() {
    const stagedFiles = getStagedFiles();
    const newPackages = findNewPackages(stagedFiles);

    if (newPackages.length === 0) {
        // No new JS packages added, nothing to do.
        return;
    }

    console.log(`\n${CYAN}Checking ${newPackages.length} new JS service(s)/lib(s)...${RESET}`);

    const allWarnings = [
        ...checkWorkflowPaths(newPackages),
        ...checkRootScripts(newPackages),
    ];

    if (allWarnings.length > 0) {
        console.log(`\n${YELLOW}========================= ATTENTION =========================${RESET}`);
        console.log(`${YELLOW}Your commit contains new services/libs with configuration issues:${RESET}\n`);
        allWarnings.forEach(warning => console.log(`- ${warning}\n`));
        console.log(`${YELLOW}=============================================================${RESET}`);
        // console.log('These are warnings and will not block your commit.\n');
        console.log(`\n${RED}Commit ABORTED.${RESET} Please fix the issues above and try again.`);
        process.exit(1);
    } else {
        console.log('✅ All checks passed.');
    }

    // We exit with 0 to only WARN the user, not block the commit.
    // To block the commit, you would use: process.exit(1);
    process.exit(0);
}

main();