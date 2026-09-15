#!/usr/bin/env node
/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { readFile, readdir, readlink, stat } from "node:fs/promises";
import { basename, dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";

const scriptDirectory = dirname(fileURLToPath(import.meta.url));
const defaultRepositoryRoot = resolve(scriptDirectory, "../../../..");
const requiredMarker = "<!-- TODO(required):";

function fail(message) {
	console.error(`error: ${message}`);
	process.exit(1);
}

function run(command, args, cwd = defaultRepositoryRoot) {
	const result = spawnSync(command, args, {
		cwd,
		encoding: "utf8",
		maxBuffer: 10 * 1024 * 1024,
		timeout: 15_000,
	});
	if (result.error !== undefined) {
		throw result.error;
	}
	if (result.status !== 0) {
		throw new Error(
			`${command} ${args.join(" ")} exited ${result.status}: ${result.stderr.trim()}`,
		);
	}
	return result.stdout.trimEnd();
}

function parseArguments(arguments_) {
	let iteration;
	let integrationRoot;
	let summary = false;
	for (let index = 0; index < arguments_.length; index += 1) {
		const argument = arguments_[index];
		if (argument === "--integration-root") {
			integrationRoot = arguments_[index + 1];
			if (integrationRoot === undefined) {
				fail("--integration-root requires an absolute path");
			}
			index += 1;
		} else if (argument === "--summary") {
			summary = true;
		} else if (/^\d{4}$/.test(argument)) {
			if (iteration !== undefined) {
				fail("provide at most one iteration");
			}
			iteration = argument;
		} else {
			fail(`unknown argument: ${argument}`);
		}
	}
	return { iteration, integrationRoot, summary };
}

async function exists(path) {
	try {
		await stat(path);
		return true;
	} catch {
		return false;
	}
}

async function highestIteration(root) {
	const iterationsRoot = resolve(root, "rust-service/iterations");
	if (!(await exists(iterationsRoot))) {
		return undefined;
	}
	const entries = await readdir(iterationsRoot, { withFileTypes: true });
	return entries
		.filter((entry) => entry.isDirectory() && /^\d{4}$/.test(entry.name))
		.map((entry) => entry.name)
		.sort()
		.at(-1);
}

function parseWorktrees(text) {
	const worktrees = [];
	let current;
	for (const line of `${text}\n`.split("\n")) {
		if (line.startsWith("worktree ")) {
			current = { path: line.slice("worktree ".length) };
			worktrees.push(current);
		} else if (line.startsWith("branch ") && current !== undefined) {
			current.branch = line.slice("branch refs/heads/".length);
		} else if (line === "detached" && current !== undefined) {
			current.detached = true;
		}
	}
	return worktrees;
}

function highestWorktreeIteration(worktrees) {
	return worktrees
		.map((worktree) => worktree.branch?.match(/^rust-service-iteration-(\d{4})(?:-|$)/)?.[1])
		.filter((iteration) => iteration !== undefined)
		.sort()
		.at(-1);
}

function conventionalIntegrationRoot(repositoryRoot, iteration) {
	return resolve(
		dirname(repositoryRoot),
		`${basename(repositoryRoot)}-rust-service-iteration-${iteration}`,
	);
}

async function readJson(path) {
	return JSON.parse(await readFile(path, "utf8"));
}

function section(markdown, heading, limit = 1600) {
	const escaped = heading.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
	const match = new RegExp(`^## ${escaped}\\s*$`, "m").exec(markdown);
	if (match === null) {
		return undefined;
	}
	const remainder = markdown.slice(match.index + match[0].length);
	const nextHeading = remainder.search(/^## /m);
	const value = remainder
		.slice(0, nextHeading === -1 ? undefined : nextHeading)
		.replaceAll(requiredMarker, "TODO: ")
		.replace(/<!--|-->/g, "")
		.trim();
	return value.length > limit ? `${value.slice(0, limit)}...` : value;
}

async function reportSummary(path) {
	if (!(await exists(path))) {
		return { exists: false };
	}
	const markdown = await readFile(path, "utf8");
	return {
		exists: true,
		status: markdown.match(/^Status:\s*(.+)$/m)?.[1]?.trim(),
		requiredTodoCount: markdown.split(requiredMarker).length - 1,
		outcome: section(markdown, "Outcome"),
		validationEvidence: section(markdown, "Validation Evidence"),
		remainingWork: section(markdown, "Remaining Work and Risks"),
	};
}

function gitSnapshot(path) {
	if (path === undefined) {
		return { available: false };
	}
	try {
		const [fullHead, shortHead, subject, committedAt, status, recentCommits] = [
			run("git", ["-C", path, "rev-parse", "HEAD"]),
			run("git", ["-C", path, "rev-parse", "--short=12", "HEAD"]),
			run("git", ["-C", path, "log", "-1", "--format=%s"]),
			run("git", ["-C", path, "log", "-1", "--date=iso-strict", "--format=%ad"]),
			run("git", ["-C", path, "status", "--short"]),
			run("git", ["-C", path, "log", "-12", "--date=iso-strict", "--format=%H|%ad|%s"]),
		];
		return {
			available: true,
			head: fullHead,
			shortHead,
			subject,
			committedAt,
			clean: status.length === 0,
			status: status.length === 0 ? [] : status.split("\n"),
			recentCommits: recentCommits.length === 0 ? [] : recentCommits.split("\n"),
		};
	} catch (error) {
		return { available: false, error: error.message };
	}
}

function processClassification(command) {
	const [executable = "", ...arguments_] = command.split(/\s+/);
	if (!/(?:^|\/)(?:ba|z|fi)?sh$/.test(executable)) {
		return "active";
	}
	for (let index = 0; index < arguments_.length; index += 1) {
		const argument = arguments_[index];
		if (argument === "--init-file" || argument === "--rcfile") {
			index += 1;
			continue;
		}
		if (argument === "-c" || !argument.startsWith("-")) {
			return "active";
		}
	}
	return "shell";
}

async function processSnapshot(worktreePaths) {
	const matches = [];
	let processDirectories;
	try {
		processDirectories = await readdir("/proc", { withFileTypes: true });
	} catch {
		return { available: false, processes: [] };
	}
	for (const entry of processDirectories) {
		if (
			!entry.isDirectory() ||
			!/^\d+$/.test(entry.name) ||
			Number(entry.name) === process.pid
		) {
			continue;
		}
		const processRoot = resolve("/proc", entry.name);
		try {
			const [cwd, commandBuffer] = await Promise.all([
				readlink(resolve(processRoot, "cwd")),
				readFile(resolve(processRoot, "cmdline")),
			]);
			const command = commandBuffer.toString("utf8").replaceAll("\0", " ").trim();
			if (!worktreePaths.some((path) => cwd.startsWith(path) || command.includes(path))) {
				continue;
			}
			matches.push({
				pid: Number(entry.name),
				cwd,
				command,
				classification: processClassification(command),
			});
		} catch {
			// Processes may exit while /proc is being read.
		}
	}
	return { available: true, processes: matches };
}

function compactText(value, limit = 480) {
	if (value === undefined) {
		return undefined;
	}
	const compact = value.replace(/\s+/g, " ").trim();
	return compact.length > limit ? `${compact.slice(0, limit)}...` : compact;
}

function compactGit(git) {
	return {
		available: git.available,
		shortHead: git.shortHead,
		subject: git.subject,
		committedAt: git.committedAt,
		clean: git.clean,
		status: git.status,
		error: git.error,
	};
}

function compactReport(report) {
	return {
		exists: report.exists,
		status: report.status,
		requiredTodoCount: report.requiredTodoCount,
		outcome: compactText(report.outcome),
		validationEvidence: compactText(report.validationEvidence),
		remainingWork: compactText(report.remainingWork),
	};
}

function compactOutput(output) {
	return {
		collectedAt: output.collectedAt,
		iteration: output.iteration,
		manifest: output.manifest,
		workstreams: output.workstreams.map((workstream) => ({
			name: workstream.name,
			branch: workstream.branch,
			worktreePath: workstream.worktreePath,
			reportPath: workstream.reportPath,
			git: compactGit(workstream.git),
			report: compactReport(workstream.report),
		})),
		integration: {
			branch: output.integration.branch,
			worktreePath: output.integration.worktreePath,
			reportPath: output.integration.reportPath,
			git: compactGit(output.integration.git),
			report: compactReport(output.integration.report),
		},
		processes: output.processes,
	};
}

async function main() {
	const options = parseArguments(process.argv.slice(2));
	const repositoryRoot = defaultRepositoryRoot;
	const worktrees = parseWorktrees(
		run("git", ["-C", repositoryRoot, "worktree", "list", "--porcelain"]),
	);
	const iteration =
		options.iteration ??
		highestWorktreeIteration(worktrees) ??
		(await highestIteration(repositoryRoot));
	if (iteration === undefined) {
		fail("no numbered Rust service iteration was found");
	}

	const integrationBranch = `rust-service-iteration-${iteration}`;
	const discoveredIntegration = worktrees.find(
		(worktree) => worktree.branch === integrationBranch,
	)?.path;
	let integrationRoot = options.integrationRoot ?? discoveredIntegration;
	if (integrationRoot === undefined) {
		const conventionalRoot = conventionalIntegrationRoot(repositoryRoot, iteration);
		integrationRoot = (await exists(conventionalRoot)) ? conventionalRoot : repositoryRoot;
	}
	integrationRoot = resolve(integrationRoot);

	const iterationRoot = resolve(integrationRoot, `rust-service/iterations/${iteration}`);
	const manifestPath = resolve(iterationRoot, "manifest.json");
	if (!(await exists(manifestPath))) {
		fail(`manifest not found: ${manifestPath}`);
	}
	const manifest = await readJson(manifestPath);
	const workstreamSnapshots = [];

	for (const workstream of manifest.activeWorkstreams ?? []) {
		const branch = `${integrationBranch}-${workstream.name}`;
		const discovered = worktrees.find((candidate) => candidate.branch === branch)?.path;
		const conventional = `${integrationRoot}-${workstream.name}`;
		const worktreePath =
			discovered ?? ((await exists(conventional)) ? conventional : undefined);
		const reportPath = resolve(
			worktreePath ?? integrationRoot,
			`rust-service/iterations/${iteration}`,
			workstream.report,
		);
		const report = await reportSummary(reportPath);
		workstreamSnapshots.push({
			name: workstream.name,
			branch,
			worktreePath,
			reportPath: report.exists ? reportPath : (worktreePath ?? integrationRoot),
			git: gitSnapshot(worktreePath),
			report,
		});
	}

	const integrationReportPath = resolve(iterationRoot, "phase-2/integration.md");
	const allPaths = [
		integrationRoot,
		...workstreamSnapshots.map((item) => item.worktreePath),
	].filter(Boolean);
	const output = {
		collectedAt: new Date().toISOString(),
		iteration,
		manifest: {
			path: manifestPath,
			status: manifest.status,
			sourceCommit: manifest.sourceCommit,
		},
		workstreams: workstreamSnapshots,
		integration: {
			branch: integrationBranch,
			worktreePath: integrationRoot,
			reportPath: integrationReportPath,
			git: gitSnapshot(integrationRoot),
			report: await reportSummary(integrationReportPath),
		},
		processes: await processSnapshot(allPaths),
	};
	console.log(JSON.stringify(options.summary ? compactOutput(output) : output, undefined, 2));
}

main().catch((error) => fail(error.stack ?? error.message));
