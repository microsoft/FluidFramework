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
 * A remote ref paired with its locally-resolved tip commit.
 */
interface RemoteCandidate {
	name: string;
	ref: string;
	tip: string;
}

/**
 * List every remote configured in the local git repo.
 *
 * @returns The configured remotes in `.git/config` order, or an empty array if
 * none are configured.
 */
function listRemotes(): { name: string; url: string }[] {
	// Read every `remote.<name>.url` config entry. `--all` returns every match
	// (otherwise `--regexp` returns only the first); `--show-names` includes
	// the key so the remote name can be extracted.
	// Exit codes from `git config get --regexp`:
	//   0   = at least one match
	//   1   = no matches (e.g. clone has no remotes configured)
	//   any other = the subcommand itself failed — most likely git < 2.46
	//               (`get` is not a recognized subcommand on older versions).
	// Treat status 1 as a clean "no matches" and reserve the targeted "upgrade
	// git" message for the actually-broken case.
	let output: string;
	try {
		output = execFileSync(
			"git",
			["config", "get", "--all", "--show-names", "--regexp", "^remote\\..*\\.url$"],
			{ stdio: ["ignore", "pipe", "pipe"] },
		).toString();
	} catch (error) {
		if ((error as { status?: number }).status === 1) {
			return [];
		}
		const detail = error instanceof Error ? error.message : String(error);
		throw new Error(
			`Failed to read remote URLs via \`git config get --regexp\` (introduced in git 2.46). ` +
				`Upgrade git to enable remote auto-detection.\n` +
				`Underlying error: ${detail}`,
		);
	}
	const line = /^remote\.(.+)\.url\s+(.+)$/;
	const remotes: { name: string; url: string }[] = [];
	for (const raw of output.split("\n")) {
		const match = line.exec(raw);
		if (match === null) continue;
		const [, name, url] = match;
		remotes.push({ name, url });
	}
	return remotes;
}

/**
 * Resolve the tip commit of a ref.
 *
 * @returns The commit SHA the ref points at, or `undefined` if the ref doesn't
 * exist locally. Re-throws on any other failure (e.g. git binary missing,
 * repo corruption).
 */
function resolveTip(ref: string): string | undefined {
	try {
		return execFileSync("git", ["rev-parse", "--verify", ref], {
			// ignore stdin + stderr; capture stdout
			stdio: ["ignore", "pipe", "ignore"],
		})
			.toString()
			.trim();
	} catch (error) {
		// `git rev-parse --verify` exits with 128 when the ref can't be resolved.
		if ((error as { status?: number }).status === 128) {
			return undefined;
		}
		throw error;
	}
}

/**
 * Test whether `ancestor` is an ancestor of `descendant` in the commit DAG.
 * A commit is its own ancestor.
 *
 * @returns `true` if `ancestor` is reachable from `descendant`, `false` if not.
 * Re-throws on any other failure (e.g. either commit not in the local object
 * store, repo corruption).
 */
function isAncestor(ancestor: string, descendant: string): boolean {
	try {
		execFileSync("git", ["merge-base", "--is-ancestor", ancestor, descendant], {
			// only care about exit code
			stdio: "ignore",
		});
		return true;
	} catch (error) {
		// `git merge-base --is-ancestor` exits 0 (true), 1 (false), or 128 / other
		// for real errors. Treat only status 1 as the legitimate "not ancestor".
		if ((error as { status?: number }).status === 1) {
			return false;
		}
		throw error;
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
function pickFreshest(candidates: RemoteCandidate[]): RemoteCandidate[] {
	function hasStrictlyNewerPeer(candidate: RemoteCandidate): boolean {
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
 * From the remotes configured in the local repo whose URL matches `filter`,
 * pick the one whose `<name>/<branch>` is freshest locally.
 *
 * Remotes whose `<name>/<branch>` doesn't resolve locally are dropped. Among
 * the rest, pick the tip that isn't a strict ancestor of any other's; ties
 * (identical or divergent tips) resolve to the first candidate in config order.
 *
 * @returns The selected remote's name, or `undefined` if no remote matches
 * `filter` or none have a locally-resolvable `<name>/<branch>`.
 */
export function pickFreshestRemote(
	branch: string,
	filter: (url: string) => boolean,
): string | undefined {
	const eligible = listRemotes().filter((r) => filter(r.url));

	if (eligible.length === 0) {
		return undefined;
	}

	const candidates: RemoteCandidate[] = [];
	const skipped: string[] = [];
	for (const remote of eligible) {
		const ref = `${remote.name}/${branch}`;
		let tip: string | undefined;
		try {
			tip = resolveTip(ref);
		} catch (error) {
			// Don't let an unexpected git failure for one remote kill the whole
			// selection — log to stderr and treat the candidate as skipped so
			// the other remotes still get a chance to be picked.
			const detail = error instanceof Error ? error.message : String(error);
			console.error(`  ${ref} — unexpected error resolving tip; skipped (${detail})`);
			skipped.push(ref);
			continue;
		}
		if (tip === undefined) {
			skipped.push(ref);
		} else {
			candidates.push({ name: remote.name, ref, tip });
		}
	}

	if (candidates.length === 0) {
		console.log(`No eligible remote has [${skipped.join(", ")}] fetched locally.`);
		return undefined;
	}

	let freshest: RemoteCandidate[];
	try {
		freshest = pickFreshest(candidates);
	} catch (error) {
		// Tip-vs-tip comparison hit an unexpected failure (e.g. corrupt repo).
		// Fall back to the first candidate so we still produce *a* baseline
		// instead of crashing the whole command.
		const detail = error instanceof Error ? error.message : String(error);
		console.error(
			`Unexpected error comparing tips; falling back to first candidate (${detail})`,
		);
		freshest = [candidates[0]];
	}
	const selected = freshest[0];

	console.log(`Eligible remotes:`);
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
