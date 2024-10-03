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

import type { TestUsers } from "./getTestUsers.js";
import type { TestConfiguration } from "./testConfigFile.js";
import { initialize } from "./utils.js";

const createLoginEnv = (userName: string, password: string) =>
	`{"${userName}": "${password}"}`;

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
		testUsers: TestUsers | undefined;
		profileName: string;
		logger: ITelemetryLoggerExt;
		outputDir: string;
	},
) {
	const {
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

	await Promise.all(
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
			const runnerProcess = child_process.spawn("node", childArgs, {
				stdio: "inherit",
				env: envVar,
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
