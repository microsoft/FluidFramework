/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */
import { ContainerFactorySchema } from "./interface";
import { loggerP } from "./logger";
import { NestedMapRunner, NestedMapRunConfig } from "./NestedMapRunner";
import { commanderParseIntArg, getCommander } from "./utils";

async function main() {
	const commander = getCommander()
		.requiredOption("-s, --schema <schema>", "Container Schema")
		.requiredOption("-n, --numMaps <numMaps>", "Number of nested maps")
		.requiredOption("-k, --initialMapKey <initialMapKey>", "Key of initial map to nest from")
		.option("-d, --docId <docId>", "Document id")
		.option("-wr, --writeRatePerMin <writeRatePerMin>", "Rate of writes", commanderParseIntArg)
		.option("-dt, --dataType <dataType>", "uuid or number, stored as value in each map")
		.parse(process.argv);

	const config: NestedMapRunConfig = {
		runId: commander.runId,
		scenarioName: commander.scenarioName,
		childId: commander.childId,
		schema: JSON.parse(commander.schema) as ContainerFactorySchema,
		numMaps: commander.numMaps,
		docId: commander.docId,
		dataType: commander.dataType,
		initialMapKey: commander.initialMapKey,
		writeRatePerMin: commander.writeRatePerMin,
	};

	if (commander.log !== undefined) {
		process.env.DEBUG = commander.log;
	}

	await NestedMapRunner.execRun(config);

	const scenarioLogger = await loggerP;
	await scenarioLogger.flush();

	process.exit(0);
}

main().catch((error) => {
	console.error(error);
	process.exit(-1);
});
