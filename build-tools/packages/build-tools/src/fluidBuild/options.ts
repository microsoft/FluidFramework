/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { existsSync } from "node:fs";
import * as os from "node:os";
import * as path from "node:path";

import { defaultLogger } from "../common/logging";
import { commonOptionString, parseOption } from "./commonOptions";
import { IPackageMatchedOptions } from "./fluidRepoBuild";
import { defaultBuildTaskName, defaultCleanTaskName } from "./fluidTaskDefinitions";
import { ISymlinkOptions } from "./symlinkUtils";

const { log, errorLog } = defaultLogger;

interface FastBuildOptions extends IPackageMatchedOptions, ISymlinkOptions {
	nolint: boolean;
	lintonly: boolean;
	showExec: boolean;
	clean: boolean;
	matchedOnly: boolean;
	buildTaskNames: string[];
	build?: boolean;
	vscode: boolean;

	/**
	 * @deprecated symlink-related functionality will be removed in an upcoming release.
	 */
	symlink: boolean;

	/**
	 * @deprecated symlink-related functionality will be removed in an upcoming release.
	 */
	fullSymlink: boolean | undefined;

	/**
	 * @deprecated depcheck-related functionality will be removed in an upcoming release.
	 */
	depcheck: boolean;
	force: boolean;
	install: boolean;
	uninstall: boolean;
	concurrency: number;
	worker: boolean;
	workerThreads: boolean;
	/**
	 * Per worker, in bytes.
	 * When a worker is finished with a task, if this is exceeded, a new worker is spawned.
	 */
	workerMemoryLimit: number;
}

// defaults
export const options: FastBuildOptions = {
	nolint: false,
	lintonly: false,
	showExec: false,
	clean: false,
	match: [],
	dirs: [],
	releaseGroups: [],
	matchedOnly: true,
	buildTaskNames: [],
	vscode: false,
	symlink: false,
	fullSymlink: undefined,
	depcheck: false,
	force: false,
	install: false,
	uninstall: false,
	concurrency: os.cpus().length,
	all: false,
	worker: false,
	workerThreads: false,
	// Setting this lower causes more worker restarts, but uses less memory.
	// Since using too much memory can cause slow downs, and too many worker restarts can also cause slowdowns,
	// it's a tradeoff.
	// Around 2 GB seems to be ideal.
	// Both larger and smaller values have shown to be slower (even with plenty of free ram), and too large of values (4 GiB) on low concurrency runs (4) has resulted in
	// "build:esnext: Internal uncaught exception: Error: Worker disconnect" likely due to node processes exceeding 4 GiB of memory.
	workerMemoryLimit: 2 * 1024 * 1024 * 1024,
};

// This string is duplicated in the readme: update readme if changing this.

function printUsage() {
	log(
		`
Usage: fluid-build <options> [(<package regexp>|<path>) ...]
    [<package regexp> ...] Regexp to match the package name (default: all packages)
Options:
     --all                  Operate on all packages/monorepo (default: client monorepo). See also "-g" or "--releaseGroup".
  -c --clean                Same as running build script 'clean' on matched packages (all if package regexp is not specified)
  -d --dep                  Apply actions (clean/force/rebuild) to matched packages and their dependent packages
     --fix                  Auto fix warning from package check if possible
  -f --force                Force build and ignore dependency check on matched packages (all if package regexp is not specified)
  -? --help                 Print this message
     --install              Run npm install for all packages/monorepo. This skips a package if node_modules already exists: it can not be used to update in response to changes to the package.json.
     --workerMemoryLimitMB  Memory limit for worker threads in MiB
  -r --rebuild              Clean and build on matched packages (all if package regexp is not specified)
     --reinstall            Same as --uninstall --install.
  -g --releaseGroup         Release group to operate on
     --root <path>          Root directory of the Fluid repo (default: env _FLUID_ROOT_)
  -t --task <name>          target to execute (default:build)
     --symlink              Deprecated. Fix symlink between packages within monorepo (isolate mode). This configures the symlinks to only connect within each lerna managed group of packages. This is the configuration tested by CI and should be kept working.
     --symlink:full         Deprecated. Fix symlink between packages across monorepo (full mode). This symlinks everything in the repo together. CI does not ensure this configuration is functional, so it may or may not work.
     --uninstall            Clean all node_modules. This errors if some node_modules folder do not exist. If hitting this limitation, you can do an install first to work around it.
     --vscode               Output error message to work with default problem matcher in vscode
     --worker               Reuse worker threads for some tasks, increasing memory use but lowering overhead.
${commonOptionString}
`,
	);
}

function setClean(build: boolean) {
	options.force = true;
	options.clean = true;
	setBuild(build);
}

function setBuild(build: boolean) {
	if (build || options.build === undefined) {
		options.build = build;
	}
}

