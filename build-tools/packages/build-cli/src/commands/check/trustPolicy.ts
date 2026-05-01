/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { spawn } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import path from "node:path";

import { Flags } from "@oclif/core";
import { parse as parseYaml } from "yaml";

import { BaseCommand } from "../../library/commands/base.js";

/**
 * The error code pnpm emits (both as the top-level `code` and inside `err`)
 * when `trustPolicy: no-downgrade` rejects an install.
 */
const TRUST_DOWNGRADE_CODE = "ERR_PNPM_TRUST_DOWNGRADE";

interface PnpmRunResult {
	code: number | null;
	stdout: string;
	stderr: string;
}

/**
 * Drives pnpm's own `trustPolicy: no-downgrade` check against every
 * `name@version` referenced by the repo's pnpm-lock.yaml, and reports the
 * full set of trust-downgrade violations.
 *
 * Strategy:
 *   1. Read the lockfile via `@pnpm/lockfile.fs` and enumerate every key
 *      under `packages` (and `snapshots`, if present in newer lockfile
 *      versions).
 *   2. Materialize a scratch workspace at `<repoRoot>/.trust-audit-temp/`
 *      with one leaf project per `(name, version)`. Each leaf depends on
 *      the *real* registry name (no `npm:` aliases) because pnpm 10's
 *      `--trust-policy-exclude` only matches by registry name.
 *   3. Run `pnpm install` against the scratch workspace with NDJSON
 *      reporting. pnpm aborts at the first violation; we add the
 *      offender to the exclude list and re-run, repeating until pnpm
 *      either succeeds or stops surfacing new violations.
 */
export default class CheckTrustPolicyCommand extends BaseCommand<
	typeof CheckTrustPolicyCommand
> {
	static readonly summary =
		"Audits the repo's lockfile against pnpm's `no-downgrade` trust policy.";

	static readonly description =
		"Materializes a scratch workspace under `.trust-audit-temp/` containing one leaf project per pinned dependency, then runs `pnpm install --trust-policy no-downgrade` and iteratively excludes each violation until pnpm either succeeds or stops surfacing new violations. Reports the full list of trust-downgrade violations.";

	static readonly flags = {
		json: Flags.boolean({
			description: "Emit JSON instead of a text report.",
			default: false,
		}),
		keep: Flags.boolean({
			description: "Do not delete the scratch workspace after running.",
			default: false,
		}),
		tempDir: Flags.directory({
			description:
				"Scratch workspace directory (default: <repo-root>/.trust-audit-temp).",
		}),
		...BaseCommand.flags,
	} as const;

	public async run(): Promise<void> {
		const context = await this.getContext();
		const repoRoot = context.root;
		const tempDir = path.resolve(this.flags.tempDir ?? path.join(repoRoot, ".trust-audit-temp"));

		const lockfilePath = path.join(repoRoot, "pnpm-lock.yaml");
		this.verbose(`Reading lockfile: ${lockfilePath}`);
		if (!existsSync(lockfilePath)) {
			this.error(`No pnpm-lock.yaml found in ${repoRoot}`);
		}
		const lockfile = parseYaml(readFileSync(lockfilePath, "utf-8")) as {
			packages?: Record<string, unknown>;
			snapshots?: Record<string, unknown>;
		};

		const pinnedSet = collectPinnedVersions(lockfile);
		this.verbose(`Found ${pinnedSet.size} unique name@version entries.`);

		this.verbose(`Materializing scratch workspace at ${tempDir}...`);
		const projectCount = writeAuditWorkspace(tempDir, pinnedSet);
		this.verbose(`Wrote ${projectCount} leaf projects.`);

		const violationSet = new Set<string>();
		let lastResult: PnpmRunResult | undefined;
		let iteration = 0;
		const start = Date.now();
		// eslint-disable-next-line no-constant-condition
		while (true) {
			iteration++;
			const excludeFlags: string[] = [];
			for (const v of [...violationSet].sort()) {
				excludeFlags.push("--trust-policy-exclude", v);
			}
			const installArgs = [
				"install",
				"--recursive",
				"--no-frozen-lockfile",
				"--trust-policy",
				"no-downgrade",
				"--reporter",
				"ndjson",
				...excludeFlags,
			];

			this.verbose(
				`Iteration ${iteration}: pnpm install (excluded so far: ${violationSet.size})`,
			);

			lastResult = await runPnpm(installArgs, tempDir, this.flags.verbose);
			const found = extractTrustViolations(`${lastResult.stdout}\n${lastResult.stderr}`);

			if (lastResult.code === 0) {
				this.verbose("pnpm install succeeded; audit complete.");
				break;
			}

			const newOnes = found.filter((v) => !violationSet.has(v));
			if (newOnes.length === 0) {
				this.verbose(
					`pnpm exited with code ${lastResult.code} but no new trust-policy violations were detected. Stopping.`,
				);
				break;
			}
			for (const v of newOnes) violationSet.add(v);
			for (const v of newOnes) this.verbose(`  + ${v}`);
		}

		const elapsedSec = Number(((Date.now() - start) / 1000).toFixed(1));
		const violations = [...violationSet].sort();
		const exitCode = lastResult?.code ?? 2;

		if (this.flags.json) {
			this.log(
				JSON.stringify(
					{
						tempDir,
						exitCode,
						iterations: iteration,
						elapsedSec,
						totalUniqueDependencies: pinnedSet.size,
						violations,
					},
					undefined,
					2,
				),
			);
		} else {
			this.log(`Audited via pnpm install in: ${tempDir}`);
			this.log(`  Final pnpm exit code: ${exitCode}`);
			this.log(`  Iterations: ${iteration}`);
			this.log(`  Unique pinned versions: ${pinnedSet.size}`);
			this.log(`  Elapsed: ${elapsedSec}s`);
			if (violations.length === 0) {
				this.log("\nNo trust-policy violations detected.");
				if (exitCode !== 0 && !this.flags.verbose) {
					this.log(
						"\nNote: pnpm exited non-zero but no trust-related events were emitted. Re-run with --verbose to see pnpm's full output.",
					);
				}
			} else {
				this.log(`\n${violations.length} trust-policy violation(s):\n`);
				for (const v of violations) this.log(`  ${v}`);
			}
		}

		if (!this.flags.keep) {
			this.verbose(`Cleaning up temp dir: ${tempDir}`);
			rmSync(tempDir, { recursive: true, force: true });
		} else {
			this.verbose(`Leaving temp dir in place: ${tempDir}`);
		}

		if (violations.length > 0) {
			this.exit(1);
		}
	}
}

