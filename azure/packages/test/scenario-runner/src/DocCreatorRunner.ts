/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */
import child_process from "child_process";

import { ConnectionState } from "@fluidframework/container-loader";
import { AzureClient } from "@fluidframework/azure-client";
import { TypedEventEmitter } from "@fluidframework/common-utils";
import { PerformanceEvent } from "@fluidframework/telemetry-utils";
import { IFluidContainer } from "@fluidframework/fluid-static";
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

const eventMap = getScenarioRunnerTelemetryEventMap("DocCreator");

export interface DocCreatorRunnerConfig {
	connectionConfig: AzureClientConnectionConfig;
	schema: ContainerFactorySchema;
	numDocs: number;
	clientStartDelayMs: number;
	client?: AzureClient;
}

export interface DocCreatorRunnerRunConfig
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
	region?: string;
	client?: AzureClient;
}

export class DocCreatorRunner extends TypedEventEmitter<IRunnerEvents> implements IRunner {
	private status: RunnnerStatus = "notStarted";
	private readonly docIds: string[] = [];
	constructor(public readonly c: DocCreatorRunnerConfig) {
		super();
	}

	public async run(config: IRunConfig): Promise<string | string[] | undefined> {
		this.status = "running";

		const r = await this.spawnChildRunners(config);
		this.status = "success";
		return r;
	}

	private async spawnChildRunners(config: IRunConfig): Promise<string | string[] | undefined> {
		this.status = "running";
		const runnerArgs: string[][] = [];
		for (let i = 0; i < this.c.numDocs; i++) {
			const connection = this.c.connectionConfig;
			const childArgs: string[] = [
				"./dist/docCreatorRunnerClient.js",
				"--runId",
				config.runId,
				"--scenarioName",
				config.scenarioName,
				"--childId",
				i.toString(),
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
		for (const runnerArg of runnerArgs) {
			try {
				children.push(this.createChild(runnerArg));
			} catch {
				throw new Error("Failed to spawn child");
			}
			await delay(this.c.clientStartDelayMs);
		}

		try {
			await Promise.all(children);
		} catch (error) {
			throw new Error(`Not all clients closed successfully.\n${error}`);
		}

		return this.docIds;
	}

	public async runSync(config: IRunConfig): Promise<string | string[] | undefined> {
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
		const runs: Promise<string>[] = [];
		for (let i = 0; i < this.c.numDocs; i++) {
			runs.push(
				DocCreatorRunner.execRun({
					...config,
					childId: i,
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
		try {
			const ids = await Promise.all(runs);
			this.status = "success";
			return ids;
		} catch (error) {
			this.status = "error";
			throw new Error(`Not all clients closed successfully.\n${error}`);
		}
	}

	public static async execRun(runConfig: DocCreatorRunnerRunConfig): Promise<string> {
		let schema;
		const logger =
			runConfig.logger ??
			(await getLogger(
				{
					runId: runConfig.runId,
					scenarioName: runConfig.scenarioName,
					namespace: "scenario:runner:DocCreator",
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
				{ eventName: "create" },
				async () => {
					return ac.createContainer(schema);
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

	public stop(): void {}

	public getStatus(): IRunnerStatus {
		return {
			status: this.status,
			description: this.description(),
			details: {},
		};
	}

	private description(): string {
		return `This stage creates empty document for the given schema.`;
	}

	private async createChild(childArgs: string[]): Promise<boolean> {
		const envVar = { ...process.env };
		const runnerProcess = child_process.spawn("node", childArgs, {
			stdio: ["inherit", "inherit", "inherit", "ipc"],
			env: envVar,
		});

		runnerProcess.stdout?.once("data", (data) => {
			this.docIds.push(String(data));
		});

		runnerProcess.on("message", (id) => {
			this.docIds.push(String(id));
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
