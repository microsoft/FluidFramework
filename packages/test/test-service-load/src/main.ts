/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { DriverEndpoint, TestDriverTypes } from "@fluid-internal/test-driver-definitions";
import commander from "commander";

import { createLogger } from "./FileLogger.js";
import { getProfile } from "./getProfile.js";
import { getTestUsers } from "./getTestUsers.js";
import { stressTest } from "./stressTest.js";
import { createTestDriver } from "./utils.js";

const readRunOptions = () => {
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
	const debug: boolean = commander.debug ?? false;
	const log: string | undefined = commander.log;
	const verbose: boolean = commander.verbose ?? false;
	const seed: number = commander.seed ?? Date.now();
	const supportsBrowserAuth: boolean = commander.browserAuth ?? false;
	const credFilePath: string | undefined = commander.credFile;
	const enableMetrics: boolean = commander.enableMetrics ?? false;
	const createTestId: boolean = commander.createTestId ?? false;

	return {
		driver,
		endpoint,
		profileName,
		testId,
		debug,
		log,
		verbose,
		seed,
		supportsBrowserAuth,
		credFilePath,
		enableMetrics,
		createTestId,
	};
};

const main = async () => {
	const {
		driver,
		endpoint,
		profileName,
		testId,
		debug,
		log,
		verbose,
		seed,
		supportsBrowserAuth,
		credFilePath,
		enableMetrics,
		createTestId,
	} = readRunOptions();

	if (log !== undefined) {
		process.env.DEBUG = log;
	}

	const testDriver = await createTestDriver(
		driver,
		endpoint,
		seed,
		undefined, // runId
		supportsBrowserAuth,
	);

	const startTime = Date.now();
	const outputDir = `${__dirname}/output/${startTime}`;
	const { logger, flush } = await createLogger(outputDir, "orchestrator", {
		driverType: testDriver.type,
		driverEndpointName: testDriver.endpointName,
		profile: profileName,
		runId: undefined,
	});

	let result = -1;
	try {
		const profile = getProfile(profileName);

		const testUsers = credFilePath !== undefined ? getTestUsers(credFilePath) : undefined;

		await stressTest(testDriver, profile, {
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
		});
		result = 0;
	} finally {
		// There seems to be at least one dangling promise in ODSP Driver, give it a second to resolve
		// TODO: Track down the dangling promise and fix it.
		await new Promise((resolve) => {
			setTimeout(resolve, 1000);
		});
		// Flush the logs
		await flush();

		process.exit(result);
	}
};

main().catch((error) => {
	// Most of the time we'll exit the process through the process.exit() in main.
	// However, if we error outside of that try/catch block we'll catch it here.
	console.error("Error occurred during setup");
	console.error(error);
	process.exit(-1);
});
