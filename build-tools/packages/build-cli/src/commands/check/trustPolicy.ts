/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { mkdir, rm, writeFile } from "node:fs/promises";
import path from "node:path";

import { Flags } from "@oclif/core";
import execa from "execa";
import GithubSlugger from "github-slugger";

import { BaseCommandWithBuildProject } from "../../library/commands/base.js";

/**
 * The error code pnpm emits (both as the top-level `code` and inside `err`)
 * when `trustPolicy: no-downgrade` rejects an install.
 */
const TRUST_DOWNGRADE_CODE = "ERR_PNPM_TRUST_DOWNGRADE";

interface PinnedVersion {
	name: string;
	version: string;
}

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
 *
 * 1. Run `pnpm list -r --json --depth Infinity` at the repo root and
 * walk every `(name, version)` pair reachable through any project's
 * `dependencies` / `devDependencies` / `peerDependencies` /
 * `optionalDependencies` tree.
 * 2. Materialize a scratch workspace at `<repoRoot>/.trust-audit-temp/`
 * with one leaf project per `(name, version)`. Each leaf depends on
 * the *real* registry name (no `npm:` aliases) because pnpm 10's
 * `--trust-policy-exclude` matches the registry name (and optional
 * exact version), not the alias.
 * 3. Run `pnpm install` against the scratch workspace with NDJSON
 * reporting. pnpm aborts at the first violation; we add the
 * offender to the exclude list and re-run, repeating until pnpm
 * either succeeds or stops surfacing new violations.
 *
 * See https://github.com/pnpm/pnpm/issues/10622 for the bug that motivated
 * this command.
 */
export default class CheckTrustPolicyCommand extends BaseCommandWithBuildProject<
	typeof CheckTrustPolicyCommand
