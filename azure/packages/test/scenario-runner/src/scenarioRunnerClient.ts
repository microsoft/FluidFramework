/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { DocCreatorRunConfig, DocCreatorRunner } from "./DocCreatorRunner.js";
import { DocLoaderRunConfig, DocLoaderRunner } from "./DocLoaderRunner.js";
import { MapTrafficRunConfig, MapTrafficRunner } from "./MapTrafficRunner.js";
import { NestedMapRunConfig, NestedMapRunner } from "./NestedMapRunner.js";
import { ChildRunner, ContainerFactorySchema } from "./interface.js";
import { loggerP } from "./logger.js";
import { commanderParseIntArg, getCommander } from "./utils.js";

const scenarioRunnerName = process.argv[2];
const scenarioRunners: Record<string, ChildRunner> = {
	[DocLoaderRunner.name]: (program) => {
		program
			.requiredOption("-s, --schema <schema>", "Container Schema")
			.requiredOption("-d, --docId <docId>", "Document id");
		return async (opts): Promise<void> => {
			const config: DocLoaderRunConfig = {
				runId: opts.runId,
				scenarioName: opts.scenarioName,
				childId: opts.childId,
				docId: opts.docId,
				schema: JSON.parse(opts.schema) as ContainerFactorySchema,
			};
			await DocLoaderRunner.execRun(config);
		};
	},
	[DocCreatorRunner.name]: (program) => {
		program.requiredOption("-s, --schema <schema>", "Container Schema");
		return async (opts): Promise<void> => {
			const config: DocCreatorRunConfig = {
				runId: opts.runId,
				scenarioName: opts.scenarioName,
				childId: opts.childId,
				schema: JSON.parse(opts.schema) as ContainerFactorySchema,
			};
			const id = await DocCreatorRunner.execRun(config);
			process.send?.(id);
		};
	},
	[MapTrafficRunner.name]: (program) => {
		program
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
			.requiredOption("-k, --sharedMapKey <sharedMapKey>", "Shared map location");
		return async (opts): Promise<void> => {
			const config: MapTrafficRunConfig = {
				runId: opts.runId,
				scenarioName: opts.scenarioName,
				childId: opts.childId,
				docId: opts.docId,
				writeRatePerMin: opts.writeRatePerMin,
				totalWriteCount: opts.totalWriteCount,
				sharedMapKey: opts.sharedMapKey,
				schema: JSON.parse(opts.schema) as ContainerFactorySchema,
			};
			if (config.docId === undefined) {
				console.error("Missing --docId argument needed to run child process");
				process.exit(-1);
			}
			await MapTrafficRunner.execRun(config);
		};
	},
	[NestedMapRunner.name]: (program) => {
		program
			.requiredOption("-s, --schema <schema>", "Container Schema")
			.requiredOption("-n, --numMaps <numMaps>", "Number of nested maps")
			.requiredOption("-k, --initialMapKey <initialMapKey>", "Key of initial map to nest from")
			.option("-d, --docId <docId>", "Document id")
			.option(
				"-wr, --writeRatePerMin <writeRatePerMin>",
				"Rate of writes",
				commanderParseIntArg,
			)
			.option("-dt, --dataType <dataType>", "uuid or number, stored as value in each map");
		return async (opts): Promise<void> => {
			const config: NestedMapRunConfig = {
				runId: opts.runId,
				scenarioName: opts.scenarioName,
				childId: opts.childId,
				schema: JSON.parse(opts.schema) as ContainerFactorySchema,
				numMaps: opts.numMaps,
				docId: opts.docId,
				dataType: opts.dataType,
				initialMapKey: opts.initialMapKey,
				writeRatePerMin: opts.writeRatePerMin,
			};
			await NestedMapRunner.execRun(config);
		};
	},
};

async function main() {
	const program = getCommander();
	const runner = scenarioRunners[scenarioRunnerName](program);
	program.parse(process.argv);
	const opts = program.opts();

	if (opts.log !== undefined) {
		process.env.DEBUG = opts.log;
	}

	await runner(opts);

	const scenarioLogger = await loggerP;
	await scenarioLogger.flush();

	process.exit(0);
}

main().catch((error) => {
	console.error(error);
	process.exit(-1);
});
