/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */
import { ConnectionState } from "@fluidframework/container-loader";
import { SharedMap, type ISharedMap } from "@fluidframework/map";
import { AzureClient } from "@fluidframework/azure-client";
import { ContainerSchema, IFluidContainer } from "@fluidframework/fluid-static";
import { ITelemetryLoggerExt, PerformanceEvent } from "@fluidframework/telemetry-utils";
import { timeoutPromise } from "@fluidframework/test-utils";
import { v4 as uuid } from "uuid";

import { IRunConfig, IScenarioConfig, IScenarioRunConfig } from "./interface";
import {
	FluidSummarizerTelemetryEventNames,
	createAzureClient,
	delay,
	getScenarioRunnerTelemetryEventMap,
	loadInitialObjSchema,
} from "./utils";
import { getLogger, loggerP } from "./logger";
import { ScenarioRunner } from "./ScenarioRunner";

const eventMap = getScenarioRunnerTelemetryEventMap("NestedMap");

interface INestedMapConfig {
	numMaps: number;
	initialMapKey: string;
	dataType?: "uuid" | "number";
	writeRatePerMin?: number;
}

export interface NestedMapRunnerConfig extends IScenarioConfig, INestedMapConfig {
	clientStartDelayMs: number;
	docIds?: string[];
	containers?: IFluidContainer[];
}

export interface NestedMapRunConfig extends IScenarioRunConfig, INestedMapConfig {
	docId?: string;
	container?: IFluidContainer;
}

export class NestedMapRunner extends ScenarioRunner<
	NestedMapRunnerConfig,
	NestedMapRunConfig,
	string