> {
	static readonly summary =
		"Audits the repo's lockfile against pnpm's `no-downgrade` trust policy.";

	static readonly description =
		"Materializes a scratch workspace under `.trust-audit-temp/` containing one leaf project per pinned dependency, then runs `pnpm install --trust-policy no-downgrade` and iteratively excludes each violation until pnpm either succeeds or stops surfacing new violations. Reports the full list of trust-downgrade violations.";

	static readonly enableJsonFlag = true;

	static readonly flags = {
		keep: Flags.boolean({
			description: "Do not delete the scratch workspace after running.",
			default: false,
		}),
		path: Flags.directory({
			description:
				"Path inside the workspace to audit. The most specific workspace (e.g. a release group like `server/routerlicious` rather than the repo root) containing this path is used. Defaults to the current working directory.",
			exists: true,
		}),
		tempDir: Flags.directory({
			description: "Scratch workspace directory (default: <workspace>/.trust-audit-temp).",
		}),
		...BaseCommandWithBuildProject.flags,
	} as const;

	public async run(): Promise<TrustPolicyAuditResult> {
		const searchPath = path.resolve(this.flags.path ?? process.cwd());
		const buildProject = this.getBuildProject(searchPath);
		// Pick the most specific workspace containing `searchPath`. Workspaces
		// in this repo nest (e.g. `server/routerlicious` lives inside the root
		// workspace), so longest-prefix wins.
		let workspaceDir: string | undefined;
		for (const ws of buildProject.workspaces.values()) {
			const dir = path.resolve(ws.directory);
			if (
				(searchPath === dir || searchPath.startsWith(`${dir}${path.sep}`)) &&
				(workspaceDir === undefined || dir.length > workspaceDir.length)
			) {
				workspaceDir = dir;
			}
		}
		if (workspaceDir === undefined) {
			this.error(`No workspace in build project ${buildProject.root} contains ${searchPath}.`);
		}
		this.verbose(`Auditing workspace: ${workspaceDir}`);
		const tempDir = path.resolve(
			this.flags.tempDir ?? path.join(workspaceDir, ".trust-audit-temp"),
		);

		this.verbose("Enumerating installed dependencies via pnpm list -r --json...");
		const listResult = await runPnpm(
			["list", "--recursive", "--json", "--depth", "Infinity"],
			workspaceDir,
			false,
		);
		if (listResult.code !== 0) {
			this.error(
				`pnpm list exited with code ${listResult.code}. stderr:\n${listResult.stderr}`,
			);
		}

		const pinned = collectPinnedVersions(listResult.stdout);
		this.verbose(`Found ${pinned.length} unique name@version entries.`);

		this.verbose(`Materializing scratch workspace at ${tempDir}...`);
		const projectCount = await writeAuditWorkspace(tempDir, pinned);
		this.verbose(`Wrote ${projectCount} leaf projects.`);

		// Map of registry name → set of offending versions. We accumulate
		// violations here across iterations so each pnpm invocation can be
		// re-run with the union of all known offenders excluded.
		const violationsByName = new Map<string, Set<string>>();
		let lastResult: PnpmRunResult | undefined;
		let iteration = 0;
		let auditIncomplete = false;
		const start = Date.now();
		try {
			// eslint-disable-next-line no-constant-condition
			while (true) {
				const excludeFlags: string[] = [];
				// Pass each excluded package name once with its versions joined
				// by `||` (pnpm's "exact-versions union" syntax). For example:
				//   --trust-policy-exclude semver@5.7.2||6.3.1
				//
				// This is required because pnpm's `evaluateVersionPolicy` only
				// consults the FIRST rule matching a given package name (see
				// `parseVersionPolicyRule`/`evaluateVersionPolicy` in pnpm.cjs).
				// Passing multiple `--trust-policy-exclude semver@<v>` flags
				// silently drops all but the first.
				//
				// The `||` union form is documented under `trustPolicyExclude`
				// (https://pnpm.io/settings#trustpolicyexclude), where the
				// example `'webpack@4.47.0 || 5.102.1'` excludes both versions
				// of webpack.
				for (const name of [...violationsByName.keys()].sort()) {
					// eslint-disable-next-line @typescript-eslint/no-non-null-assertion
					const versions = [...violationsByName.get(name)!].sort();
					excludeFlags.push("--trust-policy-exclude", `${name}@${versions.join("||")}`);
				}
				const installArgs = [
					"install",
					"--recursive",
					"--no-frozen-lockfile",
					"--lockfile-only",
					"--trust-policy",
					"no-downgrade",
					"--reporter",
					"ndjson",
					...excludeFlags,
				];

				const excludedCount = countViolations(violationsByName);
				this.verbose(
					`Iteration ${iteration}: pnpm install (excluded so far: ${excludedCount})`,
				);
				iteration++;

				lastResult = await runPnpm(installArgs, tempDir, this.flags.verbose);
				const found = extractTrustViolations(lastResult.stdout);

				if (lastResult.code === 0) {
					this.verbose("pnpm install succeeded; audit complete.");
					break;
				}

				const newViolations = found.filter(
					({ name, version }) => violationsByName.get(name)?.has(version) !== true,
				);
				if (newViolations.length === 0) {
					// pnpm exited non-zero without surfacing a new trust-policy
					// violation. That means something else went wrong (network,
					// auth, a pnpm behavior change, etc.) and the audit is no
					// longer trustworthy: we have no way to know whether more
					// violations exist beyond the ones already collected. Mark
					// the audit incomplete so we exit non-zero below; otherwise
					// CI would treat a failed audit as passing.
					auditIncomplete = true;
					this.warning(
						`pnpm exited with code ${lastResult.code} but no new trust-policy violations were detected. Audit is incomplete; re-run with --verbose to see pnpm's full output.`,
					);
					break;
				}
				for (const { name, version } of newViolations) {
					let versions = violationsByName.get(name);
					if (versions === undefined) {
						versions = new Set<string>();
						violationsByName.set(name, versions);
					}
					versions.add(version);
					this.verbose(`  + ${name}@${version}`);
				}
			}
		} finally {
			if (this.flags.keep) {
				this.verbose(`Leaving temp dir in place: ${tempDir}`);
			} else {
				this.verbose(`Cleaning up temp dir: ${tempDir}`);
				// Cleanup is best-effort: on Windows, pnpm's content-addressed
				// store leaves hardlinks that AV scanners or lingering child
				// processes can briefly hold open, and we don't want a stale
				// lock to mask the audit's exit code or hide the violations
				// the user actually came here for. Surface a warning so the
				// user knows to clean up manually (or re-run with --keep).
				try {
					await rm(tempDir, { recursive: true, force: true });
				} catch (err) {
					this.warning(
						`Failed to remove temp dir ${tempDir}: ${err instanceof Error ? err.message : String(err)}. You may need to delete it manually.`,
					);
				}
			}
		}

		const elapsedSec = Number(((Date.now() - start) / 1000).toFixed(1));

		// Flatten `violationsByName` into a stable, deterministic array so the
		// printed list and the JSON payload don't reorder across runs (Map and
		// Set both preserve insertion order, which depends on pnpm's emission
		// order across iterations). Sort by name, then by version within each
		// name. This is the only consumer of `violationsByName` after the loop.
		const violations: PinnedVersion[] = [];
		for (const name of [...violationsByName.keys()].sort()) {
			// eslint-disable-next-line @typescript-eslint/no-non-null-assertion
			for (const version of [...violationsByName.get(name)!].sort()) {
				violations.push({ name, version });
			}
		}
		const exitCode = lastResult?.code ?? 2;

		this.info(`Audited via pnpm install in: ${tempDir}`);
		this.info(`  Final pnpm exit code: ${exitCode}`);
		this.info(`  Iterations: ${iteration}`);
		this.info(`  Unique pinned versions: ${pinned.length}`);
		this.info(`  Elapsed: ${elapsedSec}s`);
		if (violations.length === 0) {
			if (auditIncomplete) {
				this.info(
					"\nAudit incomplete: pnpm exited non-zero but no trust-policy events were emitted. Re-run with --verbose to see pnpm's full output.",
				);
			} else {
				this.info("\nNo trust-policy violations detected.");
			}
		} else {
			this.info(`\n${violations.length} trust-policy violation(s):\n`);
			for (const { name, version } of violations) {
				this.info(`  ${name}@${version}`);
			}
			if (auditIncomplete) {
				this.info(
					"\nAudit incomplete: pnpm exited non-zero after the violations above without surfacing a new event. There may be more violations. Re-run with --verbose to see pnpm's full output.",
				);
			}
		}

		const result: TrustPolicyAuditResult = {
			tempDir,
			exitCode,
			iterations: iteration,
			elapsedSec,
			totalUniqueDependencies: pinned.length,
			auditIncomplete,
			violations,
		};

		// In text mode we exit non-zero on failure so CI fails. In JSON mode
		// (handled by oclif via `enableJsonFlag`) we return the structured
		// result instead, so downstream tooling can pipe the output without
		// losing it to a non-zero exit.
		if (!this.jsonEnabled() && (violations.length > 0 || auditIncomplete)) {
			this.exit(1);
		}

		return result;
	}
}

