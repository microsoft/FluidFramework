/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { spawn } from "node:child_process";
import { mkdir, stat, rm, writeFile, readFile } from "node:fs/promises";
import path from "node:path";

import { Command, Flags } from "@oclif/core";
import { parseYarnLock, type PinnedVersion } from "./lockfiles.js";

const TRUST_DOWNGRADE_CODE = "ERR_PNPM_TRUST_DOWNGRADE";

interface PnpmRunResult {
	code: number | null;
	stdout: string;
	stderr: string;
}

interface TrustPolicyAuditResult {
	tempDir: string;
	exitCode: number;
	iterations: number;
	elapsedSec: number;
	totalUniqueDependencies: number;
	auditIncomplete: boolean;
	violations: PinnedVersion[];
}

interface DependencyEntry {
	from?: string;
	version?: string;
	resolved?: string;
	dependencies?: Record<string, DependencyEntry>;
	devDependencies?: Record<string, DependencyEntry>;
	peerDependencies?: Record<string, DependencyEntry>;
	optionalDependencies?: Record<string, DependencyEntry>;
}

/**
 * Transplants build-tools' check/trustPolicy command without its build-project dependency.
 * pnpm remains responsible for enumerating dependencies and evaluating trust.
 */
export default class CheckTrustPolicyCommand extends Command {
	static readonly summary = "Audit pnpm dependencies against the no-downgrade trust policy.";
	static readonly description =
		"Creates a scratch workspace with one leaf project per installed registry dependency, then runs pnpm install --trust-policy no-downgrade and iteratively excludes each violation to report the complete set.";
	static readonly enableJsonFlag = true;
	static readonly flags = {
		keep: Flags.boolean({
			description: "Do not delete the scratch workspace after running.",
			default: false,
		}),
		path: Flags.directory({
			description:
				"Path inside the workspace to audit. Uses the nearest enclosing pnpm workspace, or package directory if there is no workspace. Defaults to the current directory.",
			exists: true,
		}),
		lockfile: Flags.file({
			description: "Audit a Yarn lockfile directly, without installing its project.",
			exists: true,
		}),
		tempDir: Flags.directory({
			description:
				"New scratch directory (default: <workspace>/.trust-audit-temp). Must not already exist.",
		}),
		verbose: Flags.boolean({
			char: "v",
			description: "Enable verbose logging.",
			exclusive: ["quiet"],
			default: false,
		}),
		quiet: Flags.boolean({
			description: "Disable logging.",
			exclusive: ["verbose"],
			default: false,
		}),
	} as const;

