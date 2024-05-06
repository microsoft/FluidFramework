/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { ChildProcess } from "child_process";

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

const eventMap = getScenarioRunnerTelemetryEventMap("DocCreator");

export interface DocCreatorRunnerConfig extends IScenarioConfig {
	numDocs: number;
	clientStartDelayMs: number;
}

export type DocCreatorRunConfig = IScenarioRunConfig;

export class DocCreatorRunner extends ScenarioRunner<
	DocCreatorRunnerConfig,
	DocCreatorRunConfig,
	string
> {
	protected runnerClientFilePath: string = "./lib/docCreatorRunnerClient.js";

	constructor(scenarioConfig: DocCreatorRunnerConfig) {
		super({
			...scenarioConfig,
			numClients: scenarioConfig.numDocs,
		});
	}

	public static async execRun(runConfig: DocCreatorRunConfig): Promise<string> {
		let schema;
		const logger =
			runConfig.logger ??
			(await getLogger(
				{
					runId: runConfig.runId,
					scenarioName: runConfig.scenarioName,
					namespace: "scenario:runner:DocCreator",
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
				{ eventName: "create" },
				async () => {
					return ac.createContainer(schema, "2");
				},
				{ start: true, end: true, cancel: "generic" },
			));
		} catch (error) {
			throw new Error(`Unable to create container. ${error}`);
		}

		let id: string;
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

		return id;
	}

	protected runCore(config: IRunConfig, info: { clientIndex: number }): DocCreatorRunConfig {
		return this.buildScenarioRunConfig(config, {
			childId: info.clientIndex,
			isSync: false,
		});
	}

	protected async runSyncCore(
		config: IRunConfig,
		info: { clientIndex: number },
	): Promise<string> {
		return DocCreatorRunner.execRun(
			this.buildScenarioRunConfig(config, { childId: info.clientIndex, isSync: true }),
		);
	}

	protected buildScenarioRunConfig(
		runConfig: IRunConfig,
		options: { childId: number; isSync?: boolean },
	): DocCreatorRunConfig {
		const scenarioRunConfig: DocCreatorRunConfig = {
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
		return `This stage creates empty document for the given schema.`;
	}

	protected additionalChildProcessSetup(runnerProcess: ChildProcess): void {
		runnerProcess.stdout?.once("data", (data) => {
			this.childResults.push(String(data));
		});

		runnerProcess.on("message", (id) => {
			this.childResults.push(String(id));
		});
	}
}