/**
 * Structured result emitted by `flub check trustPolicy --json`.
 */
interface TrustPolicyAuditResult {
	tempDir: string;
	exitCode: number;
	iterations: number;
	elapsedSec: number;
	totalUniqueDependencies: number;
	auditIncomplete: boolean;
	violations: PinnedVersion[];
}

/**
 * Counts the total number of `(name, version)` pairs in a violations map.
 */
function countViolations(violationsByName: ReadonlyMap<string, ReadonlySet<string>>): number {
	let count = 0;
	for (const versions of violationsByName.values()) {
		count += versions.size;
	}
	return count;
}

/**
 * Walks the JSON output of `pnpm list -r --json --depth Infinity` and returns
 * the set of unique `name@version` strings for every dependency resolved
 * from a registry.
 *
 * pnpm's output is an array of workspace project nodes. Each node and each
 * nested dependency entry can carry `dependencies`, `devDependencies`,
 * `peerDependencies`, and `optionalDependencies` maps. Each map value has
 * a `from` field (the *real* registry name, even when installed via an
 * `npm:` alias) and a `version` field. Registry-resolved entries also
 * carry a `resolved` URL — workspace, link, file, and git installs do not,
 * so requiring `resolved` is what filters the audit down to the dependencies
 * pnpm's trust policy actually applies to.
 */
function collectPinnedVersions(listJsonStdout: string): PinnedVersion[] {
	interface DependencyEntry {
		from?: string;
		version?: string;
		resolved?: string;
		dependencies?: Record<string, DependencyEntry>;
		devDependencies?: Record<string, DependencyEntry>;
		peerDependencies?: Record<string, DependencyEntry>;
		optionalDependencies?: Record<string, DependencyEntry>;
	}

	const projects = JSON.parse(listJsonStdout) as DependencyEntry[];
	const seen = new Set<string>();
	const result: PinnedVersion[] = [];

	function visit(entry: DependencyEntry): void {
		if (
			entry.from !== undefined &&
			entry.version !== undefined &&
			entry.resolved !== undefined &&
			/^https?:\/\//.test(entry.resolved)
		) {
			const token = `${entry.from}@${entry.version}`;
			if (!seen.has(token)) {
				seen.add(token);
				result.push({ name: entry.from, version: entry.version });
			}
		}
		for (const map of [
			entry.dependencies,
			entry.devDependencies,
			entry.peerDependencies,
			entry.optionalDependencies,
		]) {
			if (map === undefined) continue;
			for (const child of Object.values(map)) {
				visit(child);
			}
		}
	}

	for (const project of projects) {
		visit(project);
	}

	return result;
}

/**
 * Builds `tempDir` containing:
 *
 * - `pnpm-workspace.yaml` declaring the leaf glob and `trustPolicy: no-downgrade`.
 * - One leaf project per `(name, version)` under `projects/<slug>/`,
 * each pulling in exactly one real (non-aliased) dependency.
 *
 * Real dependency names matter: pnpm's `--trust-policy-exclude` matches
 * against the *registry* name (with optional exact version), so aliasing
 * breaks the exclude path for any `(name, version)` combination not
 * picked as the canonical one.
 *
 * We avoid putting `trustPolicyExclude` entries in the YAML because
 * pnpm 10's YAML form silently drops double-quoted scalars and rejects
 * bare scoped names; CLI flags are easier to control across iterations.
 *
 * @returns The number of leaf projects written (one per entry in `pinned`).
 */
