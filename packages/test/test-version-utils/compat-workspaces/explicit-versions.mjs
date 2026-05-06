/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

/**
 * Human-maintained list of specific package versions required by tests that fall outside
 * the delta-based version range produced by `update-compat-versions`.
 *
 * Add an entry here when a test uses `describeInstallVersions({ requestAbsoluteVersions: [...] })`
 * with a pinned version. Include a comment indicating which test needs the version and why.
 *
 * After editing this file, re-run `pnpm run update-compat-versions` from
 * packages/test/test-version-utils to regenerate workspace package.json files and lockfiles,
 * then commit all changes.
 */
export const explicitVersions = [
	"0.56.0", // legacyChunking.spec.ts -- pre-2.x chunking behavior
	"2.0.0-internal.1.4.6", // compression.spec.ts -- loader before compression field was introduced
	"2.0.0-internal.7.0.0", // entryPointCompat.spec.ts -- loader before entryPoint API change
];
