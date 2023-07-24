/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */
import commander from "commander";

import { ContainerFactorySchema } from "./interface";
import { MapTrafficRunner, MapTrafficRunnerRunConfig } from "./MapTrafficRunner";

async function main() {
	const parseIntArg = (value: any): number => {
		if (isNaN(parseInt(value, 10))) {
			throw new commander.InvalidArgumentError("Not a number.");
		}
		return parseInt(value, 10);
	};
	commander
		.version("0.0.1")
		.requiredOption("-d, --docId <docId>", "Document ID to target")
		.requiredOption("-s, --schema <schema>", "Container Schema")
		.requiredOption("-r, --runId <runId>", "orchestrator run id.")
		.requiredOption("-s, --scenarioName <scenarioName>", "scenario name.")
		.requiredOption("-c, --childId <childId>", "id of this node client.", parseIntArg)
		.requiredOption("-wr, --writeRatePerMin <writeRatePerMin>", "Rate of writes", parseIntArg)
		.requiredOption(
			"-wc, --totalWriteCount <totalWriteCount>",
			"Total write count",
			parseIntArg,
		)
		.requiredOption("-k, --sharedMapKey <sharedMapKey>", "Shared map location")
		.option(
			"-l, --log <filter>",
			"Filter debug logging. If not provided, uses DEBUG env variable.",
		)
		.requiredOption("-v, --verbose", "Enables verbose logging")
		.parse(process.argv);

	const config: MapTrafficRunnerRunConfig = {
		runId: commander.runId,
		scenarioName: commander.scenarioName,
		childId: commander.childId,
		docId: commander.docId,
		writeRatePerMin: commander.writeRatePerMin,
		totalWriteCount: commander.totalWriteCount,
		sharedMapKey: commander.sharedMapKey,
		schema: JSON.parse(commander.schema) as ContainerFactorySchema,
	};

	if (commander.log !== undefined) {
		process.env.DEBUG = commander.log;
	}

	if (config.docId === undefined) {
		console.error("Missing --docId argument needed to run child process");
		process.exit(-1);
	}

	await MapTrafficRunner.execRun(config);
	process.exit(0);
}

main().catch((error) => {
	console.error(error);
	process.exit(-1);
});
