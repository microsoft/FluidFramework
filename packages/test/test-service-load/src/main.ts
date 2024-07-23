/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { DriverEndpoint, TestDriverTypes } from "@fluid-internal/test-driver-definitions";
import commander from "commander";

import { getProfile } from "./getProfile.js";
import { getTestUsers } from "./getTestUsers.js";
import { stressTest } from "./stressTest.js";
import { createTestDriver } from "./utils.js";

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

	await stressTest(testDriver, profile, {
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

main().catch((error) => {
	console.error(error);
	process.exit(-1);
});
