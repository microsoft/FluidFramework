import { execSync } from 'child_process';

/**
 * Gets the commit in master that the current branch is based on.
 */
export function getBaselineCommit(): string {
  return execSync('git merge-base origin/master HEAD').toString().trim();
}