async function writeAuditWorkspace(
	tempDir: string,
	pinned: readonly PinnedVersion[],
): Promise<number> {
	// `rm` with `force: true` is a no-op if the path doesn't exist, so just
	// try to remove it (avoids a race with an existence check).
	try {
		await rm(tempDir, { recursive: true, force: true });
	} catch (err) {
		throw new Error(
			`Cannot prepare scratch workspace: failed to remove existing temp dir ${tempDir}: ${err instanceof Error ? err.message : String(err)}. Delete it manually or pass a different --tempDir.`,
		);
	}
	await mkdir(tempDir, { recursive: true });

	await writeFile(path.resolve(tempDir, ".gitignore"), "*\n");
	await writeFile(
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
	await mkdir(projectsDir, { recursive: true });
	// `GithubSlugger` produces a filesystem-safe slug and auto-suffixes
	// duplicates against its own internal seen-set, so we don't need to
	// track collisions ourselves.
	const slugger = new GithubSlugger();
	let packageEntryCount = 0;
	for (const { name, version } of pinned) {
		const slug = slugger.slug(`${name} ${version}`);
		const projectDir = path.resolve(projectsDir, slug);
		await mkdir(projectDir, { recursive: true });
		await writeFile(
			path.resolve(projectDir, "package.json"),
			`${JSON.stringify(
				{
					name: `audit-${packageEntryCount}`,
					version: "0.0.0",
					private: true,
					dependencies: { [name]: version },
				},
				undefined,
				2,
			)}\n`,
		);
		packageEntryCount++;
	}
	return packageEntryCount;
}

/**
 * Runs `pnpm` with the given args from `cwd` and captures stdout, stderr,
 * and the exit code. When `streamLive` is true, output is also forwarded
 * to this process so progress is visible during long operations.
 */
async function runPnpm(
	args: string[],
	cwd: string,
	streamLive: boolean,
): Promise<PnpmRunResult> {
	const subprocess = execa("pnpm", args, {
		cwd,
		reject: false,
		stdin: "ignore",
		env: { ...process.env, CI: "1" },
	});
	if (streamLive) {
		subprocess.stdout?.on("data", (chunk: Buffer) => process.stdout.write(chunk));
		subprocess.stderr?.on("data", (chunk: Buffer) => process.stderr.write(chunk));
	}
	const result = await subprocess;
	return {
		code: result.exitCode,
		stdout: result.stdout,
		stderr: result.stderr,
	};
}

/**
 * Scans pnpm's NDJSON stdout for trust-downgrade events and returns the
 * `(name, version)` pairs that triggered the error, in the order pnpm
 * emitted them. The caller is responsible for de-duplication.
 *
 * pnpm's `--reporter ndjson` writes every event (including errors) to stdout
 * as one JSON object per line. The trust-downgrade error reaches this stream
 * via pnpm's top-level catch, which calls `logger.error(err, err)`. Bole
 * copies the error's own properties (including `code` and `package`) to the
 * top level of the emitted event, so we can read `event.code` and
 * `event.package.{name,version}` directly.
 *
 * Any malformed line, unrecognized event code, or missing package fields
 * indicate that pnpm's contract has changed and we throw to surface it.
 */
function extractTrustViolations(ndjsonStdout: string): PinnedVersion[] {
	const found: PinnedVersion[] = [];

	for (const rawLine of ndjsonStdout.split(/\r?\n/)) {
		// Skip blank lines and any line that can't possibly be a trust-downgrade
		// event. The substring check is a cheap pre-filter so we only pay the
		// JSON.parse cost on lines that are actually relevant.
		if (rawLine === "" || !rawLine.includes(TRUST_DOWNGRADE_CODE)) {
			continue;
		}
		let event: {
			code?: string;
			package?: { name?: string; version?: string };
		};
		try {
			event = JSON.parse(rawLine) as typeof event;
		} catch (err) {
			throw new Error(
				`Found stdout line containing "${TRUST_DOWNGRADE_CODE}" but failed to parse as JSON: ${rawLine}\n${err instanceof Error ? err.message : String(err)}`,
			);
		}
		if (event.code !== TRUST_DOWNGRADE_CODE) {
			throw new Error(
				`Found stdout line containing "${TRUST_DOWNGRADE_CODE}" but event.code did not match: ${rawLine}`,
			);
		}
		const name = event.package?.name;
		const version = event.package?.version;
		if (name === undefined || version === undefined) {
			throw new Error(
				`pnpm emitted a "${TRUST_DOWNGRADE_CODE}" event without a package name and version: ${rawLine}`,
			);
		}
		found.push({ name, version });
	}

	return found;
}
