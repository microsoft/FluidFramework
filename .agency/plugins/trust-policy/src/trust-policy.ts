#!/usr/bin/env node
/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { spawn } from "node:child_process";
import { realpathSync, readFileSync } from "node:fs";
import { mkdir, rm, writeFile, readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { redact } from "@npmcli/redact";
import { Command, Flags, execute } from "@oclif/core";
import { mergePackageVersionSpecs } from "@pnpm/config.version-policy";
import { findWorkspaceDir } from "@pnpm/find-workspace-dir";
import * as find from "empathic/find";
import * as walk from "empathic/walk";
import semver from "semver";
import { createTrustPolicyExclude, parseTrustPolicyExcludeConfig } from "./exclusions.js";
import { parseYarnLock, parseNpmLock, type PinnedVersion } from "./lockfiles.js";
import { checkPackage, type PackageCheckResult, type Verdict } from "./package-check.js";
import {
	azureArtifactsReason,
	type Endpoint,
	type EndpointAccess,
	findBlockedEndpoints,
	formatEndpointAccess,
	isAzureArtifactsRegistry,
	npmRegistryEndpoint,
	parseRegistryConfig,
	planEndpoints,
	probeEndpoints,
	publicRegistries,
	sigstoreTufEndpoint,
} from "./registry-access.js";

const TRUST_DOWNGRADE_CODE = "ERR_PNPM_TRUST_DOWNGRADE";

/**
 * Oldest pnpm whose trust evaluation matches this checker.
 * pnpm {@link https://pnpm.io/blog/releases/10.21 | 10.21} added `trustPolicy: no-downgrade`,
 * {@link https://pnpm.io/blog/releases/10.22 | 10.22} added `trustPolicyExclude`, and
 * {@link https://pnpm.io/blog/releases/10.24 | 10.24} stopped prerelease trust evidence from blocking stable releases, matching single-package `no-downgrade`.
 */
const minimumPnpmVersion = "10.24.0";

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
	/**
	 * The pnpm workspace's effective `trustPolicyExclude` selectors. Empty for Yarn and npm lockfiles.
	 */
	trustPolicyExclude: string[];
	/**
	 * Violations covered by `trustPolicyExclude`, whether or not they are listed in `violations`.
	 */
	excludedViolationCount: number;
	violations: TrustPolicyViolation[];
	/**
	 * Reachability of the network endpoints the audit uses, and of public registries for information. Absent with `--no-registry-check`.
	 */
	endpointAccess?: EndpointAccess[];
}

