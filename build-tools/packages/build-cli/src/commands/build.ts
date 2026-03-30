/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { existsSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { loadBuildProject } from "@fluid-tools/build-infrastructure";
import {
	FluidRepoBuild,
	getFluidBuildConfig,
	getResolvedFluidRoot,
	type IPackageMatchedOptions,
} from "@fluidframework/build-tools";
import { Flags } from "@oclif/core";
import chalk from "picocolors";

import { BaseCommand } from "../library/commands/base.js";

/**
 * Build command that orchestrates incremental builds across the Fluid repo.
 *
 * This is the oclif equivalent of the `fluid-build` CLI. It uses build-infrastructure for
 * repo layout discovery and build-tools for task graph execution.
 */
export default class BuildCommand extends BaseCommand<typeof BuildCommand> {
	static readonly description =
		"Build packages in the repo using the fluid-build task graph engine.";

	static readonly flags = {
		task: Flags.string({
			char: "t",
			multiple: true,
			description: "Target task to execute.",
		}),
		releaseGroup: Flags.string({
			char: "g",
			multiple: true,
			description: "Release group to operate on. Can be specified multiple times.",
		}),
		clean: Flags.boolean({
			char: "c",
			description:
				"Run the clean task on matched packages. Implies --force and disables build unless combined with --rebuild.",
		}),
		rebuild: Flags.boolean({
			char: "r",
			description: "Clean and build matched packages. Implies --force.",
		}),
		force: Flags.boolean({
			char: "f",
			description: "Force build and ignore dependency checks on matched packages.",
		}),
		dep: Flags.boolean({
			char: "d",
			description: "Apply actions to matched packages AND their dependent packages.",
		}),
		all: Flags.boolean({
			description:
				"Operate on all packages/monorepo (default: release group inferred from CWD).",
		}),
		install: Flags.boolean({
			description:
				"Run install for all packages. Skips a package if node_modules already exists.",
		}),
		uninstall: Flags.boolean({
			description: "Clean all node_modules.",
		}),
		reinstall: Flags.boolean({
			description: "Same as --uninstall --install.",
		}),
		vscode: Flags.boolean({
			description: "Output error messages for the default VSCode problem matcher.",
		}),
		worker: Flags.boolean({
			description:
				"Reuse worker threads for some tasks, increasing memory use but lowering overhead.",
		}),
		workerThreads: Flags.boolean({
			description: "Enable worker threads. Implies --worker.",
		}),
		workerMemoryLimitMB: Flags.integer({
			description: "Memory limit for worker threads in MiB.",
		}),
		concurrency: Flags.integer({
			description: "Maximum number of concurrent tasks.",
		}),
		nolint: Flags.boolean({ hidden: true, default: false }),
		lintonly: Flags.boolean({ hidden: true, default: false }),
		showExec: Flags.boolean({ hidden: true, default: false }),
		...BaseCommand.flags,
	} as const;

	static readonly strict = false;

	async run(): Promise<void> {
		const { flags, argv } = this;

		// Resolve the options, applying flag interaction logic
		const resolvedOptions = this.resolveOptions(flags, argv as string[]);

		// Resolve repo root
		const resolvedRoot = await getResolvedFluidRoot(true);
		this.verbose(`Build Root: ${resolvedRoot}`);

		// Load the build project from build-infrastructure
		const buildProject = loadBuildProject(resolvedRoot);

		// Load the fluid-build config (needed for task definitions)
		const fluidConfig = getFluidBuildConfig(resolvedRoot, false);

		// Populate the global options singleton so the build engine can read them.
		// This is a pragmatic bridge until the engine is fully decoupled from globals.
		const { options: globalOptions } = await import(
			"@fluidframework/build-tools/dist/fluidBuild/options.js"
		);
		Object.assign(globalOptions, {
			nolint: resolvedOptions.nolint,
			lintonly: resolvedOptions.lintonly,
			showExec: resolvedOptions.showExec,
			matchedOnly: resolvedOptions.matchedOnly,
			vscode: resolvedOptions.vscode,
			force: resolvedOptions.force,
			concurrency: resolvedOptions.concurrency,
			worker: resolvedOptions.worker,
			workerThreads: resolvedOptions.workerThreads,
			workerMemoryLimit: resolvedOptions.workerMemoryLimit,
		});

		const { GitRepo } = await import("@fluidframework/build-tools/dist/common/gitRepo.js");

		// Create the build engine
		const repo = new FluidRepoBuild(buildProject, {
			repoRoot: resolvedRoot,
			gitRepo: new GitRepo(resolvedRoot),
			fluidBuildConfig: fluidConfig,
		});

		// Set matched packages
		const matchOptions: IPackageMatchedOptions = {
			match: resolvedOptions.match,
			all: resolvedOptions.all,
			dirs: resolvedOptions.dirs,
			releaseGroups: resolvedOptions.releaseGroups,
		};

		const matched = repo.setMatched(matchOptions);
		if (!matched) {
			this.error("No package matched", { exit: -4 });
		}

		// Uninstall
		if (resolvedOptions.uninstall) {
			if (!(await repo.uninstall())) {
				this.error("Uninstall failed", { exit: -8 });
			}
			this.log("Uninstall completed");

			if (!resolvedOptions.install) {
				if (resolvedOptions.clean) {
					this.warning("Skipping clean after uninstall");
				} else if (resolvedOptions.build) {
					this.warning("Skipping build after uninstall");
				}
				return;
			}
		}

		// Install
		if (resolvedOptions.install) {
			this.log("Installing packages");
			if (!(await repo.install())) {
				this.error("Install failed", { exit: -5 });
			}
			this.log("Install completed");
		}

		// Build
		if (resolvedOptions.buildTaskNames.length > 0) {
			let buildGraph;
			this.verbose("Creating build graph...");
			try {
				buildGraph = repo.createBuildGraph(resolvedOptions.buildTaskNames);
			} catch (e: unknown) {
				this.error((e as Error).message, { exit: -11 });
			}
			this.verbose("Build graph created.");

			if (!(await buildGraph.checkInstall())) {
				this.error("Dependency not installed. Use --install to fix.", { exit: -10 });
			}

			const { Timer } = await import("@fluidframework/build-tools/dist/common/timer.js");
			const timer = new Timer(flags.timer ?? false);
			const { BuildResult } = await import(
				"@fluidframework/build-tools/dist/fluidBuild/buildResult.js"
			);

			const buildResult = await buildGraph.build(timer);

			if (flags.timer) {
				const totalElapsedTime = buildGraph.totalElapsedTime;
				const elapsedTime = timer.time();
				const concurrency = totalElapsedTime / elapsedTime;
				this.log(
					`Execution time: ${totalElapsedTime.toFixed(3)}s, Concurrency: ${concurrency.toFixed(3)}, Queue Wait time: ${buildGraph.totalQueueWaitTime.toFixed(3)}s`,
				);
			}

			if (buildResult === BuildResult.Failed) {
				const summary = buildGraph.taskFailureSummary;
				if (summary) {
					this.log(`\n${summary}`);
				}
				this.error("Build failed", { exit: -1 });
			}

			this.log(
				`Build ${buildResult === BuildResult.UpToDate ? chalk.cyanBright("up to date") : chalk.greenBright("succeeded")}`,
			);
		}

		if (resolvedOptions.build === false) {
			this.log("Other switches with no explicit build script, not building.");
		}
	}

	private resolveOptions(
		flags: Record<string, unknown>,
		argv: string[],
	): ResolvedBuildOptions {
		let build: boolean | undefined = undefined;
		let force = (flags.force as boolean) ?? false;
		let clean = false;
		const install = (flags.install as boolean) || (flags.reinstall as boolean) || false;
		const uninstall = (flags.uninstall as boolean) || (flags.reinstall as boolean) || false;

		if (flags.rebuild) {
			force = true;
			clean = true;
			build = true;
		} else if (flags.clean) {
			force = true;
			clean = true;
			build = false;
		}

		if (install && build === undefined) {
			build = false;
		}
		if (uninstall && build === undefined) {
			build = false;
		}

		// Parse positional args as package regexes or paths
		const match: string[] = [];
		const dirs: string[] = [];
		for (const arg of argv) {
			if (typeof arg === "string" && !arg.startsWith("-")) {
				const resolvedPath = path.resolve(arg);
				if (existsSync(resolvedPath)) {
					dirs.push(arg);
				} else {
					match.push(arg);
				}
			}
		}

		const taskNames = (flags.task as string[] | undefined) ?? [];

		// Default task names
		const buildTaskNames = [...taskNames];
		if (build !== false && buildTaskNames.length === 0) {
			buildTaskNames.push("build");
		}
		if (clean) {
			buildTaskNames.push("clean");
		}

		const workerThreads = (flags.workerThreads as boolean) ?? false;
		const worker = (flags.worker as boolean) || workerThreads;
		const workerMemoryLimitMB = flags.workerMemoryLimitMB as number | undefined;

		return {
			build,
			force,
			clean,
			install,
			uninstall,
			match,
			dirs,
			releaseGroups: (flags.releaseGroup as string[] | undefined) ?? [],
			all: (flags.all as boolean) ?? false,
			matchedOnly: !(flags.dep as boolean),
			buildTaskNames,
			nolint: (flags.nolint as boolean) ?? false,
			lintonly: (flags.lintonly as boolean) ?? false,
			showExec: (flags.showExec as boolean) ?? false,
			vscode: (flags.vscode as boolean) ?? false,
			concurrency: (flags.concurrency as number | undefined) ?? os.cpus().length,
			worker,
			workerThreads,
			workerMemoryLimit: workerMemoryLimitMB
				? workerMemoryLimitMB * 1024 * 1024
				: 2 * 1024 * 1024 * 1024,
		};
	}
}

interface ResolvedBuildOptions {
	build: boolean | undefined;
	force: boolean;
	clean: boolean;
	install: boolean;
	uninstall: boolean;
	match: string[];
	dirs: string[];
	releaseGroups: string[];
	all: boolean;
	matchedOnly: boolean;
	buildTaskNames: string[];
	nolint: boolean;
	lintonly: boolean;
	showExec: boolean;
	vscode: boolean;
	concurrency: number;
	worker: boolean;
	workerThreads: boolean;
	workerMemoryLimit: number;
}