/**
 * Returns the set of unique `name@version` strings referenced by the
 * lockfile's `packages` (and `snapshots`, when present) sections.
 *
 * Each key has the form `<name>@<version>[(<peerSuffix>)]`. We strip the
 * peer suffix and split on the last `@` so scoped names parse correctly.
 * Entries whose "version" looks like a URL/tarball/git ref are skipped —
 * pnpm's trust policy only applies to registry resolutions.
 *
 * The `packages:` section's structure (a top-level map keyed by
 * `name@version[(peers)]`) has been stable since pnpm v6 (lockfile
 * versions 5.x through 9.x). Newer lockfile versions also expose a
 * `snapshots:` section with the same key shape, which we read when
 * present.
 */
function collectPinnedVersions(lockfile: {
	packages?: Record<string, unknown>;
	snapshots?: Record<string, unknown>;
}): Set<string> {
	const result = new Set<string>();
	for (const key of [
		...Object.keys(lockfile.packages ?? {}),
		...Object.keys(lockfile.snapshots ?? {}),
	]) {
		const parenIndex = key.indexOf("(");
		const stripped = parenIndex >= 0 ? key.slice(0, parenIndex) : key;
		const lastAt = stripped.lastIndexOf("@");
		if (lastAt <= 0) continue;
		const name = stripped.slice(0, lastAt);
		const version = stripped.slice(lastAt + 1);
		if (!name || !version) continue;
		if (/[/:]/.test(version)) continue;
		result.add(`${name}@${version}`);
	}
	return result;
}

/**
 * Builds a filesystem-safe slug for use as a project directory name.
 */
function slugify(name: string, version: string): string {
	const safeName = name.replace(/[^a-zA-Z0-9]+/g, "-").replace(/^-+|-+$/g, "");
	const safeVersion = version.replace(/[^a-zA-Z0-9]+/g, "-").replace(/^-+|-+$/g, "");
	return `${safeName}-${safeVersion}`.toLowerCase();
}

/**
 * Creates `tempDir` containing:
 *   - `pnpm-workspace.yaml` declaring the leaf glob and `trustPolicy: no-downgrade`.
 *   - One leaf project per `(name, version)` under `projects/<slug>/`,
 *     each pulling in exactly one real (non-aliased) dependency.
 *
 * Real dependency names matter: pnpm's `--trust-policy-exclude` matches
 * against the *registry* name, so aliasing breaks the exclude path for
 * any `(name, version)` combination not picked as the canonical one.
 *
 * We avoid putting `trustPolicyExclude` entries in the YAML because
 * pnpm 10's YAML form silently drops double-quoted scalars and rejects
 * bare scoped names; CLI flags are easier to control across iterations.
 */
