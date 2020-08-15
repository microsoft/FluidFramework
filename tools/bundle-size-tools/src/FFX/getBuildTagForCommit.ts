/**
 * Returns the git tag to use to mark that a build is waiting for the baseline to be available for a commit hash.
 */
export function getBuildTagForCommit(commitHash: string): string {
  return `bundle-buddy-pending-${commitHash}`;
}
