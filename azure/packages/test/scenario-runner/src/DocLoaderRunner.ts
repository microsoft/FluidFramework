/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */
import child_process from "child_process";

import { ConnectionState } from "@fluidframework/container-loader";
import { AzureClient } from "@fluidframework/azure-client";
import { TypedEventEmitter } from "@fluidframework/common-utils";
import { IFluidContainer } from "@fluidframework/fluid-static";
import { PerformanceEvent } from "@fluidframework/telemetry-utils";
import { timeoutPromise } from "@fluidframework/test-utils";

import {
	AzureClientConnectionConfig,
	ContainerFactorySchema,
	IRunConfig,
	IRunner,
	IRunnerEvents,
	IRunnerStatus,
	RunnnerStatus,
} from "./interface";
import {
	AzureClientConfig,
	createAzureClient,
	delay,
	getScenarioRunnerTelemetryEventMap,
	loadInitialObjSchema,
} from "./utils";
import { getLogger } from "./logger";

const eventMap = getScenarioRunnerTelemetryEventMap("DocLoader");

export interface DocLoaderRunnerConfig {
	connectionConfig: AzureClientConnectionConfig;
	schema: ContainerFactorySchema;
	docIds: string[];
	clientStartDelayMs: number;
	numOfLoads?: number;
	client?: AzureClient;
}

export interface DocLoaderRunnerRunConfig
	extends IRunConfig,
		Pick<
			AzureClientConfig,
			| "connType"
			| "connEndpoint"
			| "tenantId"
			| "tenantKey"
			| "functionUrl"
			| "secureTokenProvider"
		> {
	childId: number;
	schema: ContainerFactorySchema;
	docId: string;
	region?: string;
	client?: AzureClient;
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
			const connection = this.c.connectionConfig;
			const childArgs: string[] = [
				"./dist/docLoaderRunnerClient.js",
				"--runId",
				config.runId,
				"--scenarioName",
				config.scenarioName,
				"--childId",
				(i++).toString(),
				"--docId",
				docId,
				"--schema",
				JSON.stringify(this.c.schema),
				"--connType",
				connection.type,
				...(connection.endpoint ? ["--connEndpoint", connection.endpoint] : []),
				...(connection.useSecureTokenProvider ? ["--secureTokenProvider"] : []),
				...(connection.region ? ["--region", connection.region] : []),
			];
			childArgs.push("--verbose");
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
		const connection = this.c.connectionConfig;
		const connType = connection.type;
		const connEndpoint = connection.endpoint;
		const tenantId = connection.tenantId;
		const tenantKey = connection.key;
		const functionUrl = connection.functionUrl;
		const secureTokenProvider = connection.useSecureTokenProvider;
		const schema = this.c.schema;
		const client = this.c.client;
		let i = 0;
		const runs: Promise<IFluidContainer>[] = [];
		const numOfLoads = this.c.numOfLoads ?? 1;
		for (let j = 0; j < numOfLoads; j++) {
			for (const docId of this.c.docIds) {
				runs.push(
					DocLoaderRunner.execRun({
						...config,
						childId: i++,
						docId,
						connType,
						connEndpoint,
						tenantId,
						tenantKey,
						functionUrl,
						secureTokenProvider,
						schema,
						client,
					}),
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

	public static async execRun(runConfig: DocLoaderRunnerRunConfig): Promise<IFluidContainer> {
		let schema;
		const logger =
			runConfig.logger ??
			(await getLogger(
				{
					runId: runConfig.runId,
					scenarioName: runConfig.scenarioName,
					namespace: "scenario:runner:DocLoader",
					endpoint: runConfig.connEndpoint,
					region: runConfig.region,
				},
				["scenario:runner"],
				eventMap,
			));

		const ac =
			runConfig.client ??
			(await createAzureClient({
				userId: `testUserId_${runConfig.childId}`,
				userName: `testUserName_${runConfig.childId}`,
				connType: runConfig.connType,
				connEndpoint: runConfig.connEndpoint,
				tenantId: runConfig.tenantId,
				tenantKey: runConfig.tenantKey,
				functionUrl: runConfig.functionUrl,
				secureTokenProvider: runConfig.secureTokenProvider,
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
