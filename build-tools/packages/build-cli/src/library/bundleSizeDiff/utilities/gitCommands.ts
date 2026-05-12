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
 * A canonical-remote ref paired with its locally-resolved tip commit. Only
 * refs that resolve are eligible; missing tips disqualify the entry upstream
 * before it reaches the freshness comparison.
 */
interface CanonicalCandidate {
	name: string;
	ref: string;
	tip: string;
}

/**
 * Lists remotes that point at the canonical `microsoft/FluidFramework`
 * repository. Returns an empty array if none match.
 *
 * Match is case-insensitive and tolerant of a trailing `.git`, covering both
 * HTTPS (`https://github.com/microsoft/FluidFramework[.git]`) and SSH
 * (`git@github.com:microsoft/FluidFramework[.git]`) remote URL forms.
 */
function findCanonicalRemotes(): { name: string; url: string }[] {
	// Reads remote URLs straight from git config rather than scraping
	// `git remote -v` (which is human-formatted and duplicates each remote).
	// `--all` returns every match (otherwise `--regexp` returns only the first);
	// `--show-names` includes the key so we can extract the remote name.
	const output = execSync(
		`git config get --all --show-names --regexp '^remote\\..*\\.url$'`,
	).toString();
	const line = /^remote\.(.+)\.url\s+(.+)$/;
	const canonical = /(^|[/:])microsoft\/fluidframework(\.git)?$/i;
	const matches: { name: string; url: string }[] = [];
	for (const raw of output.split("\n")) {
		const match = line.exec(raw);
		if (match === null) continue;
		const [, name, url] = match;
		if (canonical.test(url)) {
			matches.push({ name, url });
		}
	}
	return matches;
}

/**
 * Resolve the tip commit of a ref, or `undefined` if it doesn't exist locally.
 */
function resolveTip(ref: string): string | undefined {
	try {
		return execSync(`git rev-parse --verify ${ref}`, {
			// ignore stdin + stderr; capture stdout
			stdio: ["ignore", "pipe", "ignore"],
		})
			.toString()
			.trim();
	} catch {
		return undefined;
	}
}

/**
 * Test whether `ancestor` is an ancestor of `descendant` in the commit DAG.
 * A commit is its own ancestor. Returns `false` if either ref can't be resolved.
 */
function isAncestor(ancestor: string, descendant: string): boolean {
	try {
		execSync(`git merge-base --is-ancestor ${ancestor} ${descendant}`, {
			// only care about exit code
			stdio: "ignore",
		});
		return true;
	} catch {
		return false;
	}
}

/**
 * From a set of candidates, return those whose tip is the freshest — i.e. not
 * a strict ancestor of any other candidate's tip. A single line of history
 * produces exactly one winner; equal tips don't dominate each other, and
 * truly divergent histories (rare for `main`) produce multiple winners.
 */
function pickFreshest(candidates: CanonicalCandidate[]): CanonicalCandidate[] {
	function hasStrictlyNewerPeer(candidate: CanonicalCandidate): boolean {
		return candidates.some((other) => {
			if (other === candidate) return false;
			if (other.tip === candidate.tip) return false; // ties don't dominate
			// candidate's tip reachable from other's tip → other is strictly newer
			return isAncestor(candidate.tip, other.tip);
		});
	}

	return candidates.filter((candidate) => !hasStrictlyNewerPeer(candidate));
}

/**
 * Pick the canonical remote (one pointing at `microsoft/FluidFramework`) whose
 * `<name>/<branch>` is freshest locally, and return its name. Returns
 * `undefined` when no usable canonical remote is configured — callers decide
 * the fallback policy.
 *
 * - 0 canonical remotes → return `undefined`.
 * - 1 canonical remote → return its name.
 * - N canonical remotes → return the one whose `<name>/<branch>` tip is the
 *   freshest (not a strict ancestor of any other candidate's tip). Candidates
 *   whose `<name>/<branch>` doesn't exist locally are dropped. Ties (identical
 *   tips or divergent histories) resolve to the first candidate in config order.
 *   If every candidate was dropped, return `undefined` — we'd just be picking
 *   an unusable ref, and the caller's fallback (or a clear merge-base error)
 *   is more honest.
 *
 * Logs the selection so the user can verify what's being compared against.
 */
export function pickCanonicalRemote(branch: string): string | undefined {
	const canonicals = findCanonicalRemotes();

	if (canonicals.length === 0) {
		console.log(`No remote found pointing at microsoft/FluidFramework.`);
		return undefined;
	}

	if (canonicals.length === 1) {
		const only = canonicals[0];
		console.log(`Canonical remote: ${only.name} (${only.url}).`);
		return only.name;
	}

	const candidates: CanonicalCandidate[] = [];
	const skipped: string[] = [];
	for (const r of canonicals) {
		const ref = `${r.name}/${branch}`;
		const tip = resolveTip(ref);
		if (tip === undefined) {
			skipped.push(ref);
		} else {
			candidates.push({ name: r.name, ref, tip });
		}
	}

	if (candidates.length === 0) {
		console.log(
			`Multiple remotes point at microsoft/FluidFramework but none of [${skipped.join(
				", ",
			)}] are fetched locally.`,
		);
		return undefined;
	}

	const freshest = pickFreshest(candidates);
	const selected = freshest[0];

	console.log(`Multiple remotes point at microsoft/FluidFramework:`);
	for (const ref of skipped) {
		console.log(`  ${ref} — not fetched locally; skipped`);
	}
	for (const c of candidates) {
		const marker =
			c === selected
				? " ← selected (freshest)"
				: freshest.includes(c)
					? " (also freshest; tie-broken by config order)"
					: ` (ancestor of ${selected.ref})`;
		console.log(`  ${c.ref} → ${c.tip.slice(0, 10)}${marker}`);
	}

	return selected.name;
}