function writeAuditWorkspace(tempDir: string, pinnedSet: Set<string>): number {
	if (existsSync(tempDir)) {
		rmSync(tempDir, { recursive: true, force: true });
	}
	mkdirSync(tempDir, { recursive: true });

	writeFileSync(path.resolve(tempDir, ".gitignore"), "*\n");
	writeFileSync(
		path.resolve(tempDir, "pnpm-workspace.yaml"),
		[
			"# Generated by `flub check trustPolicy` - do not edit.",
			"packages:",
			"  - 'projects/*'",
			"trustPolicy: no-downgrade",
			"",
		].join("\n"),
	);

	const projectsDir = path.resolve(tempDir, "projects");
	mkdirSync(projectsDir, { recursive: true });
	const usedSlugs = new Map<string, number>();
	let n = 0;
	for (const token of pinnedSet) {
		const lastAt = token.lastIndexOf("@");
		const name = token.slice(0, lastAt);
		const version = token.slice(lastAt + 1);
		let slug = slugify(name, version);
		const collision = usedSlugs.get(slug) ?? 0;
		usedSlugs.set(slug, collision + 1);
		if (collision > 0) slug = `${slug}-${collision}`;

		const projectDir = path.resolve(projectsDir, slug);
		mkdirSync(projectDir, { recursive: true });
		writeFileSync(
			path.resolve(projectDir, "package.json"),
			`${JSON.stringify(
				{
					name: `audit-${n++}`,
					version: "0.0.0",
					private: true,
					dependencies: { [name]: version },
				},
				undefined,
				2,
			)}\n`,
		);
	}
	return n;
}

/**
 * Runs `pnpm` with the given args from `cwd` and captures stdout, stderr,
 * and the exit code. When `streamLive` is true, output is also forwarded
 * to this process so progress is visible during long operations.
 */
function runPnpm(args: string[], cwd: string, streamLive: boolean): Promise<PnpmRunResult> {
	return new Promise((resolveRun, rejectRun) => {
		const child = spawn("pnpm", args, {
			cwd,
			shell: true,
			stdio: ["ignore", "pipe", "pipe"],
			env: { ...process.env, CI: "1" },
		});
		const stdoutChunks: Buffer[] = [];
		const stderrChunks: Buffer[] = [];
		child.stdout?.on("data", (chunk: Buffer) => {
			stdoutChunks.push(chunk);
			if (streamLive) process.stdout.write(chunk);
		});
		child.stderr?.on("data", (chunk: Buffer) => {
			stderrChunks.push(chunk);
			if (streamLive) process.stderr.write(chunk);
		});
		child.on("error", rejectRun);
		child.on("close", (code) => {
			resolveRun({
				code,
				stdout: Buffer.concat(stdoutChunks).toString("utf-8"),
				stderr: Buffer.concat(stderrChunks).toString("utf-8"),
			});
		});
	});
}

/**
 * Scans pnpm's NDJSON-formatted output and returns a sorted, de-duplicated
 * array of `name@version` strings that triggered the trust-downgrade error.
 *
 * Each event carries the offending package as a structured field:
 *   `package: { name, version, bareSpecifier }`.
 * That field holds the *real* registry name even when the dependency was
 * installed via an `npm:` alias, which is exactly what
 * `--trust-policy-exclude` matches against.
 */
function extractTrustViolations(ndjson: string): string[] {
	const found = new Set<string>();
	for (const rawLine of ndjson.split(/\r?\n/)) {
		if (!rawLine) continue;
		// Cheap pre-filter — JSON.parse is comparatively expensive and
		// most lines won't be trust-related.
		if (!rawLine.includes(TRUST_DOWNGRADE_CODE)) continue;
		let event: {
			code?: string;
			err?: { code?: string };
			package?: { name?: string; version?: string };
		};
		try {
			event = JSON.parse(rawLine) as typeof event;
		} catch {
			continue;
		}
		if (event.code !== TRUST_DOWNGRADE_CODE && event.err?.code !== TRUST_DOWNGRADE_CODE) {
			continue;
		}
		const name = event.package?.name;
		const version = event.package?.version;
		if (name && version) {
			found.add(`${name}@${version}`);
		}
	}
	return [...found].sort();
}
