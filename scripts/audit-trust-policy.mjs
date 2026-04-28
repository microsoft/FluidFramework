#!/usr/bin/env node
/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

/**
 * audit-trust-policy.mjs
 *
 * Best-effort approximation of pnpm's `trustPolicy: no-downgrade` rule applied
 * to a pnpm-lock.yaml without forcing a re-resolution.
 *
 * What it does:
 *   1. Reads `pnpm-lock.yaml` and extracts every unique `<name>@<version>` from
 *      the top-level `packages:` section.
 *   2. Reads `pnpm-workspace.yaml` and parses `trustPolicyExclude`.
 *   3. For each unique package name, fetches abbreviated metadata from the npm
 *      registry once.
 *   4. For each pinned version, compares its trust evidence against every
 *      earlier-published, non-prerelease version of the same package. Flags any
 *      pinned version that is weaker than at least one earlier version.
 *
 * Trust evidence model:
 *   This script treats trust as a single binary signal: a version either has a
 *   provenance attestation in `dist.attestations.provenance` or it does not.
 *   pnpm's actual algorithm has finer tiers (trusted publisher > provenance >
 *   none); the registry's public abbreviated metadata does not reliably expose
 *   the trusted-publisher tier without parsing sigstore bundles, so this script
 *   may miss trusted-publisher -> provenance regressions. It will not produce
 *   false positives relative to the binary model.
 *
 * Usage:
 *   node scripts/audit-trust-policy.mjs [options]
 *
 * Options:
 *   --lockfile <path>      Path to pnpm-lock.yaml (default: ./pnpm-lock.yaml)
 *   --workspace <path>     Path to pnpm-workspace.yaml for trustPolicyExclude
 *                          (default: ./pnpm-workspace.yaml)
 *   --concurrency <n>      Max concurrent registry requests (default: 8)
 *   --registry <url>       Registry base URL (default: https://registry.npmjs.org)
 *   --json                 Emit JSON instead of a text table
 *   --verbose              Print progress and per-package diagnostics
 *   --help, -h             Show this help and exit
 *
 * Exit codes:
 *   0 if no violations were found
 *   1 if at least one violation was found
 *   2 if the script could not run (missing files, bad arguments, etc.)
 */

import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

// ---------------------------------------------------------------------------
// Argument parsing
// ---------------------------------------------------------------------------

function parseArgs(argv) {
	const out = {};
	for (let i = 0; i < argv.length; i++) {
		const a = argv[i];
		switch (a) {
			case "--help":
			case "-h":
				out.help = true;
				break;
			case "--json":
				out.json = true;
				break;
			case "--verbose":
				out.verbose = true;
				break;
			case "--lockfile":
				out.lockfile = argv[++i];
				break;
			case "--workspace":
				out.workspace = argv[++i];
				break;
			case "--concurrency":
				out.concurrency = Number(argv[++i]);
				break;
			case "--registry":
				out.registry = argv[++i];
				break;
			default:
				console.error(`Unknown argument: ${a}`);
				process.exit(2);
		}
	}
	return out;
}

function printHelp() {
	const banner = readFileSync(new URL(import.meta.url), "utf-8")
		.split("\n")
		.filter((line) => line.startsWith(" *") || line.startsWith("/*!"))
		.map((line) => line.replace(/^\/\*!?| ?\*\/?| ?\* ?/g, ""))
		.join("\n");
	console.log(banner);
}

const args = parseArgs(process.argv.slice(2));
if (args.help) {
	printHelp();
	process.exit(0);
}

const lockfilePath = resolve(args.lockfile ?? "pnpm-lock.yaml");
const workspacePath = resolve(args.workspace ?? "pnpm-workspace.yaml");
const concurrency = Number.isFinite(args.concurrency) && args.concurrency > 0 ? args.concurrency : 8;
const registry = (args.registry ?? "https://registry.npmjs.org").replace(/\/+$/, "");
const asJson = args.json === true;
const verbose = args.verbose === true;

if (!existsSync(lockfilePath)) {
	console.error(`Lockfile not found: ${lockfilePath}`);
	process.exit(2);
}

// ---------------------------------------------------------------------------
// Lockfile parsing: extract unique <name>@<version> from top-level `packages:`
// ---------------------------------------------------------------------------

