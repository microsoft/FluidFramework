/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { ReplayArgs } from "./replayArgs.js";
import { ReplayTool } from "./replayMessages.js";

const optionsArray = [
	"Location:",
	[
		"--indir <directory>",
		"Name of the directory containing the output of the fluid-fetch tool",
	],
	[
		"--outdir <directory>",
		"Name of the output directory where the snapshots will appear",
		"If not specified a directory will be created in current directory with name Output",
	],
	"Modes:",
	[
		"--write",
		"Write out snapshots. Behavior is controlled by --snapfreq & --storageSnapshots",
	],
	["--compare", "Compares snapshots to snapshots previously saved on disk. Used in testing"],
	"Processing:",
	["--snapfreq <N>", "A snapshot will be taken after every <N>th op"],
	[
		"--summaries",
		"Test summaries - run summarizer at every point in file where summary was generated.",
	],
	[
		"--stressTest",
		"Run stress tests. Adds --quiet --snapfreq 50",
		"Runs 4 overlapping containers to detect summary consistency issues",
		"Writes out only snapshots with consistency issues",
	],
	["--storageSnapshots", "Validate storage (FluidFetch) snapshots"],
	[
		"--incremental",
		"Allow incremental snapshots (to closer simulate reality). Diff will be noisy",
	],
	"Scoping:",
	[
		"--from <op#|version>",
		"if a number, indicates seq# where to start generation/validation of snapshots",
		"Else specifies directory inside the --indir - a snapshot to load from",
	],
	["--to <op#>", "The last op number to be replayed"],
	"Misc:",
	["--noexpanded", "Do not write out 'snapshot*_expanded.json' files"],
	["--windiff", "Launch windiff.exe for any mismatch"],
	["--quiet", "Reduces amount of output"],
	["--verbose", "Increases amount of output"],
];

/**
 * This is the main class used to take user input to replay ops for debugging purposes.
 */
class ReplayProcessArgs extends ReplayArgs {
	constructor() {
		super();
		this.parseArguments();
	}

	public parseArguments() {
		if (process.argv.length <= 2) {
			this.printUsage();
			process.exit(-1);
		}

		for (let i = 2; i < process.argv.length; i++) {
			const arg = process.argv[i];
			switch (arg) {
				case "--indir":
					i += 1;
					this.inDirName = this.parseStrArg(i);
					break;
				case "--from":
					i += 1;
					const from = this.parseStrArg(i);

					// Both methods have limitations - first ignores non-number chars at the end.
					// Second parses floats.
					const paramNumber = parseInt(from, 10);
					const paramNumber2 = Number(from);

					this.fromVersion = undefined;
					this.from = 0;
					if (isNaN(paramNumber2)) {
						this.fromVersion = from;
					} else if (paramNumber < 0 || paramNumber !== paramNumber2) {
						console.error(
							`Warning: ignoring --from argument - does not look like right number: ${from}`,
						);
					} else {
						this.from = paramNumber;
					}
					break;
				case "--to":
					i += 1;
					this.to = this.parseIntArg(i);
					break;
				case "--snapfreq":
					i += 1;
					this.snapFreq = this.parseIntArg(i);
					break;
				case "--summaries":
					this.testSummaries = true;
					break;
				case "--outdir":
					i += 1;
					this.outDirName = this.parseStrArg(i);
					break;
				case "--quiet":
					this.verbose = false;
					break;
				case "--verbose":
					this.verbose = true;
					break;
				case "--windiff":
					this.windiff = true;
					break;
				case "--incremental":
					this.incremental = true;
					break;
				case "--storageSnapshots":
					this.validateStorageSnapshots = true;
					break;
				case "--stressTest":
					this.overlappingContainers = 4;
					this.verbose = false;
					if (this.snapFreq === undefined) {
						this.snapFreq = 50;
					}
					break;
				case "--compare":
					this.compare = true;
					this.write = false;
					this.verbose = false;
					break;
				case "--write":
					this.write = true;
					this.compare = false;
					this.verbose = false;
					break;
				case "--noexpanded":
					this.expandFiles = false;
					break;
				case "--initialSnapshots":
					if (process.argv[i + 1] && !process.argv[i + 1].startsWith("-")) {
						i += 1;
						this.initializeFromSnapshotsDir = this.parseStrArg(i);
					} else {
						this.initializeFromSnapshotsDir = this.inDirName;
					}
					break;
				default:
					console.error(`ERROR: Invalid argument ${arg}`);
					this.printUsage();
					process.exit(-1);
			}
		}
	}

	public parseStrArg(i: number) {
		if (i >= process.argv.length) {
			console.error(`ERROR: Missing ${process.argv[i - 1]} argument`);
			this.printUsage();
			process.exit(-1);
		}
		return process.argv[i];
	}

	public parseIntArg(i: number) {
		if (i >= process.argv.length) {
			console.error(`ERROR: Missing ${process.argv[i - 1]} argument`);
			this.printUsage();
			process.exit(-1);
		}
		const numStr = process.argv[i];
		const paramNumber = parseInt(numStr, 10);
		if (isNaN(paramNumber) || paramNumber < 0) {
			console.error(`ERROR: Invalid ${name} ${numStr}`);
			this.printUsage();
			process.exit(-1);
		}
		return paramNumber;
	}

	public printUsage() {
		console.log("Usage: replayTool [options]");
		const empty = "".padEnd(32);
		for (const rec of optionsArray) {
			if (typeof rec === "string") {
				console.log("");
				console.log(rec);
			} else {
				let header = `${rec[0].padEnd(32)}`;
				for (const el of rec.slice(1)) {
					console.log(`  ${header}${el}`);
					header = empty;
				}
			}
		}
	}
}

let finished = false;

process.on("exit", (code) => {
	if (code === 0 && !finished) {
		console.error("Deadlock in ReplayTool!");
		process.exit(3);
	}
});

new ReplayTool(new ReplayProcessArgs())
	.Go()
	.then((errors) => {
		// If we failed, exit with non-zero code
		// If we succeeded, do not exit process - that will hide errors about unhandled promise rejections!
		// Node will eventually exit when there is no code to run, and will validate all hanging promises
		if (errors.length !== 0) {
			process.exit(1);
		}
		finished = true;
	})
	.catch((error: Error) => {
		console.error(`ERROR: ${error}`);
		process.exit(2);
	});
