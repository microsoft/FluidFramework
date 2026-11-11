/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

/**
 * Human-maintained list of specific package versions required by tests that fall outside
 * the delta-based version range produced by `update-compat-versions`.
 *
 * Add an entry here when a test needs a pinned version.
 * Include a comment indicating which test needs the version and why.
 *
 * After editing this file, re-run `pnpm -r run update-compat-versions`
 * to regenerate local package.json files and the workspace lockfile,
 * then commit all changes.
 */
export const explicitVersions = [
	"3.12.0", // version-compat-tests/.../sharedTree.fuzz.spec.ts -- pre- ModularChangeFamily refactor
];
