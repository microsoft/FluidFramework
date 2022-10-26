/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

/**
 * Returns the git tag to use to mark that a build is waiting for the baseline to be available for a commit hash.
 */
export function getBuildTagForCommit(commitHash: string): string {
    return `bundle-size-tools-pending-${commitHash}`;
}
