/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import child_process from "child_process";

import { ITestDriver } from "@fluid-internal/test-driver-definitions";
import {
	ITelemetryLoggerExt,
	TelemetryDataTag,
} from "@fluidframework/telemetry-utils/internal";
import ps from "ps-node";
import xml from "xml";

import type { TestUsers } from "./getTestUsers.js";
import { GcFailureExitCode, type TestConfiguration } from "./testConfigFile.js";
import { initialize, writeToFile } from "./utils.js";

const createLoginEnv = (userName: string, password: string) =>
	`{"${userName}": "${password}"}`;

function msSinceTime(time: Date) {
	return new Date().valueOf() - time.valueOf();
}

interface RunnerResult {
	// eslint-disable-next-line @rushstack/no-new-null
	returnCode: number | null;
	durationMs: number;
	index: number;
}

/**
 * Implementation of the orchestrator process. Returns the return code to exit the process with.
 */
export async function stressTest(
	testDriver: ITestDriver,
	profile: TestConfiguration,
	args: {
		workLoadPath: string;
		testId: string | undefined;
		debug: boolean;
		verbose: boolean;
		seed: number;
		enableMetrics: boolean;
		createTestId: boolean;
		testUsers: TestUsers | undefined;
		profileName: string;
		logger: ITelemetryLoggerExt;
		outputDir: string;
	},
) {
	const {
		workLoadPath,
		testId,
		debug,
		verbose,
		seed,
		enableMetrics,
		createTestId,
		testUsers,
		profileName,
		logger,
		outputDir,
	} = args;

	const url = await (testId !== undefined && !createTestId
		? // If testId is provided and createTestId is false, then load the file;
			testDriver.createContainerUrl(testId)
		: // If no testId is provided, (or) if testId is provided but createTestId is true, then
			// create a file;
			// In case testId is provided, name of the file to be created is taken as the testId provided
			initialize(testDriver, seed, profile, workLoadPath, verbose, logger, testId));

	logger.sendTelemetryEvent({
		eventName: "ResolveStressTestDocument",
		url: { value: url, tag: TelemetryDataTag.UserData },
	});

	const estRunningTimeMin = Math.floor(profile.totalSendCount / profile.opRatePerMin);
	const startTime = new Date();
	console.log(`Connecting to ${testId !== undefined ? "existing" : "new"}`);
	console.log(`Selected test profile: ${profileName}`);
	console.log(`Estimated run time: ${estRunningTimeMin} minutes\n`);
	console.log(`Start time: ${startTime.toTimeString()}`);

	const runnerArgs: string[][] = [];
	for (let i = 0; i < profile.numClients; i++) {
		const childArgs: string[] = [
			"./dist/runner.js",
			"--driver",
			testDriver.type,
			"--profile",
			profileName,
			"--runId",
			i.toString(),
			"--url",
			url,
			"--seed",
			`0x${seed.toString(16)}`,
			"--workLoadPath",
			workLoadPath,
			"--outputDir",
			outputDir,
		];
		if (debug) {
			const debugPort = 9230 + i; // 9229 is the default and will be used for the root orchestrator process
			childArgs.unshift(`--inspect-brk=${debugPort}`);
		}
		if (verbose) {
			childArgs.push("--verbose");
		}
		if (enableMetrics) {
			childArgs.push("--enableOpsMetrics");
		}

		if (testDriver.endpointName !== undefined) {
			childArgs.push(`--driverEndpoint`, testDriver.endpointName);
		}

		runnerArgs.push(childArgs);
	}
	console.log(runnerArgs.map((a) => a.join(" ")).join("\n"));

	if (enableMetrics) {
		setInterval(() => {
			ps.lookup(
				{
					command: "node",
					ppid: process.pid,
				},
				(_, results) => {
					if (results !== undefined) {
						logger.send({
							category: "metric",
							eventName: "Runner Processes",
							testHarnessEvent: true,
							value: results.length,
						});
					}
				},
			);
		}, 20000);
	}

	const runnerResults: RunnerResult[] | undefined = await Promise.all(
		runnerArgs.map(async (childArgs, index) => {
			const testUser =
				testUsers !== undefined ? testUsers[index % testUsers.length] : undefined;
			const username = testUser !== undefined ? testUser.username : undefined;
			const password = testUser !== undefined ? testUser.password : undefined;
			const envVar = { ...process.env };
			if (username !== undefined && password !== undefined) {
				if (testDriver.endpointName === "odsp") {
					envVar.login__odsp__test__accounts = createLoginEnv(username, password);
				} else if (testDriver.endpointName === "odsp-df") {
					envVar.login__odspdf__test__accounts = createLoginEnv(username, password);
				}
			}
			const runnerStartTime = new Date();
			const runnerProcess = child_process.spawn("node", childArgs, {
				stdio: "inherit",
				env: envVar,
			});

			setupTelemetry(runnerProcess, logger, index, username);
			if (enableMetrics) {
				setupDataTelemetry(runnerProcess, logger, index, username);
			}

			return new Promise<RunnerResult>((resolve) =>
				runnerProcess.once("close", (returnCode, _signals) => {
					resolve({ returnCode, index, durationMs: msSinceTime(runnerStartTime) });
				}),
			);
		}),
	);

	//* MERGE_TODO: What if the above throws?  This was in a finally block.
	//* Check response to https://github.com/microsoft/FluidFramework/pull/22037/files#r1710012004
	const durationMs = msSinceTime(startTime);
	console.log(`Duration: ${new Date(durationMs).toISOString().split(/T|Z/)[1]}`);

	if (runnerResults === undefined) {
		console.error("NO TEST RESULTS FOUND TO OUTPUT");
	} else {
		writeTestResultXmlFile(runnerResults, durationMs / 1000 /* durationSec */);
	}

	const endTime = Date.now();
	console.log(`End time: ${endTime} ms\n`);
	console.log(`Total run time: ${durationMs / 1000}s\n`);
}

