/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { PerformanceEvent } from "@fluidframework/telemetry-utils";

import { IRunConfig, IScenarioConfig, IScenarioRunConfig } from "../interface";
import {
	createAzureClient,
	getScenarioRunnerTelemetryEventMap,
	loadInitialObjSchema,
} from "../utils";
import { getLogger } from "../logger";
import { ScenarioRunner } from "../ScenarioRunner";

const eventMap = getScenarioRunnerTelemetryEventMap("ExampleScenario");

export type ExampleScenarioRunnerConfig = IScenarioConfig;
export type ExampleScenarioRunConfig = IScenarioRunConfig;

export class ExampleScenarioRunner extends ScenarioRunner<
	ExampleScenarioRunnerConfig,
	ExampleScenarioRunConfig,
	void
> {
	protected runnerClientFilePath: string = "./dist/template/exampleScenarioRunnerClient.js";

	public static async execRun(runConfig: ExampleScenarioRunConfig): Promise<void> {
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
				userId: `testUserId_${runConfig.childId}`,
				userName: `testUserName_${runConfig.childId}`,
				logger,
			}));

		try {
			schema = loadInitialObjSchema(runConfig.schema);
		} catch {
			throw new Error("Invalid schema provided.");
		}

		try {
			await PerformanceEvent.timedExecAsync(
				logger,
				{ eventName: "load" },
				async () => {
					return ac.createContainer(schema);
				},
				{ start: true, end: true, cancel: "generic" },
			);
		} catch {
			throw new Error("Unable to load container.");
		}
	}

	protected runCore(config: IRunConfig, info: { clientIndex: number }): ExampleScenarioRunConfig {
		return this.buildScenarioRunConfig(config, {
			childId: info.clientIndex,
			isSync: false,
		});
	}

	protected async runSyncCore(config: IRunConfig, info: { clientIndex: number }): Promise<void> {
		return ExampleScenarioRunner.execRun(
			this.buildScenarioRunConfig(config, { childId: info.clientIndex, isSync: true }),
		);
	}

	protected buildScenarioRunConfig(
		runConfig: IRunConfig,
		options: { childId: number; isSync?: boolean | undefined },
	): ExampleScenarioRunConfig {
		const scenarioRunConfig: ExampleScenarioRunConfig = {
			...runConfig,
			childId: options.childId,
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
		return "This stage runs an example scenario.";
	}
}
