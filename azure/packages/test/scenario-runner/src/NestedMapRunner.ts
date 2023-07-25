/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */
import child_process from "child_process";

import { ConnectionState } from "@fluidframework/container-loader";
import { SharedMap } from "@fluidframework/map";
import { ITelemetryLogger } from "@fluidframework/core-interfaces";
import { AzureClient } from "@fluidframework/azure-client";
import { TypedEventEmitter } from "@fluidframework/common-utils";
import { ContainerSchema, IFluidContainer } from "@fluidframework/fluid-static";
import { PerformanceEvent } from "@fluidframework/telemetry-utils";
import { timeoutPromise } from "@fluidframework/test-utils";
import { v4 as uuid } from "uuid";

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
	FluidSummarizerTelemetryEventNames,
	createAzureClient,
	delay,
	getScenarioRunnerTelemetryEventMap,
	loadInitialObjSchema,
} from "./utils";
import { getLogger, loggerP } from "./logger";

const eventMap = getScenarioRunnerTelemetryEventMap("NestedMap");

export interface NestedMapRunnerConfig {
	connectionConfig: AzureClientConnectionConfig;
	schema: ContainerFactorySchema;
	clientStartDelayMs: number;
	numMaps: number;
	initialMapKey: string;
	dataType?: "uuid" | "number";
	writeRatePerMin?: number;
	docIds?: string[];
	client?: AzureClient;
	containers?: IFluidContainer[];
}

export interface NestedMapRunnerRunConfig
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
	numMaps: number;
	initialMapKey: string;
	dataType?: "uuid" | "number";
	writeRatePerMin?: number;
	docId?: string;
	container?: IFluidContainer;
	region?: string;
	client?: AzureClient;
}

export class NestedMapRunner extends TypedEventEmitter<IRunnerEvents> implements IRunner {
	private status: RunnnerStatus = "notStarted";
	constructor(public readonly c: NestedMapRunnerConfig) {
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
		const createRunnerArg = (childId: number, docId?: string): string[] => {
			const connection = this.c.connectionConfig;
			const childArgs: string[] = [
				"./dist/docLoaderRunnerClient.js",
				"--runId",
				config.runId,
				"--scenarioName",
				config.scenarioName,
				"--childId",
				childId.toString(),
				"--numMaps",
				this.c.numMaps.toString(),
				"--writeRatePerMin",
				(this.c.writeRatePerMin ?? -1).toString(),
				"--dataType",
				this.c.dataType ?? "number",
				"--initialMapKey",
				this.c.initialMapKey,
				"--schema",
				JSON.stringify(this.c.schema),
				"--connType",
				connection.type,
				...(connection.endpoint ? ["--connEndpoint", connection.endpoint] : []),
				...(connection.useSecureTokenProvider ? ["--secureTokenProvider"] : []),
				...(connection.region ? ["--region", connection.region] : []),
			];
			if (docId) {
				childArgs.push("--docId", docId);
			}
			childArgs.push("--verbose");
			return childArgs;
		};
		if (this.c.docIds) {
			let i = 0;
			for (const docId of this.c.docIds) {
				runnerArgs.push(createRunnerArg(i++, docId));
			}
		} else {
			runnerArgs.push(createRunnerArg(0));
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
		} catch {
			throw new Error("Not all clients closed successfully");
		}
	}

	public async runSync(config: IRunConfig): Promise<string[]> {
		this.status = "running";
		const connection = this.c.connectionConfig;
		const connType = connection.type;
		const connEndpoint = connection.endpoint;
		const tenantId = connection.tenantId;
		const tenantKey = connection.key;
		const functionUrl = connection.functionUrl;
		const secureTokenProvider = connection.useSecureTokenProvider;
		const numMaps = this.c.numMaps;
		const dataType = this.c.dataType ?? "number";
		const writeRatePerMin = this.c.writeRatePerMin;
		const schema = this.c.schema;
		const client = this.c.client;
		const containers = this.c.containers;
		const docIds = this.c.docIds;
		const initialMapKey = this.c.initialMapKey;
		if (containers !== undefined && containers.length !== docIds?.length) {
			throw new Error("Number of containers not equal to number of docIds");
		}
		const runs: Promise<string>[] = [];
		const createRun = async (
			childId: number,
			docId?: string,
			container?: IFluidContainer,
		): Promise<string> => {
			return NestedMapRunner.execRun({
				...config,
				childId,
				docId,
				numMaps,
				dataType,
				writeRatePerMin,
				initialMapKey,
				connType,
				connEndpoint,
				tenantId,
				tenantKey,
				functionUrl,
				secureTokenProvider,
				schema,
				client,
				container,
			});
		};
		if (docIds) {
			for (let i = 0; i < docIds.length; i++) {
				const docId = docIds[i];
				const container = containers ? containers[i] : undefined;
				runs.push(createRun(i, docId, container));
				await delay(this.c.clientStartDelayMs);
			}
		} else {
			runs.push(createRun(0));
		}
		try {
			const resultDocIds = await Promise.all(runs);
			this.status = "success";
			return resultDocIds;
		} catch (error) {
			this.status = "error";
			throw new Error(`Not all clients closed succesfully.\n${error}`);
		}
	}

	public static async execRun(runConfig: NestedMapRunnerRunConfig): Promise<string> {
		const logger =
			runConfig.logger ??
			(await getLogger(
				{
					runId: runConfig.runId,
					scenarioName: runConfig.scenarioName,
					namespace: "scenario:runner:NestedMap",
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

		const container: IFluidContainer = await NestedMapRunner.loadContainer(
			runConfig,
			logger,
			ac,
		);

		const writeRatePerMin = runConfig.writeRatePerMin ?? -1;
		const msBetweenWrites = writeRatePerMin < 0 ? 0 : 60000 / writeRatePerMin;
		let currentMap: SharedMap = container.initialObjects[runConfig.initialMapKey] as SharedMap;
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
		runConfig: NestedMapRunnerRunConfig,
		logger: ITelemetryLogger,
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
