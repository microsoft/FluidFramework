/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import child_process from "child_process";

import { ITestDriver } from "@fluid-internal/test-driver-definitions";
import { assertOdspEndpoint, getOdspCredentials } from "@fluid-private/test-drivers";
import { LogLevel } from "@fluidframework/core-interfaces";
import {
	TelemetryLoggerExt,
	TelemetryDataTag,
} from "@fluidframework/telemetry-utils/internal";
import ps from "ps-node";

import type { TestConfiguration } from "./testConfigFile.js";
import { initialize } from "./utils.js";

/**
 * Resolves the list of ODSP usernames the runners can be distributed across.
 * Returns an empty list for non-ODSP drivers, which don't select a user.
 */
function getOdspUsernames(testDriver: ITestDriver): string[] {
	if (testDriver.type !== "odsp") {
		return [];
	}
	const endpointName = testDriver.endpointName ?? "odsp";
	assertOdspEndpoint(endpointName);
	return getOdspCredentials(endpointName, 0).map((credentials) => credentials.username);
}

/**
 * Implementation of the orchestrator process. Returns the return code to exit the process with.
 */
export async function stressTest(
	testDriver: ITestDriver,
	profile: TestConfiguration,
	args: {
		testId: string | undefined;
		debug: boolean;
		verbose: boolean;
		seed: number;
		enableMetrics: boolean;
		createTestId: boolean;
		profileName: string;
		logger: TelemetryLoggerExt;
		outputDir: string;
	},
): Promise<void> {
	const {
		testId,
		debug,
		verbose,
		seed,
		enableMetrics,
		createTestId,
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
			initialize(testDriver, seed, profile, verbose, logger, testId));

	logger.sendTelemetryEvent({
		eventName: "ResolveStressTestDocument",
		url: { value: url, tag: TelemetryDataTag.UserData },
	});

	const estRunningTimeMin = Math.floor(
		(2 * profile.totalSendCount) / (profile.opRatePerMin * profile.numClients),
	);
	const startTime = Date.now();
	console.log(`Connecting to ${testId !== undefined ? "existing" : "new"}`);
	console.log(`Selected test profile: ${profileName}`);
	console.log(`Estimated run time: ${estRunningTimeMin} minutes\n`);
	console.log(`Start time: ${startTime} ms\n`);

	// Assign users to runners round-robin so load is spread evenly across the available test users.
	const usernames = getOdspUsernames(testDriver);

	const runners: { childArgs: string[]; username: string | undefined }[] = [];
	for (let i = 0; i < profile.numClients; i++) {
		const username = usernames.length > 0 ? usernames[i % usernames.length] : undefined;
		const childArgs: string[] = [
			"./lib/runner.js",
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

		if (username !== undefined) {
			childArgs.push("--username", username);
		}

		runners.push({ childArgs, username });
	}
	console.log(runners.map(({ childArgs }) => childArgs.join(" ")).join("\n"));

	if (enableMetrics) {
		setInterval(() => {
			ps.lookup(
				{
					command: "node",
					ppid: process.pid,
				},
				(_, results) => {
					if (results !== undefined) {
						logger.send(
							{
								category: "metric",
								eventName: "Runner Processes",
								testHarnessEvent: true,
								value: results.length,
							},
							LogLevel.essential,
						);
					}
				},
			);
		}, 20000);
	}

	await Promise.all(
		runners.map(async ({ childArgs, username }, index) => {
			const runnerProcess = child_process.spawn("node", childArgs, {
				stdio: "inherit",
			});

			setupTelemetry(runnerProcess, logger, index, username);
			if (enableMetrics) {
				setupDataTelemetry(runnerProcess, logger, index, username);
			}

			return new Promise((resolve) => runnerProcess.once("close", resolve));
		}),
	);
	const endTime = Date.now();
	console.log(`End time: ${endTime} ms\n`);
	console.log(`Total run time: ${(endTime - startTime) / 1000}s\n`);
}

/**
 * Setup event and metrics telemetry to be sent to loggers.
 */
function setupTelemetry(
	process: child_process.ChildProcess,
	logger: TelemetryLoggerExt,
	runId: number,
	username: string | undefined,
): void {
	logger.send(
		{
			category: "metric",
			eventName: "Runner Started",
			testHarnessEvent: true,
			value: 1,
			username,
			runId,
		},
		LogLevel.essential,
	);

	process.once("error", (e) => {
		logger.send(
			{
				category: "metric",
				eventName: "Runner Start Error",
				testHarnessEvent: true,
				value: 1,
				username,
				runId,
			},
			LogLevel.essential,
		);
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
		logger.send(
			{
				category: "metric",
				eventName: "Runner Exited",
				testHarnessEvent: true,
				value: 1,
				username,
				runId,
				exitCode: code ?? 0,
			},
			LogLevel.essential,
		);
		console.log(`RunId: ${runId} exited with code ${code}`);
	});
}

function setupDataTelemetry(
	process: child_process.ChildProcess,
	logger: TelemetryLoggerExt,
	runId: number,
	username?: string,
): void {
	let stdOutLine = 0;
	process.stdout?.on("data", (chunk) => {
		const data = String(chunk);
		console.log(data);
		if (data.replace(/\./g, "").length > 0) {
			logger.send(
				{
					eventName: "Runner Console",
					testHarnessEvent: true,
					category: "generic",
					lineNo: stdOutLine,
					runId,
					username,
					data,
				},
				LogLevel.essential,
			);
			stdOutLine++;
		}
	});

	let stdErrLine = 0;
	process.stderr?.on("data", (chunk) => {
		const data = String(chunk);
		console.log(data);
		logger.send(
			{
				eventName: "Runner Error",
				testHarnessEvent: true,
				category: "error",
				lineNo: stdErrLine,
				runId,
				username,
				data,
				error: data.split("\n")[0],
			},
			LogLevel.essential,
		);
		stdErrLine++;
	});
}