function setReinstall() {
	options.uninstall = true;
	setInstall();
}

function setInstall() {
	options.install = true;
	setBuild(false);
}

function setUninstall() {
	options.uninstall = true;
	setBuild(false);
}

function setSymlink(fullSymlink: boolean) {
	options.symlink = true;
	options.fullSymlink = fullSymlink;
	setBuild(false);
}

export function parseOptions(argv: string[]) {
	let error = false;
	for (let i = 2; i < argv.length; i++) {
		const argParsed = parseOption(argv, i);
		if (argParsed < 0) {
			error = true;
			break;
		}
		if (argParsed > 0) {
			i += argParsed - 1;
			continue;
		}

		const arg = process.argv[i];

		if (arg === "-?" || arg === "--help") {
			printUsage();
			process.exit(0);
		}

		if (arg === "-d" || arg === "--dep") {
			options.matchedOnly = false;
			continue;
		}

		if (arg === "-r" || arg === "--rebuild") {
			setClean(true);
			continue;
		}

		if (arg === "-c" || arg === "--clean") {
			setClean(false);
			continue;
		}

		if (arg === "-f" || arg === "--force") {
			options.force = true;
			continue;
		}

		if (arg === "--install") {
			setInstall();
			continue;
		}

		if (arg === "--reinstall") {
			setReinstall();
			continue;
		}

		if (arg === "--uninstall") {
			setUninstall();
			continue;
		}

		if (arg === "--all") {
			options.all = true;
			continue;
		}

		if (arg === "-g" || arg === "--releaseGroup") {
			if (i !== process.argv.length - 1) {
				options.releaseGroups.push(process.argv[++i]);
				setBuild(true);
				continue;
			}
			errorLog("Missing argument for --releaseGroup");
			error = true;
			break;
		}

		if (arg === "-t" || arg === "--task") {
			if (i !== process.argv.length - 1) {
				options.buildTaskNames.push(process.argv[++i]);
				setBuild(true);
				continue;
			}
			errorLog("Missing argument for --task");
			error = true;
			break;
		}

		if (arg === "--vscode") {
			options.vscode = true;
			continue;
		}

		if (arg === "--symlink") {
			console.warn(
				"The --symlink flag is deprecated and will be removed in an upcoming release.",
			);
			setSymlink(false);
			continue;
		}

		if (arg === "--symlink:full") {
			console.warn(
				"The --symlink:full flag is deprecated and will be removed in an upcoming release.",
			);
			setSymlink(true);
			continue;
		}

		if (arg === "--depcheck") {
			console.warn(
				"The --depcheck flag is deprecated and will be removed in an upcoming release.",
			);
			options.depcheck = true;
			setBuild(false);
			continue;
		}

		// These options are not public
		if (arg === "--nolint") {
			options.nolint = true;
			continue;
		}

		if (arg === "--lintonly") {
			options.lintonly = true;
			continue;
		}

		if (arg === "--showExec") {
			options.showExec = true;
			continue;
		}

		if (arg === "--concurrency") {
			if (i !== process.argv.length - 1) {
				const concurrency = parseInt(process.argv[++i]);
				if (!isNaN(concurrency) && concurrency > 0) {
					options.concurrency = concurrency;
					continue;
				}
				errorLog("Argument for --concurrency is not a number > 0");
			} else {
				errorLog("Missing argument for --concurrency");
			}
			error = true;
			break;
		}

		if (arg === "--worker") {
			options.worker = true;
			continue;
		}

		if (arg === "--workerThreads") {
			options.workerThreads = true;
			options.worker = true;
			continue;
		}

		if (arg === "--workerMemoryLimitMB") {
			if (i !== process.argv.length - 1) {
				const mb = parseInt(process.argv[++i]);
				if (!isNaN(mb)) {
					options.workerMemoryLimit = mb * 1024 * 1024;
					continue;
				}
				errorLog("Argument for --workerMemoryLimitMB is not a number");
			} else {
				errorLog("Missing argument for --workerMemoryLimitMB");
			}
			error = true;
			break;
		}

		// Package regexp or paths
		if (!arg.startsWith("-")) {
			const resolvedPath = path.resolve(arg);
			if (existsSync(resolvedPath)) {
				options.dirs.push(arg);
			} else {
				options.match.push(arg);
			}
			continue;
		}

		errorLog(`Invalid arguments ${arg}`);
		error = true;
		break;
	}

	if (error) {
		printUsage();
		process.exit(-1);
	}

	// If we are building, and don't have a task name, default to "build"
	if (options.build !== false && options.buildTaskNames.length === 0) {
		options.buildTaskNames.push(defaultBuildTaskName);
	}

	// Add the "clean" task if --clean is specified
	if (options.clean) {
		options.buildTaskNames.push(defaultCleanTaskName);
	}
}