/**
 * Parses pnpm-lock.yaml and returns the set of unique `<name>@<version>` keys
 * from the top-level `packages:` section. Strips peer-dependency suffixes
 * (e.g. `react-dom@18.2.0(react@18.2.0)` -> `react-dom@18.2.0`).
 */
function parseLockfilePackages(text) {
	const lines = text.split(/\r?\n/);
	const result = new Set();
	let inPackages = false;
	for (const line of lines) {
		// Top-level section header (no leading whitespace, ends with ':').
		if (/^[A-Za-z][A-Za-z0-9_-]*:\s*$/.test(line)) {
			inPackages = /^packages:\s*$/.test(line);
			continue;
		}
		if (!inPackages) continue;

		// Direct child of `packages:` is indented exactly 2 spaces.
		const m = /^ {2}('?)([^']+?)\1:\s*$/.exec(line);
		if (!m) continue;

		let key = m[2];
		// Strip peer-dep suffix that pnpm v10 appends in parens.
		const parenIdx = key.indexOf("(");
		if (parenIdx >= 0) key = key.slice(0, parenIdx);

		// Split on the LAST '@' so scoped names like `@babel/core@7.26.0` work.
		const lastAt = key.lastIndexOf("@");
		if (lastAt <= 0) continue;
		const name = key.slice(0, lastAt);
		const version = key.slice(lastAt + 1);
		if (!name || !version) continue;

		result.add(`${name}@${version}`);
	}
	return result;
}

// ---------------------------------------------------------------------------
// pnpm-workspace.yaml: extract trustPolicyExclude list
// ---------------------------------------------------------------------------

/**
 * Returns a Set of strings from the `trustPolicyExclude:` list in
 * pnpm-workspace.yaml. Recognizes plain, single-quoted, and double-quoted
 * entries. Returns an empty Set if the file is missing or the key is absent.
 *
 * Note: this only matches exact `name@version` entries against pinned versions.
 * It does not evaluate range expressions like `webpack@4.47.0 || 5.102.1` —
 * those would require a semver matcher; flag and skip with a warning.
 */