interface TrustPolicyViolation extends PinnedVersion {
	/**
	 * The `trustPolicyExclude` selector covering this violation. Present only with `--include-excluded`.
	 */
	excludedBy?: string;
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
	static readonly summary = "Audit dependency trust or verify a single package's provenance.";
	static readonly description =
		"Audit pnpm dependencies or Yarn/npm lockfiles using pnpm's no-downgrade policy. pnpm workspace audits honor trustPolicyExclude unless --include-excluded is passed. With --package name@version, check cryptographic provenance (default), registry metadata, or no-downgrade history and suggest an attested alternative when rejected. Provenance does not establish that package code is harmless.";
	static readonly enableJsonFlag = true;
	static readonly flags = {
		keep: Flags.boolean({
			description: "Do not delete the scratch workspace after running.",
			default: false,
		}),
		path: Flags.directory({
			description:
				"Path inside the project to audit. Detects the nearest pnpm workspace, Yarn lockfile, or npm lockfile. Defaults to the current directory.",
			exists: true,
		}),
		lockfile: Flags.file({
			description: "Audit a Yarn or npm lockfile directly, without installing its project.",
			exists: true,
			exclusive: ["package"],
		}),
		package: Flags.string({
			description:
				"Check one exact name@version and suggest an attested alternative if rejected.",
			exclusive: ["path", "lockfile", "tempDir", "keep"],
		}),
		policy: Flags.string({
			description: "Single-package policy (default: cryptographic).",
			options: ["cryptographic", "metadata", "no-downgrade"] as const,
			dependsOn: ["package"],
		}),
		registry: Flags.string({
			description:
				"HTTPS registry for single-package mode (default: https://registry.npmjs.org).",
			dependsOn: ["package"],
		}),
		"max-candidates": Flags.integer({
			description: "Maximum alternative releases to check (default: 20).",
			min: 1,
			dependsOn: ["package"],
		}),
		"include-excluded": Flags.boolean({
			description:
				"Also report and fail on violations covered by the pnpm workspace's trustPolicyExclude.",
			default: false,
			exclusive: ["package"],
		}),
		"registry-check": Flags.boolean({
			description:
				"Probe the registries and Sigstore endpoints this mode needs, and public registries for information, before starting. Stop early if a required endpoint is blocked.",
			default: true,
			allowNo: true,
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

	public async run(): Promise<
		TrustPolicyAuditResult | (PackageCheckResult & { endpointAccess?: EndpointAccess[] })
	> {
		const { flags } = await this.parse(CheckTrustPolicyCommand);
		let endpointAccess: EndpointAccess[] | undefined;
		/**
		 * Probes endpoints that have not been probed yet, then stops if any required endpoint is unreachable.
		 * Endpoints are compared by URL, so a public registry probed for information becomes required when the command uses it.
		 */
		const requireEndpoints = async (endpoints: readonly Endpoint[], remedy: string) => {
			if (!flags["registry-check"]) {
				return;
			}
			const known = endpointAccess ?? [];
			const unprobed = endpoints.filter(
				({ url }) => !known.some((entry) => entry.url === url),
			);
			const probed = await probeEndpoints(unprobed);
			const upgraded = new Set<string>();
			const merged = known.map((entry) => {
				const needed = endpoints.find(({ url }) => url === entry.url);
				if (
					needed === undefined ||
					(needed.purpose === entry.purpose && needed.required === entry.required)
				) {
					return entry;
				}
				upgraded.add(entry.url);
				return { ...entry, ...needed };
			});
			endpointAccess = [...merged, ...probed];
			if (!flags.quiet && (probed.length > 0 || upgraded.size > 0)) {
				if (known.length === 0) {
					this.log("Network access (from Node.js):");
				}
				const lines = formatEndpointAccess(endpointAccess);
				endpointAccess.forEach(({ url }, index) => {
					if (index >= merged.length || upgraded.has(url)) {
						this.log(lines[index]);
					}
				});
			}
			const blocked = findBlockedEndpoints(
				endpointAccess.filter(({ url }) => endpoints.some((endpoint) => endpoint.url === url)),
			);
			if (blocked.length > 0) {
				// Text mode has already printed the table; JSON errors carry no result object.
				const summary = this.jsonEnabled()
					? ` Network access: ${formatEndpointAccess(endpointAccess)
							.map((line) => line.trim().replace(/\s+/g, " "))
							.join("; ")}.`
					: "";
				this.error(
					`${blocked.map(({ url, detail }) => `${url} is blocked (${detail})`).join("; ")}. ${remedy}${summary}`,
				);
			}
		};
		if (flags.package !== undefined) {
			if (flags.registry !== undefined && isAzureArtifactsRegistry(flags.registry)) {
				this.error(
					`--registry ${redact(flags.registry)} is an Azure Artifacts feed. ${azureArtifactsReason} Omit --registry to use https://registry.npmjs.org, or pass a registry that serves npm attestations.`,
				);
			}
			const policy = flags.policy ?? "cryptographic";
			if (policy !== "cryptographic" && policy !== "metadata" && policy !== "no-downgrade") {
				this.error(`Unsupported package policy: ${policy}`);
			}
			const needed = [
				npmRegistryEndpoint(
					flags.registry ?? publicRegistries[0],
					"package metadata and attestations",
				),
			];
			if (policy === "cryptographic") {
				needed.push(sigstoreTufEndpoint("Sigstore trusted root for verification", true));
			} else if (policy === "no-downgrade") {
				needed.push(
					sigstoreTufEndpoint("Sigstore trusted root for verifying alternatives", false),
				);
			}
			await requireEndpoints(
				planEndpoints(needed),
				"Pass --registry with a reachable HTTPS registry that serves npm attestations, or check access to Sigstore.",
			);
			const result = await checkPackage(flags.package, {
				policy,
				...(flags.registry === undefined ? {} : { registry: flags.registry }),
				...(flags["max-candidates"] === undefined
					? {}
					: { maxCandidates: flags["max-candidates"] }),
			});
			if (!flags.quiet) {
				this.log(
					`${flags.package}: ${describeVerdict(result.requested.verdict)} (${result.policy})`,
				);
				this.log(result.requested.reason);
				if (result.alternative) {
					this.log(
						`Alternative: ${result.alternative.name}@${result.alternative.version} — ${result.alternative.reason}`,
					);
				} else if (result.requested.verdict === "rejected") {
					this.log("No acceptable alternative found within the search limit.");
				}
				if (result.auditIncomplete) {
					this.logToStderr(
						`WARNING: Incomplete verification or alternative search. ${result.errors.join("; ")}`,
					);
				}
				this.log(result.disclaimer);
			}
			if (
				!this.jsonEnabled() &&
				(result.requested.verdict !== "accepted" || result.auditIncomplete)
			) {
				this.exit(1);
			}
			return endpointAccess === undefined ? result : { ...result, endpointAccess };
		}
		await requireEndpoints(planEndpoints([]), "");
		const info = (message: string): void => {
			if (!flags.quiet) {
				this.log(`INFO: ${message}`);
			}
		};
		const verbose = (message: string): void => {
			if (flags.verbose) {
				info(message);
			}
		};
		const warning = (message: string): void => {
			if (!flags.quiet) {
				this.logToStderr(`WARNING: ${message}`);
			}
		};
		const workspace: Workspace = flags.lockfile
			? {
					dir: path.dirname(path.resolve(flags.lockfile)),
					lockfile: path.resolve(flags.lockfile),
				}
			: await findWorkspace(path.resolve(flags.path ?? process.cwd()));
		const { dir: workspaceDir, lockfile } = workspace;
		const tempDir = path.resolve(
			flags.tempDir ?? path.join(workspaceDir, ".trust-audit-temp"),
		);
		verbose(`Auditing workspace: ${workspaceDir}`);
		let pinned: PinnedVersion[];
		let trustPolicyExclude: string[] = [];
		if (lockfile !== undefined) {
			verbose(`Reading lockfile: ${lockfile}`);
			const source = await readFile(lockfile, "utf8");
			pinned = source.trimStart().startsWith("{")
				? parseNpmLock(source)
				: parseYarnLock(source);
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
			// pnpm resolves workspace, global, and environment configuration for us.
			const configResult = await runPnpm(
				["config", "get", "trustPolicyExclude", "--json"],
				workspaceDir,
				false,
			);
			if (configResult.code !== 0) {
				this.error(
					`pnpm config get trustPolicyExclude exited with code ${configResult.code}. stderr:\n${configResult.stderr}`,
				);
			}
			trustPolicyExclude = parseTrustPolicyExcludeConfig(configResult.stdout);
		}
		const excludedBy = createTrustPolicyExclude(trustPolicyExclude);
		verbose(`Found ${pinned.length} unique name@version entries.`);
		if (trustPolicyExclude.length > 0) {
			verbose(`trustPolicyExclude: ${trustPolicyExclude.join(", ")}`);
		}

		// Never remove a pre-existing user-selected directory to prepare an audit.
		await mkdir(tempDir);
		const violationsByName = new Map<string, Set<string>>();
		let lastResult: PnpmRunResult | undefined;
		let iteration = 0;
		let auditIncomplete = false;
		const start = Date.now();
		try {
			await writeAuditWorkspace(tempDir, pinned);
			// Check the pnpm that runs the audit install, which can differ from the workspace's.
			const pnpmVersion = (await runPnpm(["--version"], tempDir, false)).stdout.trim();
			if (semver.valid(pnpmVersion) === null || semver.lt(pnpmVersion, minimumPnpmVersion)) {
				this.error(
					`Dependency audits require pnpm ${minimumPnpmVersion} or later on PATH; found ${pnpmVersion || "no version"}.`,
				);
			}
			verbose(`pnpm version: ${pnpmVersion}`);
			// Resolve configuration where the audit install runs, since it may differ from the workspace's.
			const configList = await runPnpm(["config", "list", "--json"], tempDir, false);
			if (configList.code !== 0) {
				this.error(`pnpm config list exited with code ${configList.code}.`);
			}
			// The full configuration includes credentials; only registry URLs are used.
			const registryConfig = parseRegistryConfig(configList.stdout);
			const registry = registryConfig.registry ?? publicRegistries[0];
			verbose(`pnpm registry: ${redact(registry)}`);
			if (isAzureArtifactsRegistry(registry)) {
				this.error(
					`pnpm resolves packages from the Azure Artifacts feed ${redact(registry)}. ${azureArtifactsReason} pnpm would report no trust downgrades even when published packages have them. Point pnpm at the public registry for the audit by setting the environment variable pnpm_config_registry=https://registry.npmjs.org/ (pnpm 11+) or npm_config_registry=https://registry.npmjs.org/ (pnpm 10).`,
				);
			}
			await requireEndpoints(
				[npmRegistryEndpoint(registry, "pnpm package resolution")],
				"pnpm needs this registry to evaluate trust. Configure a reachable registry or pass --no-registry-check if pnpm uses a proxy.",
			);
			for (const [scope, scopeRegistry] of registryConfig.scoped) {
				if (!isAzureArtifactsRegistry(scopeRegistry)) {
					continue;
				}
				const count = pinned.filter(({ name }) => name.startsWith(`${scope}/`)).length;
				if (count > 0) {
					warning(
						`${count} ${scope} package version(s) resolve from the Azure Artifacts feed ${redact(scopeRegistry)}. Their trust cannot be evaluated.`,
					);
				}
			}
			while (true) {
				// pnpm consults only the first selector matching a name, so merge each name's versions into one selector.
				const excludeFlags = mergePackageVersionSpecs(
					[...violationsByName].flatMap(([name, versions]) =>
						[...versions].map((version) => `${name}@${version}`),
					),
				).flatMap((selector) => ["--trust-policy-exclude", selector]);
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
				if (lastResult.code === 0) {
					break;
				}
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
		const violations: TrustPolicyViolation[] = [];
		let excludedViolationCount = 0;
		for (const [name, versions] of [...violationsByName.entries()].sort(([left], [right]) =>
			left < right ? -1 : left > right ? 1 : 0,
		)) {
			for (const version of [...versions].sort()) {
				const selector = excludedBy(name, version);
				if (selector === undefined) {
					violations.push({ name, version });
					continue;
				}
				excludedViolationCount++;
				if (flags["include-excluded"]) {
					violations.push({ name, version, excludedBy: selector });
				}
			}
		}
		const exitCode = lastResult?.code ?? 2;
		info(`Audited via pnpm install in: ${tempDir}`);
		info(`  Final pnpm exit code: ${exitCode}`);
		info(`  Iterations: ${iteration}`);
		info(`  Unique pinned versions: ${pinned.length}`);
		info(`  Elapsed: ${elapsedSec}s`);
		if (violations.length === 0 && !auditIncomplete) {
			info(
				excludedViolationCount === 0
					? "\nNo trust-policy violations detected."
					: "\nNo trust-policy violations detected outside trustPolicyExclude.",
			);
		} else {
			if (violations.length > 0) {
				info(`\n${violations.length} trust-policy violation(s):\n`);
				for (const { name, version, excludedBy: selector } of violations) {
					info(
						`  ${name}@${version}${selector === undefined ? "" : ` (excluded by trustPolicyExclude "${selector}")`}`,
					);
				}
			}
			if (auditIncomplete) {
				info(
					"\nAudit incomplete. There may be more violations. Re-run with --verbose to see pnpm's full output.",
				);
			}
		}
		if (excludedViolationCount > 0 && !flags["include-excluded"]) {
			info(
				`${excludedViolationCount} violation(s) covered by trustPolicyExclude were not reported. Pass --include-excluded to list them.`,
			);
		}
		const result: TrustPolicyAuditResult = {
			tempDir,
			exitCode,
			iterations: iteration,
			elapsedSec,
			totalUniqueDependencies: pinned.length,
			auditIncomplete,
			trustPolicyExclude,
			excludedViolationCount,
			violations,
			...(endpointAccess === undefined ? {} : { endpointAccess }),
		};
		if (!this.jsonEnabled() && (violations.length > 0 || auditIncomplete)) {
			this.exit(1);
		}
		return result;
	}
}

/**
 * A dependency tree to audit.
 */
export interface Workspace {
	/**
	 * Directory of the pnpm workspace, lockfile, or standalone package.
	 */
	dir: string;
	/**
	 * Yarn or npm lockfile to read, if the tree is not audited through `pnpm list`.
	 */
	lockfile?: string;
}

const lockfileNames = ["npm-shrinkwrap.json", "package-lock.json", "yarn.lock"];

/**
 * Finds the nearest pnpm workspace or Yarn/npm lockfile, with a standalone package as fallback.
 * A lockfile closer than the pnpm workspace root takes precedence.
 * @param searchPath - Absolute directory to search from.
 */
export async function findWorkspace(searchPath: string): Promise<Workspace> {
	// pnpm resolves the real path, so walk the same path to reach its workspace root.
	const searchDir = realpathSync.native(searchPath);
	const pnpmDir = await findWorkspaceDir(searchDir);
	let packageDir: string | undefined;
	for (const dir of walk.up(searchDir, pnpmDir === undefined ? {} : { last: pnpmDir })) {
		if (dir === pnpmDir) {
			return { dir };
		}
		const manifestPath = find.file("package.json", { cwd: dir, last: dir });
		packageDir ??= manifestPath === undefined ? undefined : dir;
		// An unrelated ancestor's standalone npm install must not capture this project.
		if (
			packageDir === undefined ||
			dir === packageDir ||
			(manifestPath !== undefined &&
				(JSON.parse(readFileSync(manifestPath, "utf8")) as { workspaces?: unknown })
					.workspaces !== undefined)
		) {
			const lockfile = find.any(lockfileNames, { cwd: dir, last: dir, type: "file" });
			if (lockfile !== undefined) {
				return { dir, lockfile };
			}
		}
	}
	const dir = pnpmDir ?? packageDir;
	if (dir === undefined) {
		throw new Error(`No pnpm workspace or package.json contains ${searchPath}.`);
	}
	return { dir };
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
				for (const child of Object.values(map)) {
					visit(child);
				}
			}
		}
	}
	for (const project of projects) {
		visit(project);
	}
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
		if (rawLine === "" || !rawLine.includes(TRUST_DOWNGRADE_CODE)) {
			continue;
		}
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
		if (streamLive) {
			process.stdout.write(chunk);
		}
	});
	subprocess.stderr.on("data", (chunk: string) => {
		stderr += chunk;
		if (streamLive) {
			process.stderr.write(chunk);
		}
	});
	return new Promise((resolve, reject) => {
		subprocess.once("error", reject);
		subprocess.once("close", (code) => resolve({ code, stdout, stderr }));
	});
}

