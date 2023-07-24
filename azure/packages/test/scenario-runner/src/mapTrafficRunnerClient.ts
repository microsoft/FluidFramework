/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */
import { ContainerFactorySchema } from "./interface";
import { loggerP } from "./logger";
import { MapTrafficRunner, MapTrafficRunConfig } from "./MapTrafficRunner";
import { commanderParseIntArg, getCommander } from "./utils";

async function main() {
	const commander = getCommander()
		.requiredOption("-d, --docId <docId>", "Document ID to target")
		.requiredOption("-s, --schema <schema>", "Container Schema")
		.requiredOption(
			"-wr, --writeRatePerMin <writeRatePerMin>",
			"Rate of writes",
			commanderParseIntArg,
		)
		.requiredOption(
			"-wc, --totalWriteCount <totalWriteCount>",
			"Total write count",
			commanderParseIntArg,
		)
		.requiredOption("-k, --sharedMapKey <sharedMapKey>", "Shared map location")
		.parse(process.argv);

	const config: MapTrafficRunConfig = {
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

	const scenarioLogger = await loggerP;
	await scenarioLogger.flush();

	process.exit(0);
}

main().catch((error) => {
	console.error(error);
	process.exit(-1);
});