> {
	protected runnerClientFilePath: string = "./dist/nestedMapRunnerClient.js";

	constructor(scenarioConfig: NestedMapRunnerConfig) {
		super({
			...scenarioConfig,
			numClients: scenarioConfig.docIds?.length,
		});
	}

	public static async execRun(runConfig: NestedMapRunConfig): Promise<string> {
		const logger =
			runConfig.logger ??
			(await getLogger(
				{
					runId: runConfig.runId,
					scenarioName: runConfig.scenarioName,
					namespace: "scenario:runner:NestedMap",
				},
				["scenario:runner"],
				eventMap,
			));

		const ac =
			runConfig.client ??
			(await createAzureClient({
				userId: `testUserId_${runConfig.childId}`,
				userName: `testUserName_${runConfig.childId}`,
				logger,
			}));

		const container: IFluidContainer = await NestedMapRunner.loadContainer(
			runConfig,
			logger,
			ac,
		);

		const writeRatePerMin = runConfig.writeRatePerMin ?? -1;
		const msBetweenWrites = writeRatePerMin < 0 ? 0 : 60000 / writeRatePerMin;
		let currentMap: ISharedMap = container.initialObjects[
			runConfig.initialMapKey
		] as ISharedMap;
		const tenPercent = Math.floor(runConfig.numMaps / 10);
		const getData = () => {
			const dataType = runConfig.dataType;
			if (dataType === "uuid") {
				return uuid();
			}
			return undefined;
		};
		for (let i = 0; i < runConfig.numMaps; i++) {
			await delay(msBetweenWrites);
			const nextMap = await container.create(SharedMap);
			currentMap.set("data", getData() ?? i);
			currentMap.set("next", nextMap.handle);
			currentMap = nextMap;
			if (i % tenPercent === 0) {
				const message = `${Math.floor((i / runConfig.numMaps) * 100)}% of ${
					runConfig.numMaps
				} written.`;
				logger.sendTelemetryEvent({
					eventName: "NestedMapProgress",
					category: "generic",
					message,
				});
				console.log(message);
			}
		}

		let id: string | undefined = runConfig.docId;
		if (!id) {
			try {
				id = await PerformanceEvent.timedExecAsync(
					logger,
					{ eventName: "attach" },
					async () => {
						return container.attach();
					},
					{ start: true, end: true, cancel: "generic" },
				);
			} catch {
				throw new Error("Unable to attach container.");
			}
		}

		await PerformanceEvent.timedExecAsync(
			logger,
			{ eventName: "Summarize", clientId: runConfig.childId },
			async (_event) => {
				const scenarioLogger = await loggerP;
				await timeoutPromise(
					(resolve) =>
						scenarioLogger.events.once(
							FluidSummarizerTelemetryEventNames.Summarize,
							() => resolve(),
						),
					{
						durationMs: 600000,
						errorMsg: "summarize timeout",
					},
				);
			},
			{ start: true, end: true, cancel: "generic" },
		);

		return id;
	}

	private static async loadContainer(
		runConfig: NestedMapRunConfig,
		logger: ITelemetryLoggerExt,
		client: AzureClient,
	): Promise<IFluidContainer> {
		if (runConfig.container !== undefined) {
			return runConfig.container;
		}

		let schema: ContainerSchema;
		try {
			schema = loadInitialObjSchema(runConfig.schema);
		} catch {
			throw new Error("Invalid schema provided.");
		}

		let container: IFluidContainer;
		if (runConfig.docId) {
			const docId: string = runConfig.docId;
			try {
				({ container } = await PerformanceEvent.timedExecAsync(
					logger,
					{ eventName: "load" },
					async () => {
						return client.getContainer(docId, schema);
					},
					{ start: true, end: true, cancel: "generic" },
				));
			} catch {
				throw new Error("Unable to load container.");
			}

			await PerformanceEvent.timedExecAsync(
				logger,
				{ eventName: "connected" },
				async () => {
					if (container.connectionState !== ConnectionState.Connected) {
						return timeoutPromise(
							(resolve) => container.once("connected", () => resolve()),
							{
								durationMs: 60000,
								errorMsg: "container connect() timeout",
							},
						);
					}
				},
				{ start: true, end: true, cancel: "generic" },
			);
		} else {
			try {
				({ container } = await PerformanceEvent.timedExecAsync(
					logger,
					{ eventName: "create" },
					async () => {
						return client.createContainer(schema);
					},
					{ start: true, end: true, cancel: "generic" },
				));
			} catch (error) {
				throw new Error(`Unable to create container. ${error}`);
			}
		}

		return container;
	}

	protected runCore(config: IRunConfig, info: { clientIndex: number }): NestedMapRunConfig {
		return this.buildScenarioRunConfig(config, {
			childId: info.clientIndex,
			docId: (this.scenarioConfig.docIds ?? [])[info.clientIndex],
			container: (this.scenarioConfig.containers ?? [])[info.clientIndex],
			isSync: false,
		});
	}
	protected async runSyncCore(
		config: IRunConfig,
		info: { clientIndex: number },
	): Promise<string> {
		return NestedMapRunner.execRun(
			this.buildScenarioRunConfig(config, {
				childId: info.clientIndex,
				docId: (this.scenarioConfig.docIds ?? [])[info.clientIndex],
				container: (this.scenarioConfig.containers ?? [])[info.clientIndex],
				isSync: false,
			}),
		);
	}

	protected buildScenarioRunConfig(
		runConfig: IRunConfig,
		options: {
			childId: number;
			docId?: string;
			container?: IFluidContainer;
			isSync?: boolean;
		},
	): NestedMapRunConfig {
		const scenarioRunConfig: NestedMapRunConfig = {
			...runConfig,
			childId: options.childId,
			docId: options.docId,
			numMaps: this.scenarioConfig.numMaps,
			dataType: this.scenarioConfig.dataType ?? "number",
			writeRatePerMin: this.scenarioConfig.writeRatePerMin ?? -1,
			initialMapKey: this.scenarioConfig.initialMapKey,
			schema: this.scenarioConfig.schema,
			client: this.scenarioConfig.client,
			container: options.container,
		};
		if (!options.isSync) {
			delete scenarioRunConfig.logger;
			delete scenarioRunConfig.client;
			delete scenarioRunConfig.container;
		}
		return scenarioRunConfig;
	}

	protected description(): string {
		return `This generates nested SharedMaps.`;
	}
}
