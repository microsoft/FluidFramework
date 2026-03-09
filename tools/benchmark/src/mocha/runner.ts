/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { isChildProcess } from "../Configuration.js";
import {
	isResultError,
	parseBenchmarkResult,
	type BenchmarkResult,
	type CollectedData,
} from "../ResultTypes.js";
import { captureResults } from "../ResultUtilities.js";
import { fail } from "../assert.js";

/**
 * Wrapper for the contents of a mocha test that supports running in a child process and emitting results to the mocha reporter.
 */
export async function supportParentProcess(
	testFullTitle: string,
	isParentProcess: boolean,
	run: () => CollectedData | Promise<CollectedData>,
): Promise<{ result: BenchmarkResult; exception?: Error }> {
	const inner = isParentProcess ? async () => await parentProcessRun(testFullTitle) : run;
	return captureResults(inner, isChildProcess ? "Child Process Duration" : undefined);
}

/**
 * Runs the specified test in a child process and returns the results.
 * @remarks
 * The provided test must write a {@link BenchmarkResult} to the console.
 * See {@link BenchmarkReporter.recordTestResult} which does this for child processes.
 */
async function parentProcessRun(
	testFullTitle: string,
): Promise<CollectedData | Promise<CollectedData>> {
	// Instead of running the benchmark in this process, create a new process.
	// See {@link isParentProcess} for why.
	// Launch new process, with:
	// - mocha filter to run only this test.
	// - --parentProcess flag removed.
	// - --childProcess flag added (so data will be returned via stdout as json)

	// Pull the command (Node.js most likely) out of the first argument since spawnSync takes it separately.
	const command = process.argv0 ?? fail("there must be a command");

	const reusedArgs = process.argv.slice(1);
	reusedArgs[0] =
		"/workspaces/FluidFramework/tools/benchmark/node_modules/.pnpm/mocha@10.8.2/node_modules/mocha/lib/cli/cli.js";

	// We expect all node-specific flags to be present in execArgv so they can be passed to the child process.
	// At some point mocha was processing the expose-gc flag itself and not passing it here, unless explicitly
	// put in mocha's --node-option flag.
	const childArgs = [...process.execArgv, ...reusedArgs];
	childArgs.push("--childProcess");

	// Remove arguments for any existing test filters.
	for (const flag of ["--grep", "--fgrep"]) {
		const flagIndex = childArgs.indexOf(flag);
		if (flagIndex > 0) {
			// Remove the flag, and the argument after it (all these flags take one argument)
			childArgs.splice(flagIndex, 2);
		}
	}

	// Add test filter so child process only run the current test.
	childArgs.push("--fgrep", testFullTitle);

	// Remove arguments for debugging if they're present; in order to debug child processes we need
	// to specify a new debugger port for each, or they'll fail to start. Doable, but leaving it out
	// of scope for now.
	// Also strip parallel.
	let inspectArgIndex: number = -1;
	while (
		(inspectArgIndex = childArgs.findIndex((x) =>
			x.match(/^((--inspect|--debug).*|--parallel)/),
		)) >= 0
	) {
		childArgs.splice(inspectArgIndex, 1);
	}

	// Do this import only if isParentProcess to enable running in the web as long as isParentProcess is false.
	const childProcess = await import("node:child_process");
	const result = childProcess.spawnSync(command, childArgs, { encoding: "utf8" });

	// Find the BenchmarkResult in the child's output.
	const output = result.stdout.split("\n").filter((s) => s.match(/^(\[.*\]|\{.*\})$/));

	const throwChildProcessErrors = () => {
		if (result.error) {
			// If we did not find an error in the output, error if the child process reported other errors:
			throw new Error(`Child process reported error: ${result.error.message}`);
		}
		if (result.stderr !== "") {
			throw new Error(`Child process logged errors:\n${result.stderr}\n`);
		}
	};

	if (output.length === 0) {
		// Prioritize errors from child process over error that child process had no output
		// since its likely that if such errors occurred, they caused the lack of output.
		throwChildProcessErrors();
		throw new Error(
			`Child process must output a line with a json object or array. Got:\n${result.stdout}`,
		);
	}
	if (output.length > 1) {
		// Prioritize errors from child process over error that child process had invalid output
		// since its likely that if such errors occurred, they caused the invalid output.
		throwChildProcessErrors();
		throw new Error(
			`Child process must output a single json object or array. Found ${output.length}.
This may be caused by there being multiple mocha tests with the same fullTitle: ${JSON.stringify(
				testFullTitle,
			)}
Such tests are not supported by --parentProcess since there is no way to filter the child process to the correct test.
The full output from the run was:
${result.stdout}`,
		);
	}

	const fromChild = parseBenchmarkResult(output[0]);
	if (isResultError(fromChild)) {
		// Caught by captureResults and converted back into error data.
		// Prioritize this over ChildProcessErrors, since if we have structured error data, its likely that everything worked correctly except a test failed,
		// and the output is much cleaner if we just propagate this error as if it were thrown in this process.
		throw new Error(fromChild.error);
	}

	// Last chance to report errors from the child process even if the data looked good.
	throwChildProcessErrors();

	return fromChild;
}