/** Format the runner results into the JUnit XML format expected by ADO and write to a file */
function writeTestResultXmlFile(results: RunnerResult[], durationSec: number) {
	const resultsForXml = results.map(({ returnCode, index, durationMs }) => {
		const _attr = {
			classname: "StressRunner",
			name: `Runner_${index}`,
			time: durationMs / 1000,
		};
		if (returnCode === GcFailureExitCode) {
			// Failure
			return {
				testcase: [
					{ _attr },
					{
						failure: `GC failure - check pipeline logs to find the error.`,
					},
				],
			};
		}
		if (returnCode === 0) {
			// Success
			return { testcase: [{ _attr }] };
		}
		return {
			// Success but with non-zero exit code.
			testcase: [{ _attr }, { exitCode: returnCode }],
		};
	});
	const suiteAttributes = {
		name: "Stress Test",
		tests: results.length,
		failures: results.filter(({ returnCode }) => returnCode === GcFailureExitCode).length,
		errors: results.filter(({ returnCode }) => returnCode !== 0).length,
		time: durationSec,
		// timestamp: e.g. Wed, 16 Nov 2022 18:15:06 GMT
	};
	const outputObj: xml.XmlObject = {
		testsuite: [{ _attr: suiteAttributes }, ...resultsForXml],
	};
	const outputXml = xml(outputObj, true);
	console.log(outputXml);

	const timestamp = new Date().toISOString();
	writeToFile(outputXml, "output", `${timestamp}-junit-report.xml`);
}

/**
 * Setup event and metrics telemetry to be sent to loggers.
 */
function setupTelemetry(
	process: child_process.ChildProcess,
	logger: ITelemetryLoggerExt,
	runId: number,
	username: string | undefined,
) {
	logger.send({
		category: "metric",
		eventName: "Runner Started",
		testHarnessEvent: true,
		value: 1,
		username,
		runId,
	});

	process.once("error", (e) => {
		logger.send({
			category: "metric",
			eventName: "Runner Start Error",
			testHarnessEvent: true,
			value: 1,
			username,
			runId,
		});
		logger.sendErrorEvent(
			{
				eventName: "Runner Start Error",
				testHarnessEvent: true,
				username,
				runId,
			},
			e,
		);
	});

	process.once("exit", (code) => {
		logger.send({
			category: "metric",
			eventName: "Runner Exited",
			testHarnessEvent: true,
			value: 1,
			username,
			runId,
			exitCode: code ?? 0,
		});
		console.log(`RunId: ${runId} exited with code ${code}`);
	});
}

function setupDataTelemetry(
	process: child_process.ChildProcess,
	logger: ITelemetryLoggerExt,
	runId: number,
	username?: string,
) {
	let stdOutLine = 0;
	process.stdout?.on("data", (chunk) => {
		const data = String(chunk);
		console.log(data);
		if (data.replace(/\./g, "").length > 0) {
			logger.send({
				eventName: "Runner Console",
				testHarnessEvent: true,
				category: "generic",
				lineNo: stdOutLine,
				runId,
				username,
				data,
			});
			stdOutLine++;
		}
	});

	let stdErrLine = 0;
	process.stderr?.on("data", (chunk) => {
		const data = String(chunk);
		console.log(data);
		logger.send({
			eventName: "Runner Error",
			testHarnessEvent: true,
			category: "error",
			lineNo: stdErrLine,
			runId,
			username,
			data,
			error: data.split("\n")[0],
		});
		stdErrLine++;
	});
}
