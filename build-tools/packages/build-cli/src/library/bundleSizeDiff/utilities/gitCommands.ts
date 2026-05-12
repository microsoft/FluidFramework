/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { execSync } from "node:child_process";

/**
 * Returns the merge-base of `HEAD` and the given ref. The ref may be any
 * argument `git merge-base` accepts (remote branch, local branch, SHA, tag, …).
 */
export function getBaselineCommit(baselineRef: string): string {
	return execSync(`git merge-base ${baselineRef} HEAD`).toString().trim();
}

/**
 * Pick the remote that points at the canonical `microsoft/FluidFramework`
 * repository, if one exists. Returns `{ name, url }` or `undefined`.
 *
 * Match is case-insensitive and tolerant of a trailing `.git`, covering both
 * HTTPS (`https://github.com/microsoft/FluidFramework[.git]`) and SSH
 * (`git@github.com:microsoft/FluidFramework[.git]`) remote URL forms.
 */
export function findCanonicalRemote(): { name: string; url: string } | undefined {
	const output = execSync(`git remote -v`).toString();
	// Each line looks like: "origin\thttps://github.com/microsoft/FluidFramework.git (fetch)"
	const canonical = /(^|[/:])microsoft\/fluidframework(\.git)?$/i;
	for (const line of output.split("\n")) {
		const [name, rest] = line.split("\t");
		if (name === undefined || rest === undefined) continue;
		const url = rest.split(" ")[0];
		if (url !== undefined && canonical.test(url)) {
			return { name, url };
		}
	}
	return undefined;
}

/**
 * Resolve which ref to use as the baseline for bundle comparison. If a remote
 * pointing at `microsoft/FluidFramework` is found, use `<that-remote>/main`;
 * otherwise fall back to `origin/main`. Logs the selection (and any fallback)
 * so the user can verify what's being compared against.
 *
 * Callers needing an explicit override should bypass this and pass their ref
 * directly to {@link getBaselineCommit}.
 */
export function resolveBaselineRef(): string {
	const canonical = findCanonicalRemote();
	if (canonical !== undefined) {
		const ref = `${canonical.name}/main`;
		console.log(`Using baseline ref ${ref} (remote ${canonical.name} → ${canonical.url}).`);
		return ref;
	}
	const fallback = `origin/main`;
	console.log(
		`No remote found pointing at microsoft/FluidFramework; falling back to ${fallback}. ` +
			`Pass --baseline <ref> to override.`,
	);
	return fallback;
}
