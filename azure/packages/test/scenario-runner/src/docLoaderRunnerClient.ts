/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */
import { ContainerFactorySchema } from "./interface";
import { loggerP } from "./logger";
import { DocLoaderRunner, DocLoaderRunConfig } from "./DocLoaderRunner";
import { getCommander } from "./utils";

async function main() {
	const commander = getCommander()
		.requiredOption("-s, --schema <schema>", "Container Schema")
		.requiredOption("-d, --docId <docId>", "Document id")
		.parse(process.argv);

	const config: DocLoaderRunConfig = {
		runId: commander.runId,
		scenarioName: commander.scenarioName,
		childId: commander.childId,
		docId: commander.docId,
		schema: JSON.parse(commander.schema) as ContainerFactorySchema,
	};

	if (commander.log !== undefined) {
		process.env.DEBUG = commander.log;
	}

	await DocLoaderRunner.execRun(config);

	const scenarioLogger = await loggerP;
	await scenarioLogger.flush();

	process.exit(0);
}

main().catch((error) => {
	console.error(error);
	process.exit(-1);
});
