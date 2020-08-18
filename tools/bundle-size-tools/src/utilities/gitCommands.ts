/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { execSync } from 'child_process';

/**
 * Gets the commit in master that the current branch is based on.
 */
export function getBaselineCommit(): string {
  return execSync('git merge-base origin/master HEAD').toString().trim();
}

export function getPriorCommit(baseCommit: string): string {
  return execSync(`git log --pretty=format:"%H" -1 ${baseCommit}~1`).toString().trim();
}