/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { execFileSync } from "node:child_process";

/**
 * Compute the merge-base of `HEAD` and the given ref. The ref may be any
 * argument `git merge-base` accepts (remote branch, local branch, SHA, tag, …).
 *
 * @returns The merge-base commit SHA.
 */
export function getMergeBaseWithHead(targetRef: string): string {
	return execFileSync("git", ["merge-base", targetRef, "HEAD"]).toString().trim();
}

/**
 * A canonical-remote ref paired with its locally-resolved tip commit.
 */
interface CanonicalCandidate {
	name: string;
	ref: string;
	tip: string;
}

/**
 * List remotes that point at the canonical `microsoft/FluidFramework`
 * repository.
 *
 * Match is case-insensitive and tolerant of a trailing `.git`, covering both
 * HTTPS (`https://github.com/microsoft/FluidFramework[.git]`) and SSH
 * (`git@github.com:microsoft/FluidFramework[.git]`) remote URL forms.
 *
 * @returns The matching remotes in `.git/config` order, or an empty array if
 * none match.
 */
function findCanonicalRemotes(): { name: string; url: string }[] {
	// Read every `remote.<name>.url` config entry. `--all` returns every match
	// (otherwise `--regexp` returns only the first); `--show-names` includes
	// the key so the remote name can be extracted.
	// The `git config get` subcommand requires git ≥ 2.46; fail fast with a
	// targeted message if it isn't available rather than letting an unhandled
	// child-process exception leak out.
	let output: string;
	try {
		output = execFileSync(
			"git",
			["config", "get", "--all", "--show-names", "--regexp", "^remote\\..*\\.url$"],
			{ stdio: ["ignore", "pipe", "pipe"] },
		).toString();
	} catch (error) {
		const detail = error instanceof Error ? error.message : String(error);
		throw new Error(
			`Failed to read remote URLs via \`git config get --regexp\` (introduced in git 2.46). ` +
				`Upgrade git, or pass --target <ref> to skip remote auto-detection.\n` +
				`Underlying error: ${detail}`,
		);
	}
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
 * Resolve the tip commit of a ref.
 *
 * @returns The commit SHA the ref points at, or `undefined` if the ref doesn't
 * exist locally.
 */
function resolveTip(ref: string): string | undefined {
	try {
		return execFileSync("git", ["rev-parse", "--verify", ref], {
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
 * A commit is its own ancestor.
 *
 * @returns `true` if `ancestor` is reachable from `descendant`, `false`
 * otherwise — including when either ref can't be resolved.
 */
function isAncestor(ancestor: string, descendant: string): boolean {
	try {
		execFileSync("git", ["merge-base", "--is-ancestor", ancestor, descendant], {
			// only care about exit code
			stdio: "ignore",
		});
		return true;
	} catch {
		return false;
	}
}

/**
 * From a set of candidates, find those whose tip is the freshest — i.e. not a
 * strict ancestor of any other candidate's tip.
 *
 * @returns The freshest candidates. A single line of history produces exactly
 * one winner; equal tips don't dominate each other, and truly divergent
 * histories (rare for `main`) produce multiple winners.
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
 * `<name>/<branch>` is freshest locally.
 *
 * Remotes whose `<name>/<branch>` doesn't resolve locally are dropped. Among
 * the rest, pick the tip that isn't a strict ancestor of any other's; ties
 * (identical or divergent tips) resolve to the first candidate in config order.
 *
 * @returns The selected remote's name, or `undefined` if no canonical remote is
 * configured or none have a locally-resolvable `<name>/<branch>`.
 */
export function pickFreshestCanonicalRemote(branch: string): string | undefined {
	const canonicals = findCanonicalRemotes();

	if (canonicals.length === 0) {
		console.log(`No remote found pointing at microsoft/FluidFramework.`);
		return undefined;
	}

	const candidates: CanonicalCandidate[] = [];
	const skipped: string[] = [];
	for (const remote of canonicals) {
		const ref = `${remote.name}/${branch}`;
		const tip = resolveTip(ref);
		if (tip === undefined) {
			skipped.push(ref);
		} else {
			candidates.push({ name: remote.name, ref, tip });
		}
	}

	if (candidates.length === 0) {
		console.log(
			`Found remote(s) pointing at microsoft/FluidFramework but none of [${skipped.join(
				", ",
			)}] are fetched locally.`,
		);
		return undefined;
	}

	const freshest = pickFreshest(candidates);
	const selected = freshest[0];

	console.log(`Remotes pointing at microsoft/FluidFramework:`);
	for (const ref of skipped) {
		console.log(`  ${ref} — not fetched locally; skipped`);
	}
	for (const candidate of candidates) {
		const marker =
			candidate === selected
				? " ← selected (freshest)"
				: freshest.includes(candidate)
					? " (also freshest; tie-broken by config order)"
					: ` (ancestor of ${selected.ref})`;
		console.log(`  ${candidate.ref} → ${candidate.tip.slice(0, 10)}${marker}`);
	}

	return selected.name;
}