function parseTrustPolicyExclude(text) {
	const exclude = new Set();
	if (!text) return exclude;
	const lines = text.split(/\r?\n/);
	let inExclude = false;
	for (const raw of lines) {
		if (/^trustPolicyExclude:\s*$/.test(raw)) {
			inExclude = true;
			continue;
		}
		if (!inExclude) continue;

		// Comment or blank line: keep going.
		if (/^\s*(#.*)?$/.test(raw)) continue;

		// Indented list item: `  - 'pkg@1.2.3'` / `  - "pkg@1.2.3"` / `  - pkg@1.2.3`.
		const m = /^\s+-\s*(['"]?)(.+?)\1\s*(#.*)?$/.exec(raw);
		if (m) {
			const value = m[2].trim();
			if (value.includes("||") || /[<>=^~*]/.test(value)) {
				console.warn(
					`Warning: trustPolicyExclude entry "${value}" uses a range/version expression; ` +
						`this script only matches exact name@version and will skip it.`,
				);
				continue;
			}
			exclude.add(value);
			continue;
		}

		// Anything else with non-list-item indentation ends the list.
		if (/^\S/.test(raw)) {
			inExclude = false;
		}
	}
	return exclude;
}

// ---------------------------------------------------------------------------
// Registry fetch with simple in-memory cache + concurrency limit
// ---------------------------------------------------------------------------

const packumentCache = new Map(); // name -> Promise<packument | null>

async function fetchPackument(name) {
	if (packumentCache.has(name)) return packumentCache.get(name);

	// Scoped names need `/` percent-encoded for the URL.
	const encoded = name.startsWith("@")
		? `@${encodeURIComponent(name.slice(1))}`
		: encodeURIComponent(name);
	const url = `${registry}/${encoded}`;

	const promise = (async () => {
		for (let attempt = 0; attempt < 2; attempt++) {
			try {
				const res = await fetch(url, {
					headers: {
						// Full metadata is required: the abbreviated format
						// (`application/vnd.npm.install-v1+json`) drops the per-version
						// `time` map, which is needed to determine "earlier-published"
						// versions for the no-downgrade comparison.
						accept: "application/json",
					},
				});
				if (res.status === 404) return null;
				if (!res.ok) {
					if (attempt === 0) continue;
					console.warn(`Warning: ${name}: registry returned ${res.status}`);
					return null;
				}
				return await res.json();
			} catch (err) {
				if (attempt === 0) continue;
				console.warn(`Warning: ${name}: registry fetch failed (${err.message ?? err})`);
				return null;
			}
		}
		return null;
	})();

	packumentCache.set(name, promise);
	return promise;
}

/**
 * Limits concurrency on async tasks. `iter` is an iterable of factories that
 * each return a Promise when called. Returns a Promise that resolves once all
 * tasks are done.
 */
async function runWithConcurrency(items, n, worker) {
	const queue = [...items];
	let active = 0;
	let finished = 0;
	const total = queue.length;
	return new Promise((resolveAll, rejectAll) => {
		const next = () => {
			if (queue.length === 0 && active === 0) {
				resolveAll();
				return;
			}
			while (active < n && queue.length > 0) {
				const item = queue.shift();
				active++;
				worker(item)
					.catch(rejectAll)
					.finally(() => {
						active--;
						finished++;
						if (verbose && finished % 50 === 0) {
							console.error(`  progress: ${finished}/${total}`);
						}
						next();
					});
			}
		};
		next();
	});
}

// ---------------------------------------------------------------------------
// Trust-evidence scoring
// ---------------------------------------------------------------------------

/**
 * Returns 1 if the version's metadata includes a provenance attestation, 0
 * otherwise. Treats trust as a single binary signal — see file header for the
 * caveat about trusted-publisher tiers.
 */
function trustLevel(versionMeta) {
	const att = versionMeta?.dist?.attestations;
	if (att && typeof att === "object" && att.provenance) return 1;
	return 0;
}

function isPrerelease(version) {
	// Cheap: any '-' after the major.minor.patch indicates a prerelease tag.
	// Not bulletproof for build metadata-only versions ('+'), but those are rare
	// in practice.
	return /-/.test(version);
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main() {
	if (verbose) {
		console.error(`Reading lockfile: ${lockfilePath}`);
	}
	const lockfileText = readFileSync(lockfilePath, "utf-8");
	const pinnedSet = parseLockfilePackages(lockfileText);
	if (verbose) {
		console.error(`Found ${pinnedSet.size} unique name@version entries.`);
	}

	let excludeSet = new Set();
	if (existsSync(workspacePath)) {
		excludeSet = parseTrustPolicyExclude(readFileSync(workspacePath, "utf-8"));
		if (verbose) {
			console.error(`Loaded ${excludeSet.size} trustPolicyExclude entries.`);
		}
	} else if (verbose) {
		console.error(`No pnpm-workspace.yaml at ${workspacePath}; no exclusions applied.`);
	}

	// Group pinned versions by name so we fetch each packument once.
	const byName = new Map();
	for (const entry of pinnedSet) {
		const lastAt = entry.lastIndexOf("@");
		const name = entry.slice(0, lastAt);
		const version = entry.slice(lastAt + 1);
		if (!byName.has(name)) byName.set(name, new Set());
		byName.get(name).add(version);
	}

	if (verbose) {
		console.error(
			`Querying registry for ${byName.size} unique packages (concurrency=${concurrency})...`,
		);
	}

	const violations = [];
	const skipped = [];

	await runWithConcurrency(byName.keys(), concurrency, async (name) => {
		const packument = await fetchPackument(name);
		if (packument === null) {
			skipped.push({ name, reason: "registry-unreachable-or-404" });
			return;
		}
		const versions = packument.versions ?? {};
		const times = packument.time ?? {};

		// Pre-compute trust level and publish time for every version of this
		// package once. Strip non-version keys (`created`, `modified`).
		const allVersions = Object.keys(versions);
		const trustByVersion = new Map();
		const timeByVersion = new Map();
		for (const v of allVersions) {
			trustByVersion.set(v, trustLevel(versions[v]));
			const t = times[v];
			if (typeof t === "string") timeByVersion.set(v, Date.parse(t));
		}

		for (const pinnedVersion of byName.get(name)) {
			const exclusionKey = `${name}@${pinnedVersion}`;
			if (excludeSet.has(exclusionKey)) continue;

			const meta = versions[pinnedVersion];
			if (!meta) {
				skipped.push({ name, version: pinnedVersion, reason: "version-not-in-registry" });
				continue;
			}
			const pinnedTrust = trustByVersion.get(pinnedVersion) ?? 0;
			const pinnedTime = timeByVersion.get(pinnedVersion);
			if (pinnedTime === undefined) {
				skipped.push({ name, version: pinnedVersion, reason: "no-publish-time" });
				continue;
			}

			const pinnedIsPrerelease = isPrerelease(pinnedVersion);

			let maxPriorTrust = 0;
			let priorExample;
			let priorExampleTime;
			for (const [otherVersion, otherTime] of timeByVersion) {
				if (otherTime >= pinnedTime) continue;
				// pnpm v10.24+: prerelease versions are ignored when evaluating trust
				// for a non-prerelease install.
				if (!pinnedIsPrerelease && isPrerelease(otherVersion)) continue;
				const otherTrust = trustByVersion.get(otherVersion) ?? 0;
				if (otherTrust > maxPriorTrust) {
					maxPriorTrust = otherTrust;
					priorExample = otherVersion;
					priorExampleTime = otherTime;
				}
			}

			if (maxPriorTrust > pinnedTrust) {
				violations.push({
					name,
					version: pinnedVersion,
					pinnedTrust,
					maxPriorTrust,
					priorExample,
					pinnedPublishedAt: new Date(pinnedTime).toISOString(),
					priorPublishedAt:
						priorExampleTime !== undefined
							? new Date(priorExampleTime).toISOString()
							: undefined,
				});
			}
		}
	});

	// Stable sort for readable output.
	violations.sort((a, b) =>
		a.name === b.name ? a.version.localeCompare(b.version) : a.name.localeCompare(b.name),
	);

	if (asJson) {
		console.log(
			JSON.stringify(
				{
					lockfile: lockfilePath,
					workspace: existsSync(workspacePath) ? workspacePath : null,
					totalUniquePackages: pinnedSet.size,
					excludedCount: excludeSet.size,
					violations,
					skipped,
				},
				null,
				2,
			),
		);
	} else {
		console.log(`Audited lockfile: ${lockfilePath}`);
		console.log(`  Unique pinned versions: ${pinnedSet.size}`);
		console.log(`  trustPolicyExclude entries: ${excludeSet.size}`);
		if (skipped.length > 0) {
			console.log(`  Skipped (could not evaluate): ${skipped.length}`);
			if (verbose) {
				for (const s of skipped) {
					console.log(`    - ${s.name}${s.version ? `@${s.version}` : ""} (${s.reason})`);
				}
			}
		}
		if (violations.length === 0) {
			console.log("\nNo trust-policy violations detected.");
		} else {
			console.log(`\n${violations.length} trust-policy violation(s):\n`);
			const nameWidth = Math.max(
				4,
				...violations.map((v) => `${v.name}@${v.version}`.length),
			);
			console.log(
				`${"package@version".padEnd(nameWidth)}  pinned  prior  prior-example`,
			);
			console.log("-".repeat(nameWidth + 2 + 6 + 2 + 5 + 2 + 30));
			for (const v of violations) {
				console.log(
					`${`${v.name}@${v.version}`.padEnd(nameWidth)}  ${String(v.pinnedTrust).padStart(6)}  ${String(v.maxPriorTrust).padStart(5)}  ${v.priorExample ?? ""}`,
				);
			}
			console.log(
				`\nLegend: trust 0 = no provenance; 1 = has provenance attestation.`,
			);
			console.log(
				`These versions would likely fail pnpm's trustPolicy check on resolution.`,
			);
			console.log(
				`To suppress an entry, add an exact "name@version" string to`,
			);
			console.log(`'trustPolicyExclude' in pnpm-workspace.yaml.`);
		}
	}

	process.exitCode = violations.length > 0 ? 1 : 0;
}

main().catch((err) => {
	console.error(err.stack ?? err);
	process.exit(2);
});
