/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { ConnectionState } from "@fluidframework/container-loader";
import { IFluidContainer } from "@fluidframework/fluid-static";
import { PerformanceEvent } from "@fluidframework/telemetry-utils/internal";
import { timeoutPromise } from "@fluidframework/test-utils/internal";

import { ScenarioRunner } from "./ScenarioRunner.js";
import { IRunConfig, IScenarioConfig, IScenarioRunConfig } from "./interface.js";
import { getLogger } from "./logger.js";
import {
	createAzureClient,
	getScenarioRunnerTelemetryEventMap,
	loadInitialObjSchema,
} from "./utils.js";

const eventMap = getScenarioRunnerTelemetryEventMap("DocLoader");

export interface DocLoaderRunnerConfig extends IScenarioConfig {
	docIds: string[];
	clientStartDelayMs: number;
	numOfLoads?: number;
}

export interface DocLoaderRunConfig extends IScenarioRunConfig {
	docId: string;
}

export class DocLoaderRunner extends ScenarioRunner<
	DocLoaderRunnerConfig,
	DocLoaderRunConfig,
	void,
	IFluidContainer
> {
	protected runnerClientFilePath: string = "./lib/docLoaderRunnerClient.js";

	constructor(scenarioConfig: DocLoaderRunnerConfig) {
		super({
			...scenarioConfig,
			numClients: scenarioConfig.docIds.length,
			numRunsPerClient: scenarioConfig.numOfLoads,
		});
	}

	public static async execRun(runConfig: DocLoaderRunConfig): Promise<IFluidContainer> {
		let schema;
		const logger =
			runConfig.logger ??
			(await getLogger(
				{
					runId: runConfig.runId,
					scenarioName: runConfig.scenarioName,
					namespace: "scenario:runner:DocLoader",
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

		let container: IFluidContainer;
		try {
			({ container } = await PerformanceEvent.timedExecAsync(
				logger,
				{ eventName: "load" },
				async () => {
					return ac.getContainer(runConfig.docId, schema, "2");
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

		return container;
	}

	protected runCore(config: IRunConfig, info: { clientIndex: number }): DocLoaderRunConfig {
		return this.buildScenarioRunConfig(config, {
			childId: info.clientIndex,
			docId: this.scenarioConfig.docIds[info.clientIndex],
			isSync: false,
		});
	}

	protected async runSyncCore(
		config: IRunConfig,
		info: { clientIndex: number },
	): Promise<IFluidContainer> {
		return DocLoaderRunner.execRun(
			this.buildScenarioRunConfig(config, {
				childId: info.clientIndex,
				docId: this.scenarioConfig.docIds[info.clientIndex],
				isSync: true,
			}),
		);
	}

	protected buildScenarioRunConfig(
		runConfig: IRunConfig,
		options: { childId: number; docId: string; isSync?: boolean },
	): DocLoaderRunConfig {
		const scenarioRunConfig: DocLoaderRunConfig = {
			...runConfig,
			childId: options.childId,
			docId: options.docId,
			schema: this.scenarioConfig.schema,
			client: this.scenarioConfig.client,
		};
		if (!options.isSync) {
			delete scenarioRunConfig.logger;
			delete scenarioRunConfig.client;
		}
		return scenarioRunConfig;
	}

	protected description(): string {
		return `This stage loads a list of documents, given their IDs`;
	}
}
