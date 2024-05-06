/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { SharedMap } from "@fluidframework/map/internal";
import { PerformanceEvent } from "@fluidframework/telemetry-utils/internal";
import { timeoutPromise } from "@fluidframework/test-utils/internal";
import { v4 as uuid } from "uuid";

import { ScenarioRunner } from "./ScenarioRunner.js";
import { IRunConfig, IScenarioConfig, IScenarioRunConfig } from "./interface.js";
import { getLogger } from "./logger.js";
import {
	createAzureClient,
	delay,
	getScenarioRunnerTelemetryEventMap,
	loadInitialObjSchema,
} from "./utils.js";

// This was originally namespaced as "DocLoader"
const eventMap = getScenarioRunnerTelemetryEventMap("MapTraffic");

interface IMapTrafficConfig {
	docId: string;
	writeRatePerMin: number;
	totalWriteCount: number;
	sharedMapKey: string;
}

export type MapTrafficRunnerConfig = IScenarioConfig & IMapTrafficConfig;
export type MapTrafficRunConfig = IScenarioRunConfig & IMapTrafficConfig;

export class MapTrafficRunner extends ScenarioRunner<
	MapTrafficRunnerConfig,
	MapTrafficRunConfig,
	void
> {
	protected runnerClientFilePath: string = "./lib/mapTrafficRunnerClient.js";

	public static async execRun(runConfig: MapTrafficRunConfig): Promise<void> {
		let schema;
		const logger =
			runConfig.logger ??
			(await getLogger(
				{
					runId: runConfig.runId,
					scenarioName: runConfig.scenarioName,
					namespace: "scenario:runner:MapTraffic",
				},
				["scenario:runner"],
				eventMap,
			));

		const ac =
			runConfig.client ??
			(await createAzureClient({
				id: `testUserId_${runConfig.childId}`,
				name: `testUserName_${runConfig.childId}`,
				logger,
			}));

		try {
			schema = loadInitialObjSchema(runConfig.schema);
		} catch {
			throw new Error("Invalid schema provided.");
		}

		const { container } = await PerformanceEvent.timedExecAsync(
			logger,
			{ eventName: "ContainerLoad", clientId: runConfig.childId },
			async (_event) => {
				return ac.getContainer(runConfig.docId, schema, "2");
			},
			{ start: true, end: true, cancel: "generic" },
		);

		const msBetweenWrites = 60000 / runConfig.writeRatePerMin;
		const initialObjectsCreate = container.initialObjects;
		const map = initialObjectsCreate[runConfig.sharedMapKey] as SharedMap;

		for (let i = 0; i < runConfig.totalWriteCount; i++) {
			await delay(msBetweenWrites);
			// console.log(`Simulating write ${i} for client ${config.runId}`)
			map.set(uuid(), "test-value");
		}

		await PerformanceEvent.timedExecAsync(
			logger,
			{ eventName: "Catchup", clientId: runConfig.childId },
			async (_event) => {
				await timeoutPromise((resolve) => container.once("saved", () => resolve()), {
					durationMs: 20000,
					errorMsg: "datastoreSaveAfterAttach timeout",
				});
			},
			{ start: true, end: true, cancel: "generic" },
		);
	}

	protected runCore(config: IRunConfig, info: { clientIndex: number }): MapTrafficRunConfig {
		return this.buildScenarioRunConfig(config, {
			childId: info.clientIndex,
			isSync: false,
		});
	}

	protected async runSyncCore(config: IRunConfig, info: { clientIndex: number }): Promise<void> {
		return MapTrafficRunner.execRun(
			this.buildScenarioRunConfig(config, { childId: info.clientIndex, isSync: true }),
		);
	}
	protected buildScenarioRunConfig(
		runConfig: IRunConfig,
		options: { childId: number; isSync?: boolean },
	): MapTrafficRunConfig {
		const scenarioRunConfig: MapTrafficRunConfig = {
			...runConfig,
			childId: options.childId,
			docId: this.scenarioConfig.docId,
			schema: this.scenarioConfig.schema,
			totalWriteCount: this.scenarioConfig.totalWriteCount,
			writeRatePerMin: this.scenarioConfig.writeRatePerMin,
			sharedMapKey: this.scenarioConfig.sharedMapKey,
			client: this.scenarioConfig.client,
		};
		if (!options.isSync) {
			delete scenarioRunConfig.logger;
			delete scenarioRunConfig.client;
		}
		return scenarioRunConfig;
	}

	protected description(): string {
		return `This stage runs SharedMap traffic on multiple clients.`;
	}
}
