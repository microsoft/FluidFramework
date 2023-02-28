/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */
import commander from "commander";

import { TestOrchestrator } from "./TestOrchestrator";

async function main() {
	commander
		.version("0.0.1")
		.requiredOption("-c, --config <config>", "Yaml config to run", "v1")
		.parse(process.argv);
	const version: string = commander.config;
	const o = new TestOrchestrator({ version });
	await o.run().then((success: boolean) => {
		console.log(`TestOrchestrator: done (${success ? "Success" : "Failed"})`);
		process.exit(success ? 0 : -1);
	});
}

main().catch((error) => {
	console.error("TestOrchestrator error:", error);
	process.exit(-1);
});
