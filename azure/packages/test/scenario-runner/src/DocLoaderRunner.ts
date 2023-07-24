/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */
import child_process from "child_process";

import { ConnectionState } from "@fluidframework/container-loader";
import { TypedEventEmitter } from "@fluidframework/common-utils";
import { IFluidContainer } from "@fluidframework/fluid-static";
import { PerformanceEvent } from "@fluidframework/telemetry-utils";
import { timeoutPromise } from "@fluidframework/test-utils";

import {
	IRunConfig,
	IRunner,
	IRunnerEvents,
	IRunnerStatus,
	IScenarioConfig,
	IScenarioRunConfig,
	RunnnerStatus,
} from "./interface";
import {
	convertConfigToScriptParams,
	createAzureClient,
	delay,
	getScenarioRunnerTelemetryEventMap,
	loadInitialObjSchema,
} from "./utils";
import { getLogger } from "./logger";

const eventMap = getScenarioRunnerTelemetryEventMap("DocLoader");

export interface DocLoaderRunnerConfig extends IScenarioConfig {
	docIds: string[];
	clientStartDelayMs: number;
	numOfLoads?: number;
}

export interface DocLoaderRunConfig extends IScenarioRunConfig {
	docId: string;
}

export class DocLoaderRunner extends TypedEventEmitter<IRunnerEvents> implements IRunner {
	private status: RunnnerStatus = "notStarted";
	constructor(public readonly c: DocLoaderRunnerConfig) {
		super();
	}

	public async run(config: IRunConfig): Promise<void> {
		this.status = "running";
		await this.spawnChildRunners(config);
		this.status = "success";
	}

	private async spawnChildRunners(config: IRunConfig): Promise<void> {
		this.status = "running";
		const runnerArgs: string[][] = [];
		let i = 0;
		for (const docId of this.c.docIds) {
			const childArgs: string[] = [
				"./dist/docLoaderRunnerClient.js",
				...convertConfigToScriptParams<DocLoaderRunConfig>(
					this.buildScenarioRunConfig(config, { childId: i++, docId }),
				),
				"--verbose",
			];
			runnerArgs.push(childArgs);
		}

		const children: Promise<boolean>[] = [];
		const numOfLoads = this.c.numOfLoads ?? 1;
		for (let j = 0; j < numOfLoads; j++) {
			for (const runnerArg of runnerArgs) {
				try {
					children.push(this.createChild(runnerArg));
				} catch {
					throw new Error("Failed to spawn child");
				}
				await delay(this.c.clientStartDelayMs);
			}
		}

		try {
			await Promise.all(children);
		} catch {
			throw new Error("Not all clients closed successfully");
		}
	}

	public async runSync(config: IRunConfig): Promise<IFluidContainer[]> {
		this.status = "running";
		let i = 0;
		const runs: Promise<IFluidContainer>[] = [];
		const numOfLoads = this.c.numOfLoads ?? 1;
		for (let j = 0; j < numOfLoads; j++) {
			for (const docId of this.c.docIds) {
				runs.push(
					DocLoaderRunner.execRun(
						this.buildScenarioRunConfig(config, { childId: i++, docId, isSync: true }),
					),
				);
			}
		}
		try {
			const containers = await Promise.all(runs);
			this.status = "success";
			return containers;
		} catch {
			this.status = "error";
			throw new Error("Not all clients closed succesfully.");
		}
	}

	private buildScenarioRunConfig(
		runConfig: IRunConfig,
		options: { childId: number; docId: string; isSync?: boolean },
	): DocLoaderRunConfig {
		const scenarioRunConfig: DocLoaderRunConfig = {
			...runConfig,
			childId: options.childId,
			docId: options.docId,
			schema: this.c.schema,
			client: this.c.client,
		};
		if (!options.isSync) {
			delete scenarioRunConfig.logger;
			delete scenarioRunConfig.client;
		}
		return scenarioRunConfig;
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
				userId: `testUserId_${runConfig.childId}`,
				userName: `testUserName_${runConfig.childId}`,
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
					return ac.getContainer(runConfig.docId, schema);
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

	public stop(): void {}

	public getStatus(): IRunnerStatus {
		return {
			status: this.status,
			description: this.description(),
			details: {},
		};
	}

	private description(): string {
		return `This stage loads a list of documents, given their IDs`;
	}

	private async createChild(childArgs: string[]): Promise<boolean> {
		const envVar = { ...process.env };
		const runnerProcess = child_process.spawn("node", childArgs, {
			stdio: ["inherit", "inherit", "inherit", "ipc"],
			env: envVar,
		});

		return new Promise((resolve, reject) =>
			runnerProcess.once("close", (status) => {
				if (status === 0) {
					resolve(true);
				} else {
					reject(new Error("Client failed to complete the tests sucesfully."));
				}
			}),
		);
	}
}
