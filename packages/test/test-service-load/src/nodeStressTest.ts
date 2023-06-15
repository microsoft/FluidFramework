/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import child_process from "child_process";
import fs from "fs";
import ps from "ps-node";
import commander from "commander";
import xml from "xml";
import {
	TestDriverTypes,
	DriverEndpoint,
	ITestDriver,
} from "@fluidframework/test-driver-definitions";
import { ITelemetryLoggerExt } from "@fluidframework/telemetry-utils";
import { GcFailureExitCode, ILoadTestConfig } from "./testConfigFile";
import {
	createLogger,
	createTestDriver,
	getProfile,
	initialize,
	safeExit,
	writeToFile,
} from "./utils";

interface ITestUserConfig {
	/* Credentials' key/value description:
	 * Key    : Username for the client
	 * Value  : Password specific to that username
	 */
	credentials: Record<string, string>;
}

async function getTestUsers(credFile?: string) {
	if (credFile === undefined || credFile.length === 0) {
		return undefined;
	}

	let config: ITestUserConfig;
	try {
		config = JSON.parse(fs.readFileSync(credFile, "utf8"));
		return config;
	} catch (e) {
		console.error(`Failed to read ${credFile}`);
		console.error(e);
		return undefined;
	}
}

const createLoginEnv = (userName: string, password: string) => `{"${userName}": "${password}"}`;

async function main() {
	commander
		.version("0.0.1")
		.requiredOption("-d, --driver <driver>", "Which test driver info to use", "odsp")
		.requiredOption(
			"-p, --profile <profile>",
			"Which test profile to use from testConfig.json",
			"ci",
		)
		.option("-e, --driverEndpoint <endpoint>", "Which endpoint should the driver target?")
		.option("-id, --testId <testId>", "Load an existing data store rather than creating new")
		.option("-c, --credFile <filePath>", "Filename containing user credentials for test")
		.option("-s, --seed <number>", "Seed for this run")
		.option("-dbg, --debug", "Debug child processes via --inspect-brk")
		.option(
			"-l, --log <filter>",
			"Filter debug logging. If not provided, uses DEBUG env variable.",
		)
		.option("-v, --verbose", "Enables verbose logging")
		.option(
			"-b, --browserAuth",
			"Enables browser auth which may require a user to open a url in a browser.",
		)
		.option("-m, --enableMetrics", "Enable capturing client & ops metrics")
		.option(
			"--createTestId",
			"Flag indicating whether to create a document corresponding \
        to the testId passed",
		)
		.parse(process.argv);

	const driver: TestDriverTypes = commander.driver;
	const endpoint: DriverEndpoint | undefined = commander.driverEndpoint;
	const profileName: string = commander.profile;
	const testId: string | undefined = commander.testId;
	const debug: true | undefined = commander.debug;
	const log: string | undefined = commander.log;
	const verbose: true | undefined = commander.verbose;
	const seed: number = commander.seed ?? Date.now();
	const browserAuth: true | undefined = commander.browserAuth;
	const credFile: string | undefined = commander.credFile;
	const enableMetrics: boolean = commander.enableMetrics ?? false;
	const createTestId: boolean = commander.createTestId ?? false;

	const profile = getProfile(profileName);

	if (log !== undefined) {
		process.env.DEBUG = log;
	}

	const testUsers = await getTestUsers(credFile);

	const testDriver = await createTestDriver(driver, endpoint, seed, undefined, browserAuth);

	await orchestratorProcess(testDriver, profile, {
		testId,
		debug,
		verbose,
		seed,
		enableMetrics,
		createTestId,
		testUsers,
		profileName,
	});
}

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
async function orchestratorProcess(
	testDriver: ITestDriver,
	profile: ILoadTestConfig,
	args: {
		testId?: string;
		debug?: true;
		verbose?: true;
		seed: number;
		enableMetrics?: boolean;
		createTestId?: boolean;
		testUsers?: ITestUserConfig;
		profileName: string;
	},
) {
	const url = await (args.testId !== undefined && args.createTestId === false
		? // If testId is provided and createTestId is false, then load the file;
		  testDriver.createContainerUrl(args.testId)
		: // If no testId is provided, (or) if testId is provided but createTestId is not false, then
		  // create a file;
		  // In case testId is provided, name of the file to be created is taken as the testId provided
		  initialize(
				testDriver,
				args.seed,
				profile,
				args.verbose === true,
				args.profileName,
				args.testId,
		  ));

	const estRunningTimeMin = Math.floor(profile.totalSendCount / profile.opRatePerMin);
	console.log(`Connecting to ${args.testId !== undefined ? "existing" : "new"}`);
	console.log(`Selected test profile: ${args.profileName}`);
	console.log(`Estimated run time: ${estRunningTimeMin} minutes\n`);

	const startTime = new Date();
	console.log(`start time: ${startTime.toTimeString()}`);
	const logger = await createLogger({
		driverType: testDriver.type,
		driverEndpointName: testDriver.endpointName,
		profile: args.profileName,
		runId: undefined,
	});

	const runnerArgs: string[][] = [];
	for (let i = 0; i < profile.numClients; i++) {
		const childArgs: string[] = [
			"./dist/runner.js",
			"--driver",
			testDriver.type,
			"--profile",
			args.profileName,
			"--runId",
			i.toString(),
			"--url",
			url,
			"--seed",
			`0x${args.seed.toString(16)}`,
		];
		if (args.debug === true) {
			const debugPort = 9230 + i; // 9229 is the default and will be used for the root orchestrator process
			childArgs.unshift(`--inspect-brk=${debugPort}`);
		}
		if (args.verbose === true) {
			childArgs.push("--verbose");
		}
		if (args.enableMetrics === true) {
			childArgs.push("--enableOpsMetrics");
		}

		if (testDriver.endpointName !== undefined) {
			childArgs.push(`--driverEndpoint`, testDriver.endpointName);
		}

		runnerArgs.push(childArgs);
	}
	console.log(runnerArgs.map((a) => a.join(" ")).join("\n"));

	if (args.enableMetrics === true) {
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

	let runnerResults: RunnerResult[] | undefined;
	try {
		const usernames =
			args.testUsers !== undefined ? Object.keys(args.testUsers.credentials) : undefined;
		runnerResults = await Promise.all(
			runnerArgs.map(async (childArgs, index) => {
				const username =
					usernames !== undefined ? usernames[index % usernames.length] : undefined;
				const password =
					username !== undefined ? args.testUsers?.credentials[username] : undefined;
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

				if (args.enableMetrics === true) {
					setupTelemetry(runnerProcess, logger, index, username);
				}

				return new Promise<RunnerResult>((resolve) =>
					runnerProcess.once("close", (returnCode, _signals) => {
						resolve({ returnCode, index, durationMs: msSinceTime(runnerStartTime) });
					}),
				);
			}),
		);
	} finally {
		const durationMs = msSinceTime(startTime);
		console.log(`Duration: ${new Date(durationMs).toISOString().split(/T|Z/)[1]}`);

		if (runnerResults === undefined) {
			console.error("NO TEST RESULTS FOUND TO OUTPUT");
		} else {
			writeTestResultXmlFile(runnerResults, durationMs / 1000 /* durationSec */);
		}

		await safeExit(0, url);
	}
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
		name: "GC Stress Test",
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
	username?: string,
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
	});

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

main().catch((error) => {
	console.error(error);
	process.exit(-1);
});
