/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */
import { ContainerFactorySchema } from "../interface";
import { loggerP } from "../logger";
import { getCommander } from "../utils";

import { ExampleScenarioRunner, ExampleScenarioRunConfig } from "./ExampleScenarioRunner";

async function main() {
	const commander = getCommander()
		.requiredOption("-s, --schema <schema>", "Container Schema")
		.parse(process.argv);

	const config: ExampleScenarioRunConfig = {
		runId: commander.runId,
		scenarioName: commander.scenarioName,
		childId: commander.childId,
		schema: JSON.parse(commander.schema) as ContainerFactorySchema,
	};

	if (commander.log !== undefined) {
		process.env.DEBUG = commander.log;
	}

	const id = await ExampleScenarioRunner.execRun(config);
	process.send?.(id);

	const scenarioLogger = await loggerP;
	await scenarioLogger.flush();

	process.exit(0);
}

main().catch((error) => {
	console.error(error);
	process.exit(-1);
});
