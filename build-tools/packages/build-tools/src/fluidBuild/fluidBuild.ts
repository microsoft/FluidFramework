/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import chalk from "picocolors";
import { Spinner } from "picospinner";

import { Stopwatch } from "@fluid-tools/build-infrastructure";
import { defaultLogger } from "../common/logging";
import { Timer } from "../common/timer";
import { BuildGraph, BuildResult } from "./buildGraph";
import { commonOptions } from "./commonOptions";
import { FluidRepoBuild } from "./fluidRepoBuild";
import { options, parseOptions } from "./options";

const { log, errorLog: error, warning: warn } = defaultLogger;

parseOptions(process.argv);

async function main() {
	const timer = new Stopwatch(commonOptions.timer);
	const repo = new FluidRepoBuild(process.cwd());
	log(`Build Root: ${repo.root}`);

	timer.log("Package scan completed");

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
			if (options.symlink) {
				errorStep = "symlink";
			} else if (options.clean) {
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

	// Symlink check
	// const symlinkTaskName = options.symlink ? "Symlink" : "Symlink check";
	// await repo.symlink(options);
	// timer.time(`${symlinkTaskName} completed`, options.symlink);

	let failureSummary = "";
	let exitCode = 0;
	if (options.buildTaskNames.length !== 0) {
		if (options.fullSymlink !== undefined) {
			log(chalk.yellow(`Symlink in ${options.fullSymlink ? "full" : "isolated"} mode`));
		}

		// build the graph
		let buildGraph: BuildGraph;
		const spinner = new Spinner("Creating build graph...");
		try {
			spinner.start();
			buildGraph = repo.createBuildGraph(options.buildTaskNames);
		} catch (e: unknown) {
			error((e as Error).message);
			process.exit(-11);
		}
		spinner.succeed("Build graph created.");
		timer.log("Build graph creation completed");

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
	}
}

main().catch((e) => {
	error(`Unexpected error. ${e.message}`);
	error(e.stack);
});