	public async run(): Promise<TrustPolicyAuditResult> {
		const { flags } = await this.parse(CheckTrustPolicyCommand);
		const info = (message: string): void => {
			if (!flags.quiet) this.log(`INFO: ${message}`);
		};
		const verbose = (message: string): void => {
			if (flags.verbose) info(message);
		};
		const warning = (message: string): void => {
			if (!flags.quiet) this.logToStderr(`WARNING: ${message}`);
		};
		const workspaceDir = flags.lockfile
			? path.dirname(path.resolve(flags.lockfile))
			: await findWorkspace(path.resolve(flags.path ?? process.cwd()));
		const tempDir = path.resolve(
			flags.tempDir ?? path.join(workspaceDir, ".trust-audit-temp"),
		);
		verbose(`Auditing workspace: ${workspaceDir}`);
		const yarnLock = flags.lockfile
			? path.resolve(flags.lockfile)
			: (await isFile(path.join(workspaceDir, "yarn.lock"))) &&
					!(await isFile(path.join(workspaceDir, "pnpm-workspace.yaml")))
				? path.join(workspaceDir, "yarn.lock")
				: undefined;
		let pinned: PinnedVersion[];
		if (yarnLock !== undefined) {
			verbose(`Reading lockfile: ${yarnLock}`);
			pinned = parseYarnLock(await readFile(yarnLock, "utf8"));
		} else {
			verbose("Enumerating installed dependencies via pnpm list -r --json...");
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
			pinned = collectPinnedVersions(listResult.stdout);
		}
		verbose(`Found ${pinned.length} unique name@version entries.`);

		// Never remove a pre-existing user-selected directory to prepare an audit.
		await mkdir(tempDir);
		const violationsByName = new Map<string, Set<string>>();
		let lastResult: PnpmRunResult | undefined;
		let iteration = 0;
		let auditIncomplete = false;
		const start = Date.now();
		try {
			await writeAuditWorkspace(tempDir, pinned);
			while (true) {
				const excludeFlags: string[] = [];
				for (const [name, versions] of [...violationsByName.entries()].sort(
					([left], [right]) => (left < right ? -1 : left > right ? 1 : 0),
				)) {
					// pnpm consults only the first selector matching a name.
					excludeFlags.push(
						"--trust-policy-exclude",
						`${name}@${[...versions].sort().join("||")}`,
					);
				}
				verbose(`Iteration ${iteration}: pnpm install`);
				iteration++;
				lastResult = await runPnpm(
					[
						"install",
						"--recursive",
						"--no-frozen-lockfile",
						"--lockfile-only",
						"--trust-policy",
						"no-downgrade",
						"--reporter",
						"ndjson",
						...excludeFlags,
					],
					tempDir,
					flags.verbose && !this.jsonEnabled(),
				);
				const found = extractTrustViolations(lastResult.stdout);
				if (lastResult.code === 0) break;
				const newViolations = found.filter(
					({ name, version }) => !violationsByName.get(name)?.has(version),
				);
				if (newViolations.length === 0) {
					auditIncomplete = true;
					warning(
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
					verbose(`  + ${name}@${version}`);
				}
			}
		} finally {
			if (flags.keep) {
				verbose(`Leaving temp dir in place: ${tempDir}`);
			} else {
				try {
					await rm(tempDir, { recursive: true, force: true });
				} catch (error) {
					warning(
						`Failed to remove temp dir ${tempDir}: ${error instanceof Error ? error.message : String(error)}. You may need to delete it manually.`,
					);
				}
			}
		}

		const elapsedSec = Number(((Date.now() - start) / 1000).toFixed(1));
		const violations: PinnedVersion[] = [];
		for (const [name, versions] of [...violationsByName.entries()].sort(([left], [right]) =>
			left < right ? -1 : left > right ? 1 : 0,
		)) {
			for (const version of [...versions].sort()) {
				violations.push({ name, version });
			}
		}
		const exitCode = lastResult?.code ?? 2;
		info(`Audited via pnpm install in: ${tempDir}`);
		info(`  Final pnpm exit code: ${exitCode}`);
		info(`  Iterations: ${iteration}`);
		info(`  Unique pinned versions: ${pinned.length}`);
		info(`  Elapsed: ${elapsedSec}s`);
		if (violations.length === 0 && !auditIncomplete) {
			info("\nNo trust-policy violations detected.");
		} else {
			if (violations.length > 0) {
				info(`\n${violations.length} trust-policy violation(s):\n`);
				for (const { name, version } of violations) info(`  ${name}@${version}`);
			}
			if (auditIncomplete) {
				info(
					"\nAudit incomplete. There may be more violations. Re-run with --verbose to see pnpm's full output.",
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
		if (!this.jsonEnabled() && (violations.length > 0 || auditIncomplete)) this.exit(1);
		return result;
	}
}

/**
 * Finds the nearest pnpm workspace, with a standalone package as fallback.
 * @param searchPath - Absolute directory to search from.
 */
export async function findWorkspace(searchPath: string): Promise<string> {
	let packageDir: string | undefined;
	for (let dir = searchPath; ; dir = path.dirname(dir)) {
		if (await isFile(path.join(dir, "pnpm-workspace.yaml"))) return dir;
		if (await isFile(path.join(dir, "yarn.lock"))) return dir;
		if (packageDir === undefined && (await isFile(path.join(dir, "package.json")))) {
			packageDir = dir;
		}
		if (path.dirname(dir) === dir) break;
	}
	if (packageDir !== undefined) return packageDir;
	throw new Error(`No pnpm workspace or package.json contains ${searchPath}.`);
}

async function isFile(file: string): Promise<boolean> {
	try {
		return (await stat(file)).isFile();
	} catch (error) {
		if (error instanceof Error && "code" in error && error.code === "ENOENT") return false;
		throw error;
	}
}

/**
 * Collects registry-resolved versions from pnpm's recursive dependency trees.
 * @param listJsonStdout - JSON emitted by pnpm list.
 */
export function collectPinnedVersions(listJsonStdout: string): PinnedVersion[] {
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
			if (map !== undefined) {
				for (const child of Object.values(map)) visit(child);
			}
		}
	}
	for (const project of projects) visit(project);
	return result;
}

async function writeAuditWorkspace(
	tempDir: string,
	pinned: readonly PinnedVersion[],
): Promise<void> {
	await writeFile(path.join(tempDir, ".gitignore"), "*\n");
	await writeFile(
		path.join(tempDir, "pnpm-workspace.yaml"),
		"# Generated by check-trust-policy - do not edit.\npackages:\n  - 'projects/*'\ntrustPolicy: no-downgrade\n",
	);
	const projectsDir = path.join(tempDir, "projects");
	await mkdir(projectsDir);
	for (const [index, { name, version }] of pinned.entries()) {
		// Numeric names are filesystem-safe and unique without a slugging dependency.
		const projectDir = path.join(projectsDir, String(index));
		await mkdir(projectDir);
		await writeFile(
			path.join(projectDir, "package.json"),
			`${JSON.stringify(
				{
					name: `audit-${index}`,
					version: "0.0.0",
					private: true,
					dependencies: { [name]: version },
				},
				undefined,
				2,
			)}\n`,
		);
	}
}

/**
 * Extracts trust-downgrade events, rejecting changes to pnpm's NDJSON contract.
 * @param ndjsonStdout - Output emitted by pnpm install.
 */
export function extractTrustViolations(ndjsonStdout: string): PinnedVersion[] {
	const found: PinnedVersion[] = [];
	for (const rawLine of ndjsonStdout.split(/\r?\n/)) {
		if (rawLine === "" || !rawLine.includes(TRUST_DOWNGRADE_CODE)) continue;
		let event: {
			code?: string;
			package?: { name?: string; version?: string };
		};
		try {
			event = JSON.parse(rawLine) as typeof event;
		} catch (error) {
			throw new Error(
				`Found stdout line containing "${TRUST_DOWNGRADE_CODE}" but failed to parse as JSON: ${rawLine}`,
				{ cause: error },
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

/**
 * Starts pnpm, including its Windows command shim, and waits for both output streams.
 * @param args - pnpm arguments.
 * @param cwd - Working directory.
 * @param streamLive - Whether to forward output.
 */
export async function runPnpm(
	args: string[],
	cwd: string,
	streamLive: boolean,
): Promise<PnpmRunResult> {
	let command = "pnpm";
	let commandArgs = args;
	const windows = process.platform === "win32";
	if (windows) {
		// cmd is needed for pnpm.cmd. Quote selectors so || is not a shell operator.
		// Quotes, percent expansion, and newlines cannot occur in these generated arguments.
		if (args.some((arg) => /["%\r\n\0]/.test(arg))) {
			throw new Error("Cannot safely pass pnpm arguments to the Windows command shim.");
		}
		command = process.env.ComSpec ?? "cmd.exe";
		commandArgs = [
			"/d",
			"/v:off",
			"/s",
			"/c",
			`"pnpm ${args.map((arg) => `"${arg}"`).join(" ")}"`,
		];
	}
	const subprocess = spawn(command, commandArgs, {
		cwd,
		env: { ...process.env, CI: "1" },
		stdio: ["ignore", "pipe", "pipe"],
		windowsVerbatimArguments: windows,
	});
	let stdout = "";
	let stderr = "";
	subprocess.stdout.setEncoding("utf8");
	subprocess.stderr.setEncoding("utf8");
	subprocess.stdout.on("data", (chunk: string) => {
		stdout += chunk;
		if (streamLive) process.stdout.write(chunk);
	});
	subprocess.stderr.on("data", (chunk: string) => {
		stderr += chunk;
		if (streamLive) process.stderr.write(chunk);
	});
	return new Promise((resolve, reject) => {
		subprocess.once("error", reject);
		subprocess.once("close", (code) => resolve({ code, stdout, stderr }));
	});
}
