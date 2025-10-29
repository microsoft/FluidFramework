/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { existsSync } from "node:fs";
import * as path from "node:path";
import chalk from "picocolors";
import { Spinner } from "picospinner";

import { GitRepo } from "../common/gitRepo";
import { defaultLogger } from "../common/logging";
import { Timer } from "../common/timer";
import { type BuildGraph } from "./buildGraph";
import { BuildResult } from "./buildResult";
import { commonOptions } from "./commonOptions";
import { DEFAULT_FLUIDBUILD_CONFIG } from "./fluidBuildConfig";
import { FluidRepoBuild } from "./fluidRepoBuild";
import { getFluidBuildConfig, getResolvedFluidRoot } from "./fluidUtils";
import { options, parseOptions } from "./options";
import { loadCacheConfiguration } from "./sharedCache/configFile";
import { hashFile } from "./sharedCache/fileOperations";
import { SharedCacheManager } from "./sharedCache/sharedCacheManager";

const { log, errorLog: error, warning: warn } = defaultLogger;

parseOptions(process.argv);

async function main() {
	const timer = new Timer(commonOptions.timer);
	const resolvedRoot = await getResolvedFluidRoot(true);
	const fluidConfig = getFluidBuildConfig(resolvedRoot, false);
	const isDefaultConfig = fluidConfig === DEFAULT_FLUIDBUILD_CONFIG;
	const suffix = isDefaultConfig
		? ` (${chalk.yellowBright("inferred packages and tasks")})`
		: "";
	log(`Build Root: ${resolvedRoot}${suffix}`);

	// Load cache configuration with proper precedence: CLI > env > config file > defaults
	const cacheConfig = loadCacheConfiguration(
		{
			cacheDir: options.cacheDir,
			skipCacheWrite: options.skipCacheWrite ? true : undefined,
			verifyIntegrity: options.verifyCacheIntegrity ? true : undefined,
		},
		resolvedRoot,
	);

	// Initialize shared cache if cache directory is specified
	let sharedCache: SharedCacheManager | undefined;
	if (cacheConfig.cacheDir) {
		try {
			// Find and hash the lockfile
			const lockfilePath = path.join(resolvedRoot, "pnpm-lock.yaml");
			if (!existsSync(lockfilePath)) {
				warn(`Lockfile not found at ${lockfilePath}, cache disabled`);
			} else {
				const lockfileHash = await hashFile(lockfilePath);

				// Collect cache bust environment variables
				const cacheBustVars: Record<string, string> = {};
				for (const [key, value] of Object.entries(process.env)) {
					if (key.startsWith("FLUID_BUILD_CACHE_BUST") && value !== undefined) {
						cacheBustVars[key] = value;
					}
				}

				sharedCache = new SharedCacheManager({
					cacheDir: cacheConfig.cacheDir,
					repoRoot: resolvedRoot,
					globalKeyComponents: {
						cacheSchemaVersion: 1,
						nodeVersion: process.version,
						arch: process.arch,
						platform: process.platform,
						lockfileHash,
						nodeEnv: process.env.NODE_ENV,
						cacheBustVars: Object.keys(cacheBustVars).length > 0 ? cacheBustVars : undefined,
					},
					verifyIntegrity: cacheConfig.verifyIntegrity,
					skipCacheWrite: cacheConfig.skipCacheWrite,
				});
				log(`Shared cache enabled: ${cacheConfig.cacheDir}`);
			}
		} catch (e) {
			warn(`Failed to initialize shared cache: ${(e as Error).message}`);
		}
	}

	// Handle cache management commands (these exit immediately)
	if (options.cacheStats || options.cacheClean || options.cachePrune || options.cacheVerify) {
		if (!sharedCache) {
			error("Cache management commands require --cache-dir to be specified");
			process.exit(-1);
		}

		try {
			if (options.cacheStats) {
				await sharedCache.displayStatistics();
			} else if (options.cacheClean) {
				await sharedCache.cleanCache();
			} else if (options.cachePrune) {
				await sharedCache.pruneCache(
					options.cachePruneMaxSizeMB,
					options.cachePruneMaxAgeDays,
				);
			} else if (options.cacheVerify) {
				await sharedCache.verifyCache(options.cacheVerifyFix);
			}
			process.exit(0);
		} catch (e) {
			error(`Cache operation failed: ${(e as Error).message}`);
			process.exit(-1);
		}
	}

	// Load the packages
	const repo = new FluidRepoBuild({
		repoRoot: resolvedRoot,
		gitRepo: new GitRepo(resolvedRoot),
		fluidBuildConfig: fluidConfig,
		sharedCache,
	});

	timer.time("Package scan completed");

	// Set matched package based on options filter
	const matched = repo.setMatched(options);
	if (!matched) {
		error("No package matched");
		process.exit(-4);
	}

	// Uninstall
	if (options.uninstall) {
		if (!(await repo.uninstall())) {
			error(`uninstall failed`);
			process.exit(-8);
		}
		timer.time("Uninstall completed", true);

		if (!options.install) {
			let errorStep: string | undefined = undefined;
			if (options.clean) {
				errorStep = "clean";
			} else if (options.build) {
				errorStep = "build";
			}
			if (errorStep) {
				warn(`Skipping ${errorStep} after uninstall`);
			}
			process.exit(0);
		}
	}

	// Install or check install
	if (options.install) {
		log("Installing packages");
		if (!(await repo.install())) {
			error(`Install failed`);
			process.exit(-5);
		}
		timer.time("Install completed", true);
	}

	let failureSummary = "";
	let exitCode = 0;
	let buildGraph: BuildGraph | undefined;
	if (options.buildTaskNames.length !== 0) {
		// build the graph
		const spinner = new Spinner("Creating build graph...");
		try {
			// Warning any text output to terminal before spinner is halted
			// risks being lost. It is known to drop text that exceeds a single
			// line or the terminal width.
			spinner.start();
			buildGraph = repo.createBuildGraph(options.buildTaskNames);
		} catch (e: unknown) {
			spinner.stop();
			error((e as Error).message);
			process.exit(-11);
		}
		spinner.succeed("Build graph created.");
		timer.time("Build graph creation completed");

		// Check install
		if (!(await buildGraph.checkInstall())) {
			error("Dependency not installed. Use --install to fix.");
			process.exit(-10);
		}
		timer.time("Check install completed");

		// Run the build
		const buildResult = await buildGraph.build(timer);
		const buildStatus = buildResultString(buildResult);
		const elapsedTime = timer.time();
		if (commonOptions.timer) {
			const totalElapsedTime = buildGraph.totalElapsedTime;
			const concurrency = buildGraph.totalElapsedTime / elapsedTime;
			log(
				`Execution time: ${totalElapsedTime.toFixed(3)}s, Concurrency: ${concurrency.toFixed(
					3,
				)}, Queue Wait time: ${buildGraph.totalQueueWaitTime.toFixed(3)}s`,
			);
			log(`Build ${buildStatus} - ${elapsedTime.toFixed(3)}s`);
		} else {
			log(`Build ${buildStatus}`);
		}
		failureSummary = buildGraph.taskFailureSummary;

		exitCode = buildResult === BuildResult.Failed ? -1 : 0;
	}

	if (options.build === false) {
		log(`Other switches with no explicit build script, not building.`);
	}

	const totalTime = timer.getTotalTime();
	const timeInMinutes =
		totalTime > 60000
			? ` (${Math.floor(totalTime / 60000)}m ${((totalTime % 60000) / 1000).toFixed(3)}s)`
			: "";
	log(`Total time: ${(totalTime / 1000).toFixed(3)}s${timeInMinutes}`);

	// Display cache statistics if available
	if (buildGraph) {
		const cacheStats = buildGraph.cacheStatsSummary;
		if (cacheStats) {
			log(cacheStats);
		}
	}

	if (failureSummary !== "") {
		log(`\n${failureSummary}`);
	}
	process.exit(exitCode);
}

function buildResultString(buildResult: BuildResult) {
	switch (buildResult) {
		case BuildResult.Success:
			return chalk.greenBright("succeeded");
		case BuildResult.Failed:
			return chalk.redBright("failed");
		case BuildResult.UpToDate:
			return chalk.cyanBright("up to date");
		case BuildResult.CachedSuccess:
			return chalk.magentaBright("restored from cache");
		case BuildResult.SuccessWithCacheWrite:
			return chalk.greenBright("succeeded and cached");
		case BuildResult.LocalCacheHit:
			return chalk.yellowBright("local cache hit");
	}
}

main().catch((e) => {
	error(`Unexpected error. ${e.message}`);
	error(e.stack);
});
