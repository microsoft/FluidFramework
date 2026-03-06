/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { isChildProcess } from "../Configuration.js";
import { isResultError, type BenchmarkResult, type CollectedData } from "../ResultTypes.js";
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

	// We expect all node-specific flags to be present in execArgv so they can be passed to the child process.
	// At some point mocha was processing the expose-gc flag itself and not passing it here, unless explicitly
	// put in mocha's --node-option flag.
	const childArgs = [...process.execArgv, ...process.argv.slice(1)];
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
	let inspectArgIndex: number = -1;
	while ((inspectArgIndex = childArgs.findIndex((x) => x.match(/^(--inspect|--debug).*/))) >= 0) {
		childArgs.splice(inspectArgIndex, 1);
	}

	// Do this import only if isParentProcess to enable running in the web as long as isParentProcess is false.
	const childProcess = await import("node:child_process");
	const result = childProcess.spawnSync(command, childArgs, { encoding: "utf8" });

	// Find the BenchmarkResult in the child's output.
	const output = result.stdout.split("\n").filter((s) => s.match(/^(\[.*\]|\{.*\})$/));
	if (output.length === 0) {
		fail(
			`Child process must output a line with a json object or array. Got:\n${result.stdout}`,
		);
	}
	if (output.length > 1) {
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

	const fromChild = JSON.parse(output[0], (_key, value: unknown): unknown => {
		if (value === null) {
			// Assumes all nulls in the data were NaN values which failed to survive JSON.stringify
			// since JSON doesn't support NaN.
			// If there are actually null values in the data, or infinities, this will cause them to be misreported as NaN.
			// Generally this should be fine, as we don't expect to hit those other cases,
			// and if we do the NaN indicates some numeric issue that should be investigated anyway.
			return Number.NaN;
		}
		return value;
		// This type cast assumes the data is well formed. More validation might be nice, but it should be valid as we control the output.
	}) as BenchmarkResult;

	if (isResultError(fromChild)) {
		// Caught by captureResults and converted back into error data.
		throw new Error(fromChild.error);
	}

	// If we did not find an error in the output, error if the child process reported other errors:
	if (result.error) {
		throw new Error(`Child process reported error: ${result.error.message}`);
	}
	if (result.stderr !== "") {
		throw new Error(`Child process logged errors: ${result.stderr}`);
	}

	return fromChild;
}