function describeVerdict(verdict: Verdict): string {
	switch (verdict) {
		case "accepted": {
			return "meets policy";
		}
		case "rejected": {
			return "does not meet policy";
		}
		default: {
			return "INCONCLUSIVE, verification could not complete";
		}
	}
}

/**
 * Whether this module is the process entry point.
 * `import.meta.main` is undefined before Node.js 22.18 and 24.2, so fall back to comparing paths rather than silently doing nothing.
 */
function isEntryPoint(): boolean {
	const entry = process.argv[1];
	return (
		import.meta.main ??
		(entry !== undefined && realpathSync(entry) === fileURLToPath(import.meta.url))
	);
}

if (isEntryPoint()) {
	// npm only warns about unsupported engines unless engine-strict is set, so check at run time too.
	const { engines } = JSON.parse(
		readFileSync(new URL("../package.json", import.meta.url), "utf8"),
	) as { engines: { node: string } };
	if (semver.satisfies(process.versions.node, engines.node)) {
		// Not awaited: oclif imports this module to load the command, which would wait on its own evaluation.
		void execute({ dir: import.meta.url });
	} else {
		console.error(
			`check-trust-policy requires Node.js ${engines.node}; this is Node.js ${process.versions.node}.`,
		);
		process.exitCode = 1;
	}
}
