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
 * Resolved tip for a canonical remote candidate. `tip` is `undefined` when the
 * `<name>/main` ref doesn't exist locally (e.g. the remote has never been fetched),
 * in which case the candidate is ineligible for the freshness comparison.
 */
interface CanonicalCandidate {
	name: string;
	url: string;
	ref: string;
	tip: string | undefined;
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
 * Among candidates with resolved tips, return those whose tip is the freshest
 * — i.e. not a strict ancestor of any other candidate's tip. A single line of
 * history produces exactly one winner; equal tips don't dominate each other,
 * and truly divergent histories (rare for `main`) produce multiple winners.
 *
 * Precondition: every candidate has a defined `tip`.
 */
function pickFreshest(eligible: CanonicalCandidate[]): CanonicalCandidate[] {
	function hasStrictlyNewerPeer(candidate: CanonicalCandidate): boolean {
		const candidateTip = candidate.tip!;
		return eligible.some((other) => {
			if (other === candidate) return false;
			if (other.tip === candidateTip) return false; // ties don't dominate
			// candidate's tip reachable from other's tip → other is strictly newer
			return isAncestor(candidateTip, other.tip!);
		});
	}

	return eligible.filter((candidate) => !hasStrictlyNewerPeer(candidate));
}

/**
 * Resolve which ref to use as the baseline for bundle comparison.
 *
 * - 0 canonical remotes → fall back to `origin/main`.
 * - 1 canonical remote → use `<that-remote>/main`.
 * - N canonical remotes → pick the one whose `<name>/main` tip is the freshest
 *   (not a strict ancestor of any other candidate's tip). Candidates whose
 *   `<name>/main` doesn't exist locally are dropped. Ties (identical tips or
 *   divergent histories) resolve to the first candidate.
 *
 * Logs the selection so the user can verify what's being compared against.
 * Callers needing an explicit override should bypass this and pass their ref
 * directly to {@link getBaselineCommit}.
 */
export function resolveBaselineRef(): string {
	const canonicals = findCanonicalRemotes();

	if (canonicals.length === 0) {
		const fallback = `origin/main`;
		console.log(
			`No remote found pointing at microsoft/FluidFramework; falling back to ${fallback}. ` +
				`Pass --baseline <ref> to override.`,
		);
		return fallback;
	}

	if (canonicals.length === 1) {
		const only = canonicals[0];
		const ref = `${only.name}/main`;
		console.log(`Using baseline ref ${ref} (remote ${only.name} → ${only.url}).`);
		return ref;
	}

	const candidates: CanonicalCandidate[] = canonicals.map((r) => {
		const ref = `${r.name}/main`;
		return { name: r.name, url: r.url, ref, tip: resolveTip(ref) };
	});
	const eligible = candidates.filter((c) => c.tip !== undefined);

	if (eligible.length === 0) {
		// All candidates exist as remotes but none have a locally-tracked main.
		// Fall back to the first candidate's ref; merge-base will surface the real error.
		const fallback = candidates[0].ref;
		console.log(
			`Multiple remotes point at microsoft/FluidFramework but none have ${eligible
				.map((c) => c.ref)
				.join(", ")} fetched locally; falling back to ${fallback}. Pass --baseline <ref> to override.`,
		);
		return fallback;
	}

	const freshest = pickFreshest(eligible);
	const selected = freshest[0];

	console.log(`Multiple remotes point at microsoft/FluidFramework:`);
	for (const c of candidates) {
		if (c.tip === undefined) {
			console.log(`  ${c.ref} — not fetched locally; skipped`);
			continue;
		}
		const isSelected = c === selected;
		const isFreshest = freshest.includes(c);
		const marker = isSelected
			? " ← selected (freshest)"
			: isFreshest
				? " (also freshest; tie-broken by config order)"
				: ` (ancestor of ${selected.ref})`;
		console.log(`  ${c.ref} → ${c.tip.slice(0, 10)}${marker}`);
	}

	return selected.ref;
}
